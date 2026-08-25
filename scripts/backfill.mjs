#!/usr/bin/env node
// 채권 D1 데이터베이스 초기 백필 CLI. 무의존성(Node 24.18.0 표준 라이브러리만 사용).
//
// 사용법:
//   node scripts/backfill.mjs discover-range                 시세 API 보존 한계 자동 탐지
//   node scripts/backfill.mjs fetch issu  --bas-dt 20260820   기본정보 전량 수집(원본만, D1 미적재)
//   node scripts/backfill.mjs fetch price [--from Y] [--to Y] 시세 월단위 수집(원본만, D1 미적재)
//   node scripts/backfill.mjs build-sql --source issu|price   원본 → .sql 파일 생성(D1 미적재)
//   node scripts/backfill.mjs apply --source issu|price [--remote|--local] [--budget 90000]
//   node scripts/backfill.mjs status                          진행 상황 요약
//
// fetch(네트워크·API 일일 쿼터)와 apply(D1 write 일일 한도)를 분리했다 — 한쪽이 한도에
// 걸려도 다른 쪽을 다시 안 돌린다. 모든 단계는 .backfill/state.json에 진행 상황을 원자적으로
// 기록하므로 어느 단계에서 죽어도 같은 명령을 다시 치면 이어서 간다.
//
// 자세한 설계 근거는 /Users/cookie/.claude/plans/fancy-jingling-squid.md §6 참고.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadServiceKey } from "./lib/env.mjs";
import { readDatabaseName, WRANGLER_ENV } from "./lib/wrangler-config.mjs";
import {
  fetchPage,
  ISSU_BASE_URL,
  ISSU_OPERATION,
  PRICE_BASE_URL,
  PRICE_OPERATION,
  MIN_CALL_INTERVAL_MS,
  sleep,
} from "./lib/api-client.mjs";
import { buildBondRow, buildBondStateRow, buildBondPriceRow, mapBondCodeLabels } from "./lib/mappers.mjs";
import { BOND_COLUMNS, BOND_STATE_COLUMNS, BOND_PRICE_COLUMNS, CODE_LABEL_COLUMNS } from "./lib/columns.mjs";
import { buildMultiValuesInsert } from "./lib/sql-gen.mjs";

const BACKFILL_DIR = path.join(PROJECT_ROOT, ".backfill");
const RAW_DIR = path.join(BACKFILL_DIR, "raw");
const SQL_DIR = path.join(BACKFILL_DIR, "sql");
const STATE_FILE = path.join(BACKFILL_DIR, "state.json");

// ---------------------------------------------------------------------------
// state.json — 원자적 읽기/쓰기
// ---------------------------------------------------------------------------

function loadState() {
  mkdirSync(BACKFILL_DIR, { recursive: true });
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {
      version: 1,
      price: { retentionFrom: null, fetchedMonths: [], sqlChunks: [] },
      issu: { basDt: null, fetched: false, sqlChunks: [] },
    };
  }
}

function saveState(state) {
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

// ---------------------------------------------------------------------------
// 날짜 유틸 (YYYYMMDD 정수 ↔ UTC 자정 Date)
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYmd(date) {
  return Number(`${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`);
}

function toDate(yyyymmdd) {
  const s = String(yyyymmdd);
  return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function todayYmd() {
  return toYmd(new Date());
}

function monthRangeYmd(yyyymm) {
  const year = Math.floor(yyyymm / 100);
  const month = yyyymm % 100;
  const begin = toYmd(new Date(Date.UTC(year, month - 1, 1)));
  const end = toYmd(new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)));
  return { begin, end };
}

