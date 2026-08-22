// scripts/backfill.mjs 전용 정규화 함수 모음.
//
// src/lib/openapi/normalize.ts와 동일한 규칙을 순수 JS로 재구현한 것이다.
// backfill.mjs는 TypeScript 컴파일/번들 없이 `node scripts/backfill.mjs`로 바로 돌아가야 해서
// (probe.sh/spec-sync.mjs와 같은 "무의존성 스크립트" 관례) `@/` 경로 별칭을 쓰는 src/lib를
// 그대로 import할 수 없다 — Node의 네이티브 TS 스트리핑은 타입 제거만 하고 경로 별칭은
// 해석하지 못한다. 두 정규화 로직이 어긋나면 백필 데이터와 cron이 쌓는 데이터의 표현이
//달라지므로, **이 파일을 고치면 반드시 src/lib/openapi/normalize.ts도 같이 확인할 것.**

const NULL_LITERAL = /^NULL$/i;
const YMD = /^\d{8}$/;

export function normText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "" || NULL_LITERAL.test(text)) return null;
  return text;
}

export function normDate(value) {
  const text = normText(value);
  if (text === null || !YMD.test(text)) return null;
  return Number(text);
}

export function normInt(value) {
  const text = normText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

export function normReal(value) {
  const text = normText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function normYn(value) {
  const text = normText(value);
  if (text === null) return null;
  if (/^Y$/i.test(text)) return 1;
  if (/^N$/i.test(text)) return 0;
  return null;
}

export const MARKET_CATEGORY_CODE = { KTS: 1, 일반채권: 2, 소액채권: 3 };
