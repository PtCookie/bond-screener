import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { fetchBondPriceSeries, writeBondPricePage } from "@/lib/d1/price-repo";
import { resetD1 } from "./helpers/reset-d1";
import { buildPriceItem } from "./helpers/envelope";

beforeEach(resetD1);

const ISIN = "KR6000011D36";

/** 연속된 basDt(YYYYMMDD 정수)에 대해 종목 1건씩 시세를 적재한다. */
async function seedDailyPrices(basDts: number[], mrktCtg: "KTS" | "일반채권" | "소액채권" = "일반채권") {
  for (const basDt of basDts) {
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: ISIN, basDt: String(basDt), mrktCtg, srtnCd: "000001D3" }),
    ]);
  }
}

describe("fetchBondPriceSeries", () => {
  test("from/to 범위(포함)로 bas_dt 오름차순 행을 반환한다", async () => {
    await seedDailyPrices([20260101, 20260102, 20260103, 20260104]);

    const { rows, truncated } = await fetchBondPriceSeries(env.DB, ISIN, {
      from: 20260102,
      to: 20260103,
      marketCode: null,
      limit: 100,
    });

    expect(rows.map((r) => r.bas_dt)).toEqual([20260102, 20260103]);
    expect(truncated).toBe(false);
  });

  test("경계값(from/to와 정확히 같은 bas_dt)도 포함된다", async () => {
    await seedDailyPrices([20260101, 20260102, 20260103]);

    const { rows } = await fetchBondPriceSeries(env.DB, ISIN, {
      from: 20260101,
      to: 20260103,
      marketCode: null,
      limit: 100,
    });

    expect(rows.map((r) => r.bas_dt)).toEqual([20260101, 20260102, 20260103]);
  });

  test("market 필터를 걸면 해당 시장 코드의 행만 온다", async () => {
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: ISIN, basDt: "20260101", mrktCtg: "KTS", srtnCd: "000001D3" }),
      buildPriceItem({ isinCd: ISIN, basDt: "20260101", mrktCtg: "일반채권", srtnCd: "000001D3" }),
    ]);

    const { rows } = await fetchBondPriceSeries(env.DB, ISIN, {
      from: 20260101,
      to: 20260101,
      marketCode: 1,
      limit: 100,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].mrkt_ctg).toBe(1);
  });

  test("limit을 넘는 행이 있으면 truncated:true이고 rows는 limit 개수로 잘린다", async () => {
    await seedDailyPrices([20260101, 20260102, 20260103, 20260104, 20260105]);

    const { rows, truncated } = await fetchBondPriceSeries(env.DB, ISIN, {
      from: 20260101,
      to: 20260105,
      marketCode: null,
      limit: 3,
    });

    expect(rows).toHaveLength(3);
    expect(truncated).toBe(true);
    // LIMIT+1 트릭이 여분 행을 결과에 흘려보내면 안 된다.
    expect(rows.map((r) => r.bas_dt)).toEqual([20260101, 20260102, 20260103]);
  });

  test("정확히 limit만큼만 있으면 truncated:false", async () => {
    await seedDailyPrices([20260101, 20260102, 20260103]);

    const { rows, truncated } = await fetchBondPriceSeries(env.DB, ISIN, {
      from: 20260101,
      to: 20260103,
      marketCode: null,
      limit: 3,
    });

    expect(rows).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  test("범위 밖이거나 다른 종목의 시세는 섞이지 않는다", async () => {
    await seedDailyPrices([20260101, 20260228]);
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: "KR9999999999", basDt: "20260115", srtnCd: "999999999" }),
    ]);

    const { rows } = await fetchBondPriceSeries(env.DB, ISIN, {
      from: 20260101,
      to: 20260131,
      marketCode: null,
      limit: 100,
    });

    expect(rows.map((r) => r.bas_dt)).toEqual([20260101]);
  });
});
