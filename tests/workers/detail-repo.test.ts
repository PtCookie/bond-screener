import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { writeBondPricePage } from "@/lib/d1/price-repo";
import { fetchBondDetail, resolveIsinCd } from "@/lib/d1/detail-repo";
import { resetD1 } from "./helpers/reset-d1";
import { buildIssuItem, buildPriceItem } from "./helpers/envelope";

beforeEach(resetD1);

const ISIN = "KR6000011D36";

describe("resolveIsinCd", () => {
  test("ISIN이면 조회 없이 그대로 반환한다", async () => {
    const result = await resolveIsinCd(env.DB, { kind: "isin", value: ISIN });
    expect(result).toBe(ISIN);
  });

  test("srtnCd는 bond.srtn_cd로 조회해 isin_cd를 반환한다 (idx_bond_srtn_cd 경로)", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: ISIN })], 20260828);
    await writeBondPricePage(env.DB, [buildPriceItem({ isinCd: ISIN, srtnCd: "000001D3", basDt: "20260828" })]);

    const result = await resolveIsinCd(env.DB, { kind: "srtn", value: "000001D3" });
    expect(result).toBe(ISIN);
  });

  test("존재하지 않는 srtnCd는 null", async () => {
    const result = await resolveIsinCd(env.DB, { kind: "srtn", value: "NOPE0000" });
    expect(result).toBeNull();
  });
});

describe("fetchBondDetail", () => {
  test("존재하지 않는 isinCd는 null", async () => {
    const result = await fetchBondDetail(env.DB, "KRNOTFOUND12");
    expect(result).toBeNull();
  });

  test("bond 행과 code_label 라벨을 함께 반환한다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: ISIN, grnDcd: "1", grnDcdNm: "보증" })], 20260828);

    const result = await fetchBondDetail(env.DB, ISIN);
    expect(result?.bond.isin_cd).toBe(ISIN);
    expect(result?.bond.grn_dcd).toBe("1");
    expect(result?.codeLabels.get("grnDcd:1")).toBe("보증");
  });

  test("bond_state 이력이 valid_from 내림차순으로 온다 (SCD Type 2)", async () => {
    // 첫 basDt: kis_grade=AA-. 두 번째 basDt: kis_grade=AA로 변경 → 새 이력 행 생성 + 기존 행 마감.
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: ISIN, kisScrsItmsKcdNm: "AA-" })], 20260801);
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: ISIN, kisScrsItmsKcdNm: "AA" })], 20260828);

    const result = await fetchBondDetail(env.DB, ISIN);
    expect(result?.stateHistory).toHaveLength(2);
    expect(result?.stateHistory[0]).toMatchObject({ valid_from: 20260828, valid_to: null, kis_grade: "AA" });
    expect(result?.stateHistory[1]).toMatchObject({ valid_from: 20260801, valid_to: 20260828, kis_grade: "AA-" });
  });

  test("같은 basDt에 두 시장 시세가 동시에 있으면 latestPrices에 둘 다 온다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: ISIN })], 20260828);
    await writeBondPricePage(env.DB, [
      buildPriceItem({ isinCd: ISIN, basDt: "20260828", mrktCtg: "KTS", srtnCd: "000001D3" }),
      buildPriceItem({ isinCd: ISIN, basDt: "20260828", mrktCtg: "일반채권", srtnCd: "000001D3" }),
    ]);

    const result = await fetchBondDetail(env.DB, ISIN);
    expect(result?.latestPrices).toHaveLength(2);
    expect(result?.latestPrices.map((p) => p.mrkt_ctg).sort()).toEqual([1, 2]);
  });

  test("최신 bas_dt 하루치만 오고 과거 시세는 제외된다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: ISIN })], 20260828);
    await writeBondPricePage(env.DB, [buildPriceItem({ isinCd: ISIN, basDt: "20260820", srtnCd: "000001D3" })]);
    await writeBondPricePage(env.DB, [buildPriceItem({ isinCd: ISIN, basDt: "20260828", srtnCd: "000001D3" })]);

    const result = await fetchBondDetail(env.DB, ISIN);
    expect(result?.latestPrices).toHaveLength(1);
    expect(result?.latestPrices[0].bas_dt).toBe(20260828);
  });
});
