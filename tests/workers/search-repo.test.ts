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

  test("kind는 한글 라벨을 code_label로 해석해 scrs_itms_kcd로 필터링한다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", scrsItmsKcd: "1101", scrsItmsKcdNm: "국채" }),
        buildIssuItem({ isinCd: "KR0000000002", scrsItmsKcd: "1108", scrsItmsKcdNm: "일반회사채" }),
        buildIssuItem({ isinCd: "KR0000000003", scrsItmsKcd: "1105", scrsItmsKcdNm: "금융채" }),
      ],
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { kind: ["국채", "금융채"], limit: 10 });
    expect(rows.map((r) => r.isin_cd).sort()).toEqual(["KR0000000001", "KR0000000003"]);
  });

  test("검색 결과에 등장한 코드의 라벨만 codeLabels로 반환한다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", scrsItmsKcd: "1101", scrsItmsKcdNm: "국채" }),
        buildIssuItem({ isinCd: "KR0000000002", scrsItmsKcd: "1108", scrsItmsKcdNm: "일반회사채" }),
      ],
      BAS_DT,
    );

    const { codeLabels } = await searchBonds(env.DB, { kind: ["국채"], limit: 10 });
    expect(codeLabels.get("scrsItmsKcd:1101")).toBe("국채");
    // 결과에 없는 종목의 코드는 담기지 않는다.
    expect(codeLabels.has("scrsItmsKcd:1108")).toBe(false);
  });

  test("minGrade는 그 등급 이상만 남기고 무등급 종목은 제외한다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", kisScrsItmsKcdNm: "AAA" }),
        buildIssuItem({ isinCd: "KR0000000002", kisScrsItmsKcdNm: "AA-" }),
        buildIssuItem({ isinCd: "KR0000000003", kisScrsItmsKcdNm: "BBB" }),
        buildIssuItem({ isinCd: "KR0000000004", kisScrsItmsKcdNm: "" }),
      ],
      BAS_DT,
    );

    const { rows } = await searchBonds(env.DB, { minGrade: "AA-", limit: 10 });
    expect(rows.map((r) => r.isin_cd).sort()).toEqual(["KR0000000001", "KR0000000002"]);
  });

  test("minGrade는 0 접미사 중간 등급(AA0/A0)도 포함한다", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001", kisScrsItmsKcdNm: "AA0" }),
        buildIssuItem({ isinCd: "KR0000000002", kisScrsItmsKcdNm: "A0" }),
      ],
      BAS_DT,
    );

    // GRADE_ORDER에서 "AA0"을 "AA"로 잘못 적으면 AA0 종목이 통째로 누락된다(실측 1,139건).
    const { rows } = await searchBonds(env.DB, { minGrade: "AA-", limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000001"]);
  });

  test("tradedSince는 그 날짜 이후 거래 기록이 없는 종목을 제외한다", async () => {
    await writeBondPage(
      env.DB,
      [buildIssuItem({ isinCd: "KR0000000001" }), buildIssuItem({ isinCd: "KR0000000002" })],
      BAS_DT,
    );
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: "KR0000000001", basDt: String(BAS_DT), srtnCd: "S00000001" }),
      buildPriceItem({ isinCd: "KR0000000002", basDt: "20200101", srtnCd: "S00000002" }),
    ]);

    const { rows } = await searchBonds(env.DB, { tradedSince: 20260801, limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000001"]);
  });

  test("sort=volume은 종목별 '마지막 거래일'의 거래량 내림차순이다(오래된 대량 거래도 포함)", async () => {
    await writeBondPage(
      env.DB,
      [
        buildIssuItem({ isinCd: "KR0000000001" }),
        buildIssuItem({ isinCd: "KR0000000002" }),
        buildIssuItem({ isinCd: "KR0000000003" }),
      ],
      BAS_DT,
    );
    await writeBondPricePage(env.DB, [
      // 종목1: 최신일 거래량 100 (그 전날엔 9999였지만 최신일 값만 봐야 한다)
      buildPriceItem({ isinCd: "KR0000000001", basDt: "20260820", trqu: 9999, srtnCd: "S00000001" }),
      buildPriceItem({ isinCd: "KR0000000001", basDt: String(BAS_DT), trqu: 100, srtnCd: "S00000001" }),
      // 종목2: 오래 전에 대량 거래 — 여전히 상위에 온다(그래서 tradedSince가 필요하다)
      buildPriceItem({ isinCd: "KR0000000002", basDt: "20200101", trqu: 500, srtnCd: "S00000002" }),
      // 종목3: 시세 자체가 없음 → NULLS LAST로 맨 뒤
    ]);

    const { rows } = await searchBonds(env.DB, { sort: "volume", limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000002", "KR0000000001", "KR0000000003"]);
  });

  test("sort=volume은 같은 최신일에 두 시장이 있으면 KTS(mrkt_ctg 최소) 행의 거래량으로 정렬한다", async () => {
    await writeBondPage(
      env.DB,
      [buildIssuItem({ isinCd: "KR0000000001" }), buildIssuItem({ isinCd: "KR0000000002" })],
      BAS_DT,
    );
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: "KR0000000001", basDt: String(BAS_DT), mrktCtg: "KTS", trqu: 10, srtnCd: "S00000001" }),
      buildPriceItem({
        isinCd: "KR0000000001",
        basDt: String(BAS_DT),
        mrktCtg: "일반채권",
        trqu: 9999,
        srtnCd: "S00000001",
      }),
      buildPriceItem({ isinCd: "KR0000000002", basDt: String(BAS_DT), mrktCtg: "KTS", trqu: 50, srtnCd: "S00000002" }),
    ]);

    // 종목1의 일반채권 거래량(9999)이 아니라 KTS 거래량(10)이 정렬 기준이라 종목2가 앞선다 —
    // 응답의 latestPrice가 고르는 행(KTS 우선)과 정렬 기준을 일치시킨 결과다.
    const { rows } = await searchBonds(env.DB, { sort: "volume", limit: 10 });
    expect(rows.map((r) => r.isin_cd)).toEqual(["KR0000000002", "KR0000000001"]);
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

  test(
    "sort=volume·tradedSince는 bond_price를 PK 시크로만 훑는다 " +
      "(회귀 방지 — 서브쿼리가 SCAN으로 풀리면 560k행 전량 스캔이 된다)",
    async () => {
      const { sql, binds } = buildBondSearchQuery({ sort: "volume", tradedSince: 20260801, limit: 20 });
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...binds)
        .all<{ detail: string }>();
      const priceSteps = plan.results.map((r) => r.detail).filter((d) => d.includes(" p ") || d.includes(" p2 "));

      expect(priceSteps.length).toBeGreaterThan(0);
      for (const step of priceSteps) expect(step).toContain("USING PRIMARY KEY");
      expect(priceSteps.some((d) => d.startsWith("SCAN"))).toBe(false);
    },
  );
});