function* monthsBetween(fromYmd, toYmdInclusive) {
  let year = Math.floor(fromYmd / 10000);
  let month = Math.floor((fromYmd % 10000) / 100);
  const endYear = Math.floor(toYmdInclusive / 10000);
  const endMonth = Math.floor((toYmdInclusive % 10000) / 100);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    yield year * 100 + month;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// discover-range — 시세 API 보존 한계를 이분 탐색으로 찾는다
// ---------------------------------------------------------------------------

async function cmdDiscoverRange(serviceKey) {
  // doesDataExistAtOrBefore(X): basDt <= X인 데이터가 하나라도 있는가.
  // endBasDt는 "미만"이므로 X+1일을 넘긴다. X가 today를 넘지 않는 한 이 술어는
  // X에 대해 단조증가(false...false,true...true)이므로 이분 탐색이 성립한다.
  async function doesDataExistAtOrBefore(x) {
    const endBasDt = toYmd(addDays(toDate(x), 1));
    const page = await fetchPage(PRICE_BASE_URL, PRICE_OPERATION, { endBasDt, numOfRows: 1, pageNo: 1 }, serviceKey);
    await sleep(MIN_CALL_INTERVAL_MS);
    return page.totalCount > 0;
  }

  const today = toDate(todayYmd());
  let lo = toDate(19900101); // 데이터가 없다고 가정하는 하한
  let hi = today; // 오늘까지는 데이터가 있다고 가정(전제: 최소 최근 데이터는 존재)

  if (!(await doesDataExistAtOrBefore(toYmd(hi)))) {
    console.error("오늘 기준으로도 시세 데이터가 없습니다 — API 상태를 확인하세요.");
    process.exit(1);
  }
  if (await doesDataExistAtOrBefore(toYmd(lo))) {
    console.warn("1990-01-01 이전부터 데이터가 존재합니다 — 하한을 더 낮춰야 할 수 있습니다.");
  }

  let calls = 2;
  while (Math.round((hi.getTime() - lo.getTime()) / 86_400_000) > 1) {
    const mid = new Date(lo.getTime() + Math.round((hi.getTime() - lo.getTime()) / 2));
    const midYmd = toYmd(mid);
    const exists = await doesDataExistAtOrBefore(midYmd);
    calls += 1;
    if (exists) hi = mid;
    else lo = mid;
    process.stdout.write(`  [${calls}회] ${midYmd} → ${exists ? "있음" : "없음"}\n`);
  }

  const retentionFrom = toYmd(hi);
  console.log(`\n보존 한계(가장 이른 basDt): ${retentionFrom} (${calls}회 호출)`);

  const state = loadState();
  state.price.retentionFrom = retentionFrom;
  saveState(state);
}

// ---------------------------------------------------------------------------
// fetch issu — 기본정보 최신 1일치 전량 수집 (원본만 저장, D1 미적재)
// ---------------------------------------------------------------------------

async function cmdFetchIssu(serviceKey, basDtArg) {
  const basDt = basDtArg ?? todayYmd();
  const dir = path.join(RAW_DIR, "issu", String(basDt));
  mkdirSync(dir, { recursive: true });

  const numOfRows = 1000;
  let pageNo = 1;
  let totalCount = Infinity;
  let totalFetched = 0;

  while ((pageNo - 1) * numOfRows < totalCount) {
    const page = await fetchPage(ISSU_BASE_URL, ISSU_OPERATION, { basDt, numOfRows, pageNo }, serviceKey);
    totalCount = page.totalCount;
    const file = path.join(dir, `p${String(pageNo).padStart(4, "0")}.json`);
    writeFileSync(file, page.rawBody);
    totalFetched += page.items.length;
    console.log(`  issu p${pageNo}: ${page.items.length}건 (누적 ${totalFetched}/${totalCount})`);
    pageNo += 1;
    await sleep(MIN_CALL_INTERVAL_MS);
  }

  const state = loadState();
  state.issu.basDt = basDt;
  state.issu.fetched = true;
  saveState(state);
  console.log(`완료: 기본정보 ${totalFetched}건 (basDt=${basDt})`);
}

// ---------------------------------------------------------------------------
// fetch price — 월 단위 범위 수집 (원본만 저장, D1 미적재)
// ---------------------------------------------------------------------------

async function cmdFetchPrice(serviceKey, fromArg, toArg) {
  const state = loadState();
  const from = fromArg ?? state.price.retentionFrom;
  const to = toArg ?? todayYmd();
  if (from === null) {
    console.error("보존 한계를 모릅니다. 먼저 `discover-range`를 실행하거나 --from을 지정하세요.");
    process.exit(1);
  }

  const dir = path.join(RAW_DIR, "price");
  mkdirSync(dir, { recursive: true });

  const fetchedSet = new Set(state.price.fetchedMonths);
  let monthCount = 0;

  for (const yyyymm of monthsBetween(from, to)) {
    const key = String(yyyymm);
    if (fetchedSet.has(key)) continue;

    const { begin, end } = monthRangeYmd(yyyymm);
    // 월당 약 332×22≈7,300건으로 numOfRows=10000 한 페이지면 충분하지만,
    // 방어적으로 totalCount를 확인해 넘치면 다음 페이지를 마저 받는다.
    const pages = [];
    let pageNo = 1;
    let totalCount = Infinity;
    let fetched = 0;
    while ((pageNo - 1) * 10000 < totalCount) {
      const page = await fetchPage(
        PRICE_BASE_URL,
        PRICE_OPERATION,
        { beginBasDt: begin, endBasDt: end, numOfRows: 10000, pageNo },
        serviceKey,
      );
      totalCount = page.totalCount;
      pages.push(page.rawBody);
      fetched += page.items.length;
      pageNo += 1;
      await sleep(MIN_CALL_INTERVAL_MS);
    }

    pages.forEach((body, i) => {
      writeFileSync(path.join(dir, `${key}-p${String(i + 1).padStart(2, "0")}.json`), body);
    });

    fetchedSet.add(key);
    state.price.fetchedMonths = [...fetchedSet].sort();
    saveState(state); // 월 단위로 즉시 저장 — 중간에 죽어도 재수집하지 않음
    monthCount += 1;
    console.log(`  price ${key}: ${fetched}건 (${pages.length}페이지)`);
  }

  console.log(`완료: ${monthCount}개월 신규 수집 (${from} ~ ${to})`);
}

// ---------------------------------------------------------------------------
// build-sql — 원본 JSON → 다중 VALUES INSERT .sql 청크
// ---------------------------------------------------------------------------

const ROWS_PER_CHUNK = 89_000; // D1 free tier rows written 100,000/일의 10% 안전마진

function readAllJsonItems(dir) {
  const items = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const parsed = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const body = parsed.response.body;
    if (typeof body.items !== "string") items.push(...body.items.item);
  }
  return items;
}

