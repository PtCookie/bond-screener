/**
 * 신용등급(KIS 기준, `bond_state.kis_grade`) 서열 정본. 원래 스크리너 표시 계층
 * (`src/lib/screener/format.ts`)에만 있었으나, MCP `search_bonds`의 `minGrade`(등급 하한)
 * 필터가 Worker 쪽에서 같은 서열을 써야 해 여기로 승격했다 — 상수와 순수 비교 함수뿐이라
 * D1/DOM 의존이 없고, 클라이언트(`format.ts`가 재export)와 Worker가 한 벌을 공유한다.
 */

/**
 * 신용등급 서열: AAA가 최상위. 실측 분포에 등장하는 등급만 포함. null은 항상 뒤로.
 *
 * **중간 등급은 `AA`가 아니라 `AA0` 표기다**(`A0`/`BBB0`/`BB0`/`B0`도 마찬가지) — 오픈API가
 * 그렇게 내려주고 D1에도 그대로 저장된다(로컬 실측: 현재 유효한 `bond_state` 기준 AA0 1,139건,
 * A0 620건, 무접미사 `AA`/`A`는 0건). 접미사를 빼면 `GRADE_RANK` 조회가 빗나가 그 등급들이
 * 정렬 맨 뒤로 밀리고, `gradesAtOrAbove`가 만드는 `IN (...)` 목록에서도 통째로 빠진다.
 */
export const GRADE_ORDER = [
  "AAA",
  "AA+",
  "AA0",
  "AA-",
  "A+",
  "A0",
  "A-",
  "BBB+",
  "BBB0",
  "BBB-",
  "BB+",
  "BB0",
  "BB-",
  "B+",
  "B0",
  "B-",
  "CCC",
  "CC",
  "C",
  "D",
] as const;

export type Grade = (typeof GRADE_ORDER)[number];

const GRADE_RANK = new Map<string, number>(GRADE_ORDER.map((g, i) => [g, i]));

export function compareGrade(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const ra = GRADE_RANK.get(a) ?? Number.MAX_SAFE_INTEGER;
  const rb = GRADE_RANK.get(b) ?? Number.MAX_SAFE_INTEGER;
  return ra - rb;
}

/**
 * `min` 이상(= 서열상 같거나 더 높은) 등급 전부. `"AA-"` → `["AAA","AA+","AA","AA-"]`.
 * `buildBondSearchQuery`(`src/lib/d1/sql.ts`)가 이걸 `IN (...)` 목록으로 펼친다 — SQL에서
 * 문자열 등급을 부등호로 비교할 방법이 없어 화이트리스트로 등가 변환하는 것이다.
 * 최대 길이가 `GRADE_ORDER.length`(20)라 D1의 쿼리당 bound parameter 100개 제한 안에 든다.
 */
export function gradesAtOrAbove(min: Grade): readonly string[] {
  const rank = GRADE_RANK.get(min);
  if (rank === undefined) return GRADE_ORDER;
  return GRADE_ORDER.slice(0, rank + 1);
}
