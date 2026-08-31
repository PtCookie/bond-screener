import { describe, expect, test } from "vitest";
import { EMPTY_FILTERS, applyFilters, buildFilterOptions, countActiveFilters } from "@/lib/screener/filters";
import { makeScreenerRow as makeRow } from "./helpers/screener-row";

describe("applyFilters", () => {
  test("활성 필터가 없으면 원본 배열을 그대로(동일 참조) 반환한다", () => {
    const rows = [makeRow()];
    expect(applyFilters(rows, EMPTY_FILTERS)).toBe(rows);
  });

  test("검색어가 종목명에 매치한다", () => {
    const rows = [makeRow({ isinCdNm: "삼성전자채권01" }), makeRow({ isinCd: "KR1111111111", isinCdNm: "다른채권" })];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, q: "삼성전자" });
    expect(result).toHaveLength(1);
    expect(result[0].isinCdNm).toBe("삼성전자채권01");
  });

  test("검색어가 발행인에 매치한다", () => {
    const rows = [makeRow({ bondIsurNm: "카카오뱅크" }), makeRow({ isinCd: "KR1111111111", bondIsurNm: "다른발행사" })];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, q: "카카오" });
    expect(result).toHaveLength(1);
  });

  test("검색어가 ISIN에 매치하고 대소문자를 무시한다", () => {
    const rows = [makeRow({ isinCd: "KR6000000123" })];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, q: "kr6000000123" });
    expect(result).toHaveLength(1);
  });

  test("다중선택은 라벨이 아니라 코드로 비교한다", () => {
    const rows = [
      makeRow({ isinCd: "A", bondIntTcd: "01", bondIntTcdNm: "이표채" }),
      makeRow({ isinCd: "B", bondIntTcd: "02", bondIntTcdNm: "할인채" }),
    ];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, intTcds: ["02"] });
    expect(result).toHaveLength(1);
    expect(result[0].isinCd).toBe("B");
  });

  test("범위 필터는 경계값을 포함한다", () => {
    const rows = [
      makeRow({ isinCd: "A", bondSrfcInrt: 3 }),
      makeRow({ isinCd: "B", bondSrfcInrt: 5 }),
      makeRow({ isinCd: "C", bondSrfcInrt: 7 }),
    ];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, srfcInrtMin: 3, srfcInrtMax: 5 });
    expect(result.map((r) => r.isinCd)).toEqual(["A", "B"]);
  });

  test("표면이율 0인 행이 srfcInrtMin: 0에 포함된다 (0 !== null)", () => {
    const rows = [makeRow({ isinCd: "A", bondSrfcInrt: 0 })];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, srfcInrtMin: 0 });
    expect(result).toHaveLength(1);
  });

  test("범위 필터가 활성일 때 값이 null인 행은 제외한다", () => {
    const rows = [makeRow({ isinCd: "A", bondBal: null }), makeRow({ isinCd: "B", bondBal: 1_000_000 })];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, bondBalMin: 0 });
    expect(result.map((r) => r.isinCd)).toEqual(["B"]);
  });

  test("여러 필터가 AND로 결합된다", () => {
    const rows = [
      makeRow({ isinCd: "A", kisGrade: "AAA", mrktCtg: "일반채권" }),
      makeRow({ isinCd: "B", kisGrade: "AAA", mrktCtg: "KTS" }),
      makeRow({ isinCd: "C", kisGrade: "BBB", mrktCtg: "일반채권" }),
    ];
    const result = applyFilters(rows, { ...EMPTY_FILTERS, grades: ["AAA"], markets: ["일반채권"] });
    expect(result.map((r) => r.isinCd)).toEqual(["A"]);
  });
});

describe("countActiveFilters", () => {
  test("빈 필터는 0", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  test("공백만 있는 검색어는 비활성으로 취급한다", () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, q: "   " })).toBe(0);
  });

  test("min/max 중 하나만 있어도 활성 1건으로 센다", () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, srfcInrtMin: 1 })).toBe(1);
  });
});

describe("buildFilterOptions", () => {
  test("등급 선택지가 compareGrade 서열(AAA→D)로 정렬된다", () => {
    const rows = [
      makeRow({ isinCd: "A", kisGrade: "BBB" }),
      makeRow({ isinCd: "B", kisGrade: "AAA" }),
      makeRow({ isinCd: "C", kisGrade: "AA+" }),
    ];
    const options = buildFilterOptions(rows);
    expect(options.grades.map((o) => o.code)).toEqual(["AAA", "AA+", "BBB"]);
  });

  test("코드가 null인 행은 선택지에서 제외한다", () => {
    const rows = [makeRow({ isinCd: "A", kisGrade: null }), makeRow({ isinCd: "B", kisGrade: "AAA" })];
    const options = buildFilterOptions(rows);
    expect(options.grades).toHaveLength(1);
  });

  test("코드별 건수를 집계한다", () => {
    const rows = [
      makeRow({ isinCd: "A", kisGrade: "AAA" }),
      makeRow({ isinCd: "B", kisGrade: "AAA" }),
      makeRow({ isinCd: "C", kisGrade: "BBB" }),
    ];
    const options = buildFilterOptions(rows);
    expect(options.grades.find((o) => o.code === "AAA")?.count).toBe(2);
  });

  test("시장구분은 BOND_MARKET_CATEGORIES 고정 순서를 따른다", () => {
    const rows = [
      makeRow({ isinCd: "A", mrktCtg: "소액채권" }),
      makeRow({ isinCd: "B", mrktCtg: "KTS" }),
      makeRow({ isinCd: "C", mrktCtg: "일반채권" }),
    ];
    const options = buildFilterOptions(rows);
    expect(options.markets.map((o) => o.code)).toEqual(["KTS", "일반채권", "소액채권"]);
  });
});