/**
 * @param {number} writeMultiplier 이 테이블에 실제 D1 write가 선언 행 수의 몇 배로 잡히는지
 *   (실측 근거). `WITHOUT ROWID` 없이 TEXT PRIMARY KEY를 쓰는 테이블(`bond`)은 SQLite가
 *   암묵적 PK 인덱스를 따로 만들어 2배로 잡힌다(실측: 29,079행 → 58,158 write).
 *   `WITHOUT ROWID` 테이블(`bond_state`/`bond_price`/`code_label`)은 1배(1:1)다.
 *   apply의 사전 예산 체크가 이 값으로 청크별 최악의 경우를 정확히 어림한다 — 배수를
 *   전체에 뭉뚱그려 적용하면 1:1 테이블까지 과도하게 막혀 진행이 안 된다.
 */
function writeSqlChunks(sqlDir, kind, table, columns, rows, conflictClause, writeMultiplier = 1) {
  mkdirSync(sqlDir, { recursive: true });
  const chunks = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
    const slice = rows.slice(i, i + ROWS_PER_CHUNK);
    const sql = buildMultiValuesInsert(table, columns, slice, { conflictClause });
    const file = `${kind}-${String(chunks.length + 1).padStart(4, "0")}.sql`;
    writeFileSync(path.join(sqlDir, file), sql);
    chunks.push({
      file: path.join(path.relative(PROJECT_ROOT, sqlDir), file),
      rows: slice.length,
      writeMultiplier,
      applied: false,
      appliedAt: null,
    });
  }
  return chunks;
}

