import type { ScreenerRow } from "@/lib/screener/types";

/** `ScreenerRow` 픽스처 팩토리. 원래 `tests/screener-filters.test.ts`의 로컬 헬퍼였으나
 * 컴포넌트 테스트도 같은 형태의 픽스처가 필요해 여기로 옮겼다. */
export function makeScreenerRow(overrides: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    isinCd: "KR0000000000",
    isinCdNm: "테스트채권",
    bondIsurNm: "테스트발행사",
    scrsItmsKcd: "01",
    scrsItmsKcdNm: "회사채",
    bondIssuDt: 20200101,
    bondExprDt: 20250101,
    bondSrfcInrt: 3.5,
    kisGrade: "AAA",
    bondBal: 100_000_000_000,
    bondIntTcd: "01",
    bondIntTcdNm: "이표채",
    mrktCtg: "일반채권",
    clprPrc: 10000,
    clprVs: 10,
    clprBnfRt: 3.2,
    trqu: 5000,
    ...overrides,
  };
}
