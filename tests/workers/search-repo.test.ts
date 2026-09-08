import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { writeBondPricePage } from "@/lib/d1/price-repo";
import { searchBonds } from "@/lib/d1/search-repo";
import { buildBondSearchQuery } from "@/lib/d1/sql";
import { resetD1 } from "./helpers/reset-d1";
import { buildIssuItem, buildPriceItem } from "./helpers/envelope";

beforeEach(resetD1);

const BAS_DT = 20260828;

describe("searchBonds", () => {
  test("issuer 부분일치로 필터링한다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", bondIsurNm: "한국전력공사" }),
        buildIssuItem({ isinCd: "KR0000000002", bondIsurNm: "대한민국" }),
      ],
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { issuer: "한국전력", limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].isin_cd).toBe("KR0000000001");
  });

  test("만기일 범위 필터가 idx_bond_expr_dt 컬럼(bond_expr_dt)에 걸린다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", bondExprDt: "20260301" }),
        buildIssuItem({ isinCd: "KR0000000002", bondExprDt: "20301231" }),
      ],
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { exprFrom: 20270101, limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000002"]);
  });

  test("신용등급(kis_grade) 화이트리스트로 필터링한다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", kisScrsItmsKcdNm: "AAA" }),
        buildIssuItem({ isinCd: "KR0000000002", kisScrsItmsKcdNm: "BBB" }),
      ],
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { grade: ["AAA"], limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000001"]);
  });

  test("정렬 기준(bondBal)이 내림차순으로 적용된다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", bondBal: "1000" }),
        buildIssuItem({ isinCd: "KR0000000002", bondBal: "5000" }),
      ],
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { sort: "bondBal", limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000002", "KR0000000001"]);
  });

  test("limit을 넘는 결과는 잘린다", async () => {
    await writeBondPage(
      env.DB,
      Array.from({ length: 5 }, (_, i) => buildIssuItem({ isinCd: `KR000000000${i}` })),
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { limit: 2 });
    expect(rows).toHaveLength(2);
  });

  test("검색 결과 종목의 최신 시세를 latestPrices에 붙인다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: "KR0000000001" })], BAS_DT);
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: "KR0000000001", basDt: "20260820", srtnCd: "S00000001" }),
      buildPriceItem({ isinCd: "KR0000000001", basDt: String(BAS_DT), srtnCd: "S00000001" }),
    ]);

    const { rows, latestPrices } = await searchBonds(env.DB, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(latestPrices).toHaveLength(1);
    expect(latestPrices[0]).toMatchObject({ isin_cd: "KR0000000001", bas_dt: BAS_DT });
  });

  test("같은 basDt에 두 시장 시세가 있으면 mrkt_ctg 오름차순(KTS 먼저)으로 반환한다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: "KR0000000001" })], BAS_DT);
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: "KR0000000001", basDt: String(BAS_DT), mrktCtg: "일반채권", srtnCd: "S00000001" }),
      buildPriceItem({ isinCd: "KR0000000001", basDt: String(BAS_DT), mrktCtg: "KTS", srtnCd: "S00000001" }),
    ]);

    const { latestPrices } = await searchBonds(env.DB, { limit: 10 });
    expect(latestPrices).toHaveLength(2);
    expect(latestPrices.map((p) => p.mrkt_ctg)).toEqual([1, 2]);
  });

  test("시세가 없는 종목은 latestPrices에서 빠진다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: "KR0000000001" })], BAS_DT);

    const { rows, latestPrices } = await searchBonds(env.DB, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(latestPrices).toEqual([]);
  });

  test("결과가 0건이면 latestPrices 조회를 생략한다", async () => {
    const { rows, latestPrices } = await searchBonds(env.DB, { issuer: "존재하지않음", limit: 10 });
    expect(rows).toEqual([]);
    expect(latestPrices).toEqual([]);
  });

  test(
    "기본 정렬(exprDt)은 idx_bond_expr_dt로 스캔하고 별도 정렬 단계를 타지 않는다 " +
      "(회귀 방지 — `IS NULL, ASC` 관용구는 실측상 인덱스가 있어도 매번 TEMP B-TREE 정렬을 태웠다)",
    async () => {
      const { sql, binds } = buildBondSearchQuery({ limit: 20 });
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...binds)
        .all<{ detail: string }>();
      const details = plan.results.map((r) => r.detail);
      expect(details.some((d) => d.includes("TEMP B-TREE"))).toBe(false);
      expect(details.some((d) => d.includes("idx_bond_expr_dt"))).toBe(true);
    },
  );
});
