#!/usr/bin/env node
/**
 * src/lib/bond/fingerprint.ts와 scripts/lib/fingerprint.mjs가 동일한 입력에 대해
 * 바이트(비트) 단위로 같은 지문을 내는지 검증한다. 네트워크 호출 없음, 의존성 없음.
 *
 * 두 파일은 의도적으로 중복 구현되어 있다(스크립트는 TS의 @/ 별칭을 import할 수
 * 없어서 — AGENTS.md "초기 백필" 절 참고). 어긋나면 백필로 적재한 지문과 cron이
 * 이후 계산하는 지문이 달라져 전 종목이 "변경됨"으로 오판된다.
 *
 * exit 0: 불일치 없음 / exit 1: 불일치 있음(stdout에 상세 출력)
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");

const { fingerprintRow: tsImpl } = await import(
  path.join(ROOT, "src/lib/bond/fingerprint.ts")
);
const { fingerprintRow: mjsImpl } = await import(
  path.join(ROOT, "scripts/lib/fingerprint.mjs")
);

// 실제 bond 컬럼 데이터에서 나올 법한 경계 케이스 위주로 구성한다.
const samples = [
  [],
  [null],
  [""],
  ["", ""],
  ["NULL", null],
  [null, "NULL"],
  ["ab", "c"],
  ["a", "bc"],
  ["a bc"],
  [0, "0", null, ""],
  [1, "2", null, "text with space"],
  ["동해물과 백두산이", null, 12345, "0"],
  Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? null : `col${i}`)),
  ["KR6135361D34", "20260101", "20360101", "3.25", null, "0"],
];

let failed = false;
for (const sample of samples) {
  const a = tsImpl(sample);
  const b = mjsImpl(sample);
  if (a !== b) {
    failed = true;
    console.error(`MISMATCH ${JSON.stringify(sample)}\n  ts (fingerprint.ts)  = ${a}\n  mjs (fingerprint.mjs) = ${b}`);
  }
}

if (failed) {
  console.error(
    "\nfingerprint parity check FAILED — src/lib/bond/fingerprint.ts와 scripts/lib/fingerprint.mjs가 어긋났습니다.\n" +
      "둘 다 확인해서 로직을 동일하게 맞추세요 (한쪽만 고치지 말 것).",
  );
  process.exit(1);
}

console.log(`fingerprint parity check OK (${samples.length}개 샘플 일치)`);
