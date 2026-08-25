#!/usr/bin/env node
// 스크리너 목록 화면용 기준 스냅샷을 D1에서 뽑아 R2에 올린다. 주 1회, Worker 밖(로컬/CI)에서
// 실행한다 — 29,087행 JSON 조립+gzip이 Worker Free tier CPU 10ms 예산을 훌쩍 넘기기 때문이다
// (실측: 3MB JSON stringify+gzip). D1/R2 접근은 `wrangler d1 execute --json`과
// `wrangler r2 object put`을 하위 프로세스로 호출해서 한다(별도 API 클라이언트 불필요).
//
// 사용법: node scripts/build-snapshot.mjs [--remote|--local]
//
// 산출물: snapshot/bond/{basDt}.json.gz (스크리너 18필드, 배열 포맷) + snapshot/index.json 갱신.
// 키 네이밍은 src/lib/r2/keys.ts(snapshotBondKey/SNAPSHOT_INDEX_KEY)와 반드시 일치해야 한다 —
// 여기서도 문자열로 재구현했다(스크립트가 TS를 import할 수 없는 이유는 scripts/lib/*.mjs 상단 주석 참고).

import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/env.mjs";
import { readDatabaseName, readBucketName, WRANGLER_ENV } from "./lib/wrangler-config.mjs";

// 스크리너 목록에 필요한 18필드. code_label로 뺀 코드는 별도 조인 없이 스냅샷 헤더에
// 라벨 사전을 통째로 실어 클라이언트에서 매핑한다.
const COLUMNS = [
  "isin_cd",
  "srtn_cd",
  "itms_nm",
  "bond_isur_nm",
  "scrs_itms_kcd",
  "bond_issu_dt",
  "bond_expr_dt",
  "bond_srfc_inrt",
  "bond_int_tcd",
  "int_pay_cycl_ctt",
  "txtn_dcd",
  "grn_dcd",
  "bond_rnkn_dcd",
  "optn_tcd",
];
const STATE_COLUMNS = ["bond_bal", "nxtm_copn_dt", "kis_grade"];

function wranglerD1Query(sql, target) {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      readDatabaseName(),
      `--${target}`,
      "--config",
      "./wrangler.jsonc",
      "--json",
      "--command",
      sql,
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8", env: WRANGLER_ENV },
  );
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

async function main() {
  const target = process.argv.includes("--local") ? "local" : "remote";

  console.log(`D1(${target})에서 bond + bond_state(현재값) + code_label 조회 중...`);
  const bondRows = wranglerD1Query(
    `SELECT ${COLUMNS.join(", ")}, first_seen_bas_dt, last_chg_bas_dt FROM bond`,
    target,
  );
  const stateRows = wranglerD1Query(
    `SELECT isin_cd, ${STATE_COLUMNS.join(", ")} FROM bond_state WHERE valid_to IS NULL`,
    target,
  );
  const labelRows = wranglerD1Query(`SELECT domain, code, label FROM code_label`, target);

  const stateByIsin = new Map(stateRows.map((r) => [r.isin_cd, r]));
  const codeLabels = {};
  for (const { domain, code, label } of labelRows) {
    (codeLabels[domain] ??= {})[code] = label;
  }

  const basDt = Math.max(...bondRows.map((r) => r.last_chg_bas_dt), 0);
  const rows = bondRows.map((r) => [
    r.isin_cd,
    r.srtn_cd,
    r.itms_nm,
    r.bond_isur_nm,
    r.scrs_itms_kcd,
    r.bond_issu_dt,
    r.bond_expr_dt,
    r.bond_srfc_inrt,
    r.bond_int_tcd,
    r.int_pay_cycl_ctt,
    r.txtn_dcd,
    r.grn_dcd,
    r.bond_rnkn_dcd,
    r.optn_tcd,
    stateByIsin.get(r.isin_cd)?.bond_bal ?? null,
    stateByIsin.get(r.isin_cd)?.nxtm_copn_dt ?? null,
    stateByIsin.get(r.isin_cd)?.kis_grade ?? null,
  ]);

  const columns = [...COLUMNS, ...STATE_COLUMNS];
  const payload = JSON.stringify({ basDt, columns, codeLabels, rows });
  const gz = gzipSync(payload, { level: 9 });
  console.log(
    `스냅샷: ${rows.length}행, raw ${(payload.length / 1024).toFixed(0)}KB, gzip ${(gz.length / 1024).toFixed(0)}KB`,
  );

  const tmpDir = mkdtempSync(path.join(tmpdir(), "bond-snapshot-"));
  const gzPath = path.join(tmpDir, "bond.json.gz");
  writeFileSync(gzPath, gz);

  const bucket = readBucketName();
  const key = `snapshot/bond/${basDt}.json.gz`;
  console.log(`R2(${target})에 업로드: ${key}`);
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      `--file=${gzPath}`,
      `--${target}`,
      "--content-encoding=gzip",
      "--content-type=application/json",
    ],
    { cwd: PROJECT_ROOT, stdio: "inherit", env: WRANGLER_ENV },
  );

  // index.json 갱신 — 시세 델타는 이 basDt 이전 것들을 정리(base가 이미 그 시점을 반영)
  const indexKey = "snapshot/index.json";
  let index = { generatedAt: new Date().toISOString(), bond: null, priceDeltas: [] };
  try {
    const existing = execFileSync(
      "pnpm",
      ["exec", "wrangler", "r2", "object", "get", `${bucket}/${indexKey}`, `--${target}`, "--pipe"],
      { cwd: PROJECT_ROOT, encoding: "utf8", env: WRANGLER_ENV },
    );
    index = JSON.parse(existing);
  } catch {
    // 최초 실행 — index.json 없음
  }
  index.generatedAt = new Date().toISOString();
  index.bond = { key, basDt, count: rows.length };
  index.priceDeltas = (index.priceDeltas ?? []).filter((d) => d.basDt > basDt);

  const indexPath = path.join(tmpDir, "index.json");
  writeFileSync(indexPath, JSON.stringify(index));
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucket}/${indexKey}`,
      `--file=${indexPath}`,
      `--${target}`,
      "--content-type=application/json",
    ],
    { cwd: PROJECT_ROOT, stdio: "inherit" },
  );

  console.log(`완료: basDt=${basDt}, ${rows.length}행`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