function cmdBuildSqlIssu() {
  const state = loadState();
  if (!state.issu.fetched) {
    console.error("먼저 `fetch issu`를 실행하세요.");
    process.exit(1);
  }
  const dir = path.join(RAW_DIR, "issu", String(state.issu.basDt));
  const items = readAllJsonItems(dir);
  console.log(`기본정보 ${items.length}건 로드 (basDt=${state.issu.basDt})`);

  const bondRows = items.map((item) => buildBondRow(item, state.issu.basDt));
  const stateRows = items.map((item) => buildBondStateRow(item, item.isinCd, state.issu.basDt));
  const labelRowsMap = new Map(); // (domain,code) -> row, 중복 제거
  for (const item of items) {
    for (const row of mapBondCodeLabels(item)) {
      labelRowsMap.set(`${row[0]} ${row[1]}`, row);
    }
  }
  const labelRows = [...labelRowsMap.values()];

  const sqlDir = path.join(SQL_DIR, "issu");
  const chunks = [
    // bond는 WITHOUT ROWID가 아니라 암묵적 PK 인덱스 때문에 write가 2배로 잡힌다(실측).
    ...writeSqlChunks(sqlDir, "bond", "bond", BOND_COLUMNS, bondRows, "ON CONFLICT DO NOTHING", 2),
    ...writeSqlChunks(sqlDir, "state", "bond_state", BOND_STATE_COLUMNS, stateRows, "ON CONFLICT DO NOTHING"),
    ...writeSqlChunks(sqlDir, "labels", "code_label", CODE_LABEL_COLUMNS, labelRows, "ON CONFLICT DO NOTHING"),
  ];
  state.issu.sqlChunks = chunks;
  saveState(state);
  console.log(
    `SQL 청크 ${chunks.length}개 생성: bond ${bondRows.length}행, bond_state ${stateRows.length}행, code_label ${labelRows.length}행`,
  );
}

function cmdBuildSqlPrice() {
  const state = loadState();
  if (state.price.fetchedMonths.length === 0) {
    console.error("먼저 `fetch price`를 실행하세요.");
    process.exit(1);
  }
  const dir = path.join(RAW_DIR, "price");
  const items = readAllJsonItems(dir);
  console.log(`시세 ${items.length}건 로드`);

  const rows = items.map(buildBondPriceRow);
  const sqlDir = path.join(SQL_DIR, "price");
  const chunks = writeSqlChunks(sqlDir, "c", "bond_price", BOND_PRICE_COLUMNS, rows, "ON CONFLICT DO NOTHING");
  state.price.sqlChunks = chunks;
  saveState(state);
  console.log(`SQL 청크 ${chunks.length}개 생성 (총 ${rows.length}행, 청크당 최대 ${ROWS_PER_CHUNK}행)`);
}

// ---------------------------------------------------------------------------
// apply — wrangler d1 execute로 .sql 청크를 오늘 예산 안에서 적용
// ---------------------------------------------------------------------------
// (readDatabaseName은 ./lib/wrangler-config.mjs에서 import — build-snapshot.mjs와 공유)

// 청크별 실제 write 배수는 writeSqlChunks가 테이블 스키마에 맞춰 chunk.writeMultiplier에
// 정확히 새겨 둔다(bond=2, WITHOUT ROWID 테이블=1). 옛 state.json(이 필드가 생기기 전에
// build-sql로 만든 청크)처럼 값이 없는 경우에만 이 기본 배수로 보수적으로 어림한다 —
// 무조건 2를 곱하면 1:1 테이블(bond_price 등)까지 예산이 영원히 막혀버린다.
const DEFAULT_WRITE_MULTIPLIER = 1.2;

