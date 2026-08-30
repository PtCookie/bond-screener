#!/usr/bin/env node
// 스크리너 목록 화면용 기준 스냅샷을 D1에서 뽑아 R2에 올린다. 주 1회, Worker 밖(로컬/CI)에서
// 실행한다 — 29,106행 JSON 조립이 Worker Free tier CPU 10ms 예산을 훌쩍 넘기기 때문이다.
// D1/R2 접근은 `wrangler d1 execute --json`과 `wrangler r2 object put`을 하위 프로세스로
// 호출해서 한다(별도 API 클라이언트 불필요).
//
// 압축은 하지 않는다 — Cloudflare 엣지가 `application/json` 응답에 실제 클라이언트
// Accept-Encoding 기준으로 gzip/brotli를 자동 적용한다(Worker CPU와 무관한 네트워크 계층
// 기능). 처음엔 여기서 직접 gzip/brotli 두 벌을 만들어 올리고 `/api/snapshot/*` 라우트가
// 골라 서빙하게 했으나, 로컬 dev(Miniflare)에서 실측한 결과 그 방식은 애초에 동작하지
// 않았다(`src/lib/r2/keys.ts`의 `snapshotBondKey` 주석 참고) — 압축은 플랫폼에 맡길 것.
//
// 사용법: node scripts/build-snapshot.mjs --remote|--local (필수 — 무인자 실행은 운영
// D1/R2를 건드릴 수 있어 명시를 강제한다)
//
// 산출물: snapshot/bond/{basDt}.json(v2 포맷, 컬럼지향+발행인사전화+epoch day —
// `src/lib/snapshot/format.ts` 참고) + snapshot/index.json 갱신.
//
// 포맷 정본은 `src/lib/snapshot/format.ts`/`encode.ts` 한 벌뿐이다. `@/` 경로 별칭 없이
// 작성돼 있어 Node 24의 type stripping으로 이 스크립트가 상대 경로로 직접 import한다 —
// scripts/lib/*.mjs가 src/lib/bond/의 정규화·매핑 로직을 plain JS로 재구현해야 했던 것과
// 같은 이중 구현 함정을 피하기 위함(AGENTS.md의 fingerprint 정합성 경고 참고).

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/env.mjs";
import { readDatabaseName, readBucketName, WRANGLER_ENV } from "./lib/wrangler-config.mjs";
import { encodeSnapshot } from "../src/lib/snapshot/encode.ts";
import { snapshotBondKey, SNAPSHOT_INDEX_KEY } from "../src/lib/r2/keys.ts";

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
    { cwd: PROJECT_ROOT, encoding: "utf8", env: WRANGLER_ENV, maxBuffer: 64 * 1024 * 1024 },
  );
  // wrangler --json 출력 앞뒤로 프록시/텔레메트리 경고 등 비-JSON 라인이 섞여 나올 수
  // 있어 첫 '['부터 파싱한다(scripts/backfill.mjs의 executeSqlFile과 동일 방어).
  const jsonStart = out.indexOf("[");
  const parsed = JSON.parse(out.slice(jsonStart));
  return parsed[0]?.results ?? [];
}

function wranglerR2Put(bucket, key, filePath, target, extraArgs = []) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "r2", "object", "put", `${bucket}/${key}`, `--file=${filePath}`, `--${target}`, ...extraArgs],
    { cwd: PROJECT_ROOT, stdio: "inherit", env: WRANGLER_ENV },
  );
}

async function main() {
  const target = process.argv.includes("--local") ? "local" : process.argv.includes("--remote") ? "remote" : null;
  if (!target) {
    console.error("--remote 또는 --local을 지정하세요.");
    process.exit(1);
  }

  console.log(`D1(${target})에서 bond + bond_state(현재값) + code_label + 종목별 최신시세 조회 중...`);
  const bondRows = wranglerD1Query(
    "SELECT isin_cd, isin_cd_nm, bond_isur_nm, scrs_itms_kcd, bond_issu_dt, bond_expr_dt, bond_srfc_inrt, bond_int_tcd, last_chg_bas_dt FROM bond",
    target,
  );
  const stateRows = wranglerD1Query(
    "SELECT isin_cd, bond_bal, kis_grade FROM bond_state WHERE valid_to IS NULL",
    target,
  );
  const codeLabelRows = wranglerD1Query("SELECT domain, code, label FROM code_label", target);
  // 종목별 "최신" 시세 1건만 — bond_price PK (isin_cd, bas_dt, mrkt_ctg) 인덱스 없이도
  // GROUP BY isin_cd 서브쿼리 조인으로 실행된다(실측 rows_read 577,729, 무료 500만/일의 11.5%,
  // 주 1회 실행이라 허용 범위).
  const latestPriceRows = wranglerD1Query(
    `SELECT p.isin_cd, p.bas_dt, p.mrkt_ctg, p.clpr_prc, p.clpr_vs, p.clpr_bnf_rt, p.trqu
     FROM bond_price p
     JOIN (SELECT isin_cd, MAX(bas_dt) mx FROM bond_price GROUP BY isin_cd) m
       ON p.isin_cd = m.isin_cd AND p.bas_dt = m.mx`,
    target,
  );

  const payload = encodeSnapshot({ bondRows, stateRows, codeLabelRows, latestPriceRows });
  const json = JSON.stringify(payload);

  console.log(
    `스냅샷: bond ${payload.cols[0].length}행, 시세 ${payload.priceCols[0].length}행, ` +
      `발행인 ${payload.issuers.length}종, raw ${(json.length / 1024).toFixed(0)}KB`,
  );

  const tmpDir = mkdtempSync(path.join(tmpdir(), "bond-snapshot-"));
  const jsonPath = path.join(tmpDir, "bond.json");
  writeFileSync(jsonPath, json);

  const bucket = readBucketName();
  const basDt = payload.basDt;
  const key = snapshotBondKey(basDt);

  console.log(`R2(${target})에 업로드: ${key}`);
  wranglerR2Put(bucket, key, jsonPath, target, ["--content-type=application/json"]);

  // index.json 갱신 — 시세 델타는 이 basDt 이전 것들을 정리(base가 이미 그 시점을 반영)
  // 오브젝트 부재(최초 실행)만 빈 인덱스로 폴백한다. JSON 파싱 실패는 손상된 index를
  // 조용히 덮어써 누적 priceDeltas를 날릴 수 있으므로 rethrow한다 — src/lib/r2/price-delta.ts의
  // readIndex()와 동일한 규약.
  let existing;
  try {
    existing = execFileSync(
      "pnpm",
      ["exec", "wrangler", "r2", "object", "get", `${bucket}/${SNAPSHOT_INDEX_KEY}`, `--${target}`, "--pipe"],
      { cwd: PROJECT_ROOT, encoding: "utf8", env: WRANGLER_ENV },
    );
  } catch {
    // 최초 실행 — index.json 없음
  }
  const index = existing
    ? JSON.parse(existing)
    : { generatedAt: new Date().toISOString(), bond: null, priceDeltas: [] };
  index.generatedAt = new Date().toISOString();
  index.bond = { key, basDt, count: payload.cols[0].length };
  index.priceDeltas = (index.priceDeltas ?? []).filter((d) => d.basDt > basDt);

  const indexPath = path.join(tmpDir, "index.json");
  writeFileSync(indexPath, JSON.stringify(index));
  wranglerR2Put(bucket, SNAPSHOT_INDEX_KEY, indexPath, target, ["--content-type=application/json"]);

  console.log(`완료: basDt=${basDt}, ${payload.cols[0].length}행`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
