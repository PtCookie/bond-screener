/**
 * 채권 오픈API 2종의 빈 값 표현을 흡수해 SQLite에 저장 가능한 값으로 정규화한다.
 *
 * 빈 값 표현이 API마다 다르다(실호출로 확인):
 * - 채권기본정보: `""`(빈 문자열)만 온다.
 * - 채권시세정보: `" "`(공백 한 칸)로 온다(`xpYrCnt`/`itmsCtg` 등). **반드시 trim 후 판정할 것** —
 *   trim 없이 `!== ""`만 검사하면 공백이 값으로 통과해 그대로 저장된다.
 * - `docs/api/README.md`는 문자열 `"NULL"`도 가능하다고 기술한다.
 *
 * `NumericLike`(`string | number`)를 인자로 받는 이유: 채권시세정보의 가격·수익률·거래량
 * 11개 필드는 Swagger 스키마상 `number`로 선언되어 있지만, 실호출 결과는 전부 문자열로 온다
 * (`"clprPrc": "10437"`). `src/api/` 쪽 타입은 Swagger를 그대로 반영해 두고, 이 런타임 계층에서
 * 두 표현을 모두 흡수한다.
 */
import type { NumericLike } from "@/api";

const NULL_LITERAL = /^NULL$/i;
const YMD = /^\d{8}$/;

/** `""`/`" "`(trim 후 빈 문자열)/`"NULL"` → `null`. 그 외는 trim된 문자열. */
export function normText(value: NumericLike | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "" || NULL_LITERAL.test(text)) return null;
  return text;
}

/** `YYYYMMDD` 8자리 숫자 문자열만 `INTEGER`로. 그 외(빈 값·형식 오류)는 `null`. */
export function normDate(value: NumericLike | null | undefined): number | null {
  const text = normText(value);
  if (text === null || !YMD.test(text)) return null;
  return Number(text);
}

/**
 * 정수로 정규화. `Number.isSafeInteger`를 벗어나면(예: 발행금액 자릿수 18,3이 실제로는
 * 문제되지 않을 것으로 보이나 방어적으로) `null`을 반환하고 `console.warn`으로 남긴다.
 */
export function normInt(value: NumericLike | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : warnAndNull("normInt", value);
  }
  const text = normText(value);
  if (text === null) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return warnAndNull("normInt", value);
  return n;
}

/** 실수로 정규화(표면이율, 수익률 등). `Number.isFinite` 실패 시 `null`. */
export function normReal(value: NumericLike | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : warnAndNull("normReal", value);
  }
  const text = normText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : warnAndNull("normReal", value);
}

/** `Y`→1, `N`→0(대소문자 무시), 그 외(빈 값 포함)는 `null`. */
export function normYn(value: NumericLike | null | undefined): 0 | 1 | null {
  const text = normText(value);
  if (text === null) return null;
  if (/^Y$/i.test(text)) return 1;
  if (/^N$/i.test(text)) return 0;
  return null;
}

function warnAndNull(fn: string, value: unknown): null {
  console.warn(`[normalize] ${fn}: 예상 밖 값 → null 처리`, value);
  return null;
}