/** UTC 날짜 문자열(YYYY-MM-DD). D1 free tier의 write 한도가 UTC 자정에 리셋되므로 이 기준으로 누적한다. */
function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 오늘 이미 사용한 실제 D1 write 누적량. `state.dailyWrites`에 소스 구분 없이(issu/price
 * 공통 계정 한도이므로) 저장해 **여러 번의 apply 호출에 걸쳐서도** 정확히 추적한다 —
 * 이게 없으면 issu apply와 price apply가 서로의 사용량을 모른 채 각자 "예산 안"이라고
 * 착각해 실제로는 합산 한도를 넘기게 된다(실제로 이렇게 초과된 적이 있음).
 */
function getDailyWritesUsed(state) {
  return state.dailyWrites?.[todayUtcDate()] ?? 0;
}

function addDailyWritesUsed(state, actualRows) {
  state.dailyWrites ??= {};
  const today = todayUtcDate();
  state.dailyWrites[today] = (state.dailyWrites[today] ?? 0) + actualRows;
}

/** `wrangler d1 execute --file --json`을 실행하고 실제 rows_written을 반환한다. */
function executeSqlFile(databaseName, target, filePath) {
  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      databaseName,
      `--${target}`,
      "--config",
      "./wrangler.jsonc",
      `--file=${filePath}`,
      "--json",
      "-y",
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8", env: WRANGLER_ENV },
  );
  // wrangler --json은 배열([{results, success, meta}])을 stdout에 찍지만 그 앞뒤로
  // 프록시/텔레메트리 경고 등 비-JSON 라인이 섞여 나올 수 있어 첫 '['부터 파싱한다.
  const jsonStart = output.indexOf("[");
  const parsed = JSON.parse(output.slice(jsonStart));
  const rowsWritten = parsed[0]?.meta?.rows_written;
  if (typeof rowsWritten !== "number") {
    throw new Error(`wrangler 출력에서 rows_written을 찾지 못함: ${output.slice(0, 500)}`);
  }
  return rowsWritten;
}

