import { describe, expect, test } from "vitest";
import { buildBondSearchQuery, type BondSearchFilters } from "@/lib/d1/sql";
import { GRADE_ORDER } from "@/lib/bond/grade";

describe("buildBondSearchQuery", () => {
  test("필터가 없으면 WHERE 절 없이 정렬·limit만 붙는다", () => {
    const { sql, binds } = buildBondSearchQuery({ limit: 20 });
    expect(sql).not.toContain("WHERE");
    expect(sql).toContain("ORDER BY b.bond_expr_dt ASC NULLS LAST");
    expect(binds).toEqual([20]);
  });

  test("기본 호출에는 bond_price 상관 서브쿼리가 들어가지 않는다(기본 정렬 경로의 EQP 회귀 방지)", () => {
    const { sql } = buildBondSearchQuery({ limit: 20 });
    expect(sql).not.toContain("bond_price");
  });

  test("issuer/name은 LIKE 부분일치로 바인딩된다(%로 감쌈)", () => {
    const { sql, binds } = buildBondSearchQuery({ issuer: "한국전력", name: "국고채", limit: 10 });
    expect(sql).toContain("b.bond_isur_nm LIKE ?");
    expect(sql).toContain("b.isin_cd_nm LIKE ?");
    expect(binds).toEqual(["%한국전력%", "%국고채%", 10]);
  });

  test("만기·표면이율 범위 필터가 각각 >=/<= 로 바인딩된다", () => {
    const filters: BondSearchFilters = { exprFrom: 20260101, exprTo: 20301231, couponMin: 1, couponMax: 5, limit: 10 };
    const { sql, binds } = buildBondSearchQuery(filters);
    expect(sql).toContain("b.bond_expr_dt >= ?");
    expect(sql).toContain("b.bond_expr_dt <= ?");
    expect(sql).toContain("b.bond_srfc_inrt >= ?");
    expect(sql).toContain("b.bond_srfc_inrt <= ?");
    expect(binds).toEqual([20260101, 20301231, 1, 5, 10]);
  });

  test("grade 배열은 개수만큼 플레이스홀더가 있는 IN 절이 된다", () => {
    const { sql, binds } = buildBondSearchQuery({ grade: ["AAA", "AA+", "AA"], limit: 5 });
    expect(sql).toContain("s.kis_grade IN (?, ?, ?)");
    expect(binds).toEqual(["AAA", "AA+", "AA", 5]);
  });

  test("빈 grade 배열은 필터를 만들지 않는다", () => {
    const { sql, binds } = buildBondSearchQuery({ grade: [], limit: 5 });
    expect(sql).not.toContain("kis_grade IN");
    expect(sql).not.toContain("WHERE");
    expect(binds).toEqual([5]);
  });

  test("minGrade는 그 등급 이상 전부를 IN 절로 펼친다", () => {
    const { sql, binds } = buildBondSearchQuery({ minGrade: "AA-", limit: 5 });
    expect(sql).toContain("s.kis_grade IN (?, ?, ?, ?)");
    // 중간 등급은 "AA"가 아니라 "AA0" — 실제 저장 표기다(`src/lib/bond/grade.ts` 주석 참고).
    expect(binds).toEqual(["AAA", "AA+", "AA0", "AA-", 5]);
  });

  test("minGrade가 최하위 등급이면 GRADE_ORDER 전체가 펼쳐진다", () => {
    const { binds } = buildBondSearchQuery({ minGrade: "D", limit: 5 });
    expect(binds).toEqual([...GRADE_ORDER, 5]);
  });

  test("grade와 minGrade가 함께 오면 IN 절 두 개가 AND로 묶인다(교집합)", () => {
    const { sql, binds } = buildBondSearchQuery({ grade: ["AA0"], minGrade: "AA+", limit: 5 });
    expect(sql).toContain("s.kis_grade IN (?) AND s.kis_grade IN (?, ?)");
    expect(binds).toEqual(["AA0", "AAA", "AA+", 5]);
  });

  test("kind는 라벨을 code_label 서브쿼리로 해석하는 IN 절이 된다", () => {
    const { sql, binds } = buildBondSearchQuery({ kind: ["국채", "금융채"], limit: 5 });
    expect(sql).toContain(
      "b.scrs_itms_kcd IN (SELECT code FROM code_label WHERE domain = 'scrsItmsKcd' AND label IN (?, ?))",
    );
    expect(binds).toEqual(["국채", "금융채", 5]);
  });

  test("빈 kind 배열은 필터를 만들지 않는다", () => {
    const { sql, binds } = buildBondSearchQuery({ kind: [], limit: 5 });
    expect(sql).not.toContain("scrs_itms_kcd IN");
    expect(sql).not.toContain("WHERE");
    expect(binds).toEqual([5]);
  });

  test("tradedSince는 종목별 최신 bas_dt 하한으로 바인딩된다", () => {
    const { sql, binds } = buildBondSearchQuery({ tradedSince: 20260801, limit: 5 });
    expect(sql).toContain("(SELECT MAX(p.bas_dt) FROM bond_price p WHERE p.isin_cd = b.isin_cd) >= ?");
    expect(binds).toEqual([20260801, 5]);
  });

  test("balMin은 bond_state.bond_bal 하한으로 바인딩된다", () => {
    const { sql, binds } = buildBondSearchQuery({ balMin: 1_000_000, limit: 5 });
    expect(sql).toContain("s.bond_bal >= ?");
    expect(binds).toEqual([1_000_000, 5]);
  });

  test.each([
    ["bondBal", "s.bond_bal DESC NULLS LAST"],
    ["coupon", "b.bond_srfc_inrt DESC NULLS LAST"],
  ] as const)("sort=%s는 해당 ORDER BY 절을 쓴다", (sort, expectedOrder) => {
    const { sql } = buildBondSearchQuery({ sort, limit: 5 });
    expect(sql).toContain(`ORDER BY ${expectedOrder}`);
  });

  test("sort=volume은 중첩 MAX(bas_dt) 서브쿼리로 정렬한다(TEMP B-TREE를 부르는 ORDER BY bas_dt DESC 형태가 아님)", () => {
    const { sql, binds } = buildBondSearchQuery({ sort: "volume", limit: 5 });
    expect(sql).toContain("SELECT MAX(p2.bas_dt) FROM bond_price p2 WHERE p2.isin_cd = b.isin_cd");
    expect(sql).toContain("ORDER BY p.mrkt_ctg LIMIT 1) DESC NULLS LAST");
    expect(sql).not.toContain("ORDER BY p.bas_dt DESC");
    // 서브쿼리는 바인딩을 하나도 쓰지 않으므로 binds는 limit 하나뿐이다.
    expect(binds).toEqual([5]);
  });

  test("여러 필터를 조합해도 binds 순서가 WHERE 절 등장 순서 → limit 순으로 일치한다", () => {
    const { sql, binds } = buildBondSearchQuery({
      issuer: "발행사",
      exprFrom: 20260101,
      grade: ["AA+"],
      minGrade: "AAA",
      kind: ["국채"],
      tradedSince: 20260801,
      balMin: 500,
      sort: "volume",
      limit: 30,
    });
    const placeholderCount = (sql.match(/\?/g) ?? []).length;
    expect(placeholderCount).toBe(binds.length);
    expect(binds).toEqual(["%발행사%", 20260101, "AA+", "AAA", "국채", 20260801, 500, 30]);
  });
});
