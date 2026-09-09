/** 스크리너 표시 전용 포매터. Worker/sync 로직과는 무관 — src/lib/bond/에 두지 않는다(신용등급 서열만 예외, 파일 끝 참고). */

export const DASH = "—";

/**
 * YYYYMMDD 정수를 `YYYY-MM-DD`로 표시한다. `Date`를 거치지 않는다 — 타임존 없는
 * 달력 날짜를 `Date`로 파싱하면 UTC/KST 경계에서 하루가 밀릴 수 있다.
 */
export function fmtYmd(v: number | null): string {
  if (v === null) return DASH;
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 0을 유효값으로 취급한다 — `!v` 판정 금지(표면이율 0인 사모 CB가 실제로 존재). */
export function fmtRate(v: number | null, digits = 3): string {
  if (v === null) return DASH;
  return `${v.toFixed(digits)}%`;
}

/** 억/조 단위로 축약. 거래량(trqu)에도 그대로 재사용한다. */
export function fmtAmount(v: number | null): string {
  if (v === null) return DASH;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) return `${sign}${Math.round(abs / 1e8).toLocaleString("ko-KR")}억`;
  return v.toLocaleString("ko-KR");
}

/** 가격처럼 축약 없이 천단위 콤마만 필요한 값. */
export function fmtPrice(v: number | null): string {
  if (v === null) return DASH;
  return v.toLocaleString("ko-KR");
}

/** 전일대비 값에 부호를 명시적으로 붙인다. 0은 부호 없이 "0". */
export function fmtDelta(v: number | null): string {
  if (v === null) return DASH;
  if (v > 0) return `+${v.toLocaleString("ko-KR")}`;
  if (v < 0) return v.toLocaleString("ko-KR");
  return "0";
}

export type DeltaTone = "up" | "down" | "flat" | "none";

export function deltaTone(v: number | null): DeltaTone {
  if (v === null) return "none";
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

/**
 * 신용등급 서열 비교는 `src/lib/bond/grade.ts`가 정본이다 — MCP `search_bonds`의 등급 하한
 * 필터가 Worker 쪽에서 같은 서열을 써야 해 그쪽으로 옮겼다(이 파일의 "표시 전용" 원칙에서
 * 유일하게 예외인 항목). 기존 import 경로를 유지하려고 여기서 재export한다.
 */
export { compareGrade } from "@/lib/bond/grade";