function cmdApply(source, target, budget) {
  const state = loadState();
  const bucket = source === "issu" ? state.issu : state.price;
  const chunks = bucket.sqlChunks ?? [];
  if (chunks.length === 0) {
    console.error(`적용할 SQL 청크가 없습니다. 먼저 \`build-sql --source ${source}\`를 실행하세요.`);
    process.exit(1);
  }

  const databaseName = readDatabaseName();
  let appliedCount = 0;
  let actualWrittenThisRun = 0;

  for (const chunk of chunks) {
    if (chunk.applied) continue;

    const dailyUsed = getDailyWritesUsed(state);
    const multiplier = chunk.writeMultiplier ?? DEFAULT_WRITE_MULTIPLIER;
    const worstCaseEstimate = Math.ceil(chunk.rows * multiplier);
    if (dailyUsed + worstCaseEstimate > budget) {
      console.log(
        `오늘 누적 write ${dailyUsed}행 + ${chunk.file} 예상 ${worstCaseEstimate}행(배수 ${multiplier}x) > 예산 ${budget}행 — 다음 실행으로 미룸`,
      );
      break;
    }

    const filePath = path.join(PROJECT_ROOT, chunk.file);
    console.log(`적용 중: ${chunk.file} (${chunk.rows}행 선언, ${target})`);
    const actualRowsWritten = executeSqlFile(databaseName, target, filePath);
    const observedMultiplier = (actualRowsWritten / chunk.rows).toFixed(2);
    console.log(`  → 실제 D1 write: ${actualRowsWritten}행 (배수 ${observedMultiplier}x)`);

    chunk.applied = true;
    chunk.appliedAt = new Date().toISOString();
    chunk.actualRowsWritten = actualRowsWritten;
    addDailyWritesUsed(state, actualRowsWritten);
    appliedCount += 1;
    actualWrittenThisRun += actualRowsWritten;
    saveState(state); // 청크 하나 끝날 때마다 즉시 저장 — 중간 실패해도 재적용 안 되고, 오늘 누적치도 보존됨
  }

  const remaining = chunks.filter((c) => !c.applied).length;
  const dailyUsedNow = getDailyWritesUsed(state);
  console.log(
    `\n이번 실행: ${appliedCount}개 청크 적용 (실제 ${actualWrittenThisRun}행 write). ` +
      `오늘(UTC) 누적 write: ${dailyUsedNow}/${budget}행 예산. 남은 청크: ${remaining}개`,
  );
  if (remaining > 0) {
    console.log(`같은 명령을 내일(UTC 자정 이후) 다시 실행해 이어가세요.`);
  }
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

function cmdStatus() {
  const state = loadState();
  console.log("=== 채권 D1 백필 진행 상황 ===\n");

  console.log(`[기본정보] basDt=${state.issu.basDt ?? "(미수집)"}  수집=${state.issu.fetched}`);
  summarizeChunks(state.issu.sqlChunks);

  console.log(
    `\n[시세] 보존한계=${state.price.retentionFrom ?? "(미탐지)"}  수집월=${state.price.fetchedMonths.length}개`,
  );
  summarizeChunks(state.price.sqlChunks);
}

function summarizeChunks(chunks = []) {
  if (chunks.length === 0) {
    console.log("  SQL 청크: (없음, build-sql 미실행)");
    return;
  }
  const applied = chunks.filter((c) => c.applied);
  const totalRows = chunks.reduce((sum, c) => sum + c.rows, 0);
  const appliedRows = applied.reduce((sum, c) => sum + c.rows, 0);
  console.log(`  SQL 청크: ${applied.length}/${chunks.length}개 적용 (${appliedRows}/${totalRows}행)`);
}

// ---------------------------------------------------------------------------
// CLI 진입점
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function usage() {
  console.error(`사용법:
  node scripts/backfill.mjs discover-range
  node scripts/backfill.mjs fetch issu  [--bas-dt YYYYMMDD]
  node scripts/backfill.mjs fetch price [--from YYYYMMDD] [--to YYYYMMDD]
  node scripts/backfill.mjs build-sql --source issu|price
  node scripts/backfill.mjs apply --source issu|price [--remote|--local] [--budget 90000]
  node scripts/backfill.mjs status`);
  process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);

  if (command === "status") {
    cmdStatus();
    return;
  }

  if (command === "discover-range") {
    await cmdDiscoverRange(loadServiceKey());
    return;
  }

  if (command === "fetch") {
    const kind = positional[0];
    const serviceKey = loadServiceKey();
    if (kind === "issu") {
      await cmdFetchIssu(serviceKey, flags["bas-dt"] ? Number(flags["bas-dt"]) : undefined);
    } else if (kind === "price") {
      await cmdFetchPrice(
        serviceKey,
        flags.from ? Number(flags.from) : undefined,
        flags.to ? Number(flags.to) : undefined,
      );
    } else {
      usage();
    }
    return;
  }

  if (command === "build-sql") {
    if (flags.source === "issu") cmdBuildSqlIssu();
    else if (flags.source === "price") cmdBuildSqlPrice();
    else usage();
    return;
  }

  if (command === "apply") {
    if (flags.source !== "issu" && flags.source !== "price") usage();
    const target = flags.local ? "local" : flags.remote ? "remote" : null;
    if (!target) {
      console.error("--remote 또는 --local을 지정하세요.");
      process.exit(1);
    }
    const budget = flags.budget ? Number(flags.budget) : 90_000;
    cmdApply(flags.source, target, budget);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
