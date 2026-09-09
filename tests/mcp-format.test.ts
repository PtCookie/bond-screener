import { describe, expect, test } from "vitest";
import type { BondDetailResponse } from "@/lib/bond/detail";
import type { BondPriceRowRecord } from "@/lib/bond/columns";
import type { BondSearchLatestPriceRow, BondSearchRow } from "@/lib/d1/search-repo";
import { priceRowsForLlm, toBondSearchResultRows, toBondSummary } from "@/lib/mcp/format";

function buildPriceRow(overrides: Partial<BondPriceRowRecord> = {}): BondPriceRowRecord {
  return {
    isin_cd: "KR6000011D36",
    bas_dt: 20260828,
    mrkt_ctg: 2,
    clpr_prc: 10000,
    clpr_vs: 5,
    clpr_bnf_rt: 3.5,
    mkp_prc: null,
    mkp_bnf_rt: null,
    hipr_prc: null,
    hipr_bnf_rt: null,
    lopr_prc: null,
    lopr_bnf_rt: null,
    trqu: 1000,
    tr_prc: null,
    xp_yr_cnt: null,
    itms_ctg: null,
    ...overrides,
  };
}

describe("priceRowsForLlm", () => {
  test("컬럼 지향 출력을 self-describing한 행 객체 배열로 편다", () => {
    const rows = priceRowsForLlm([buildPriceRow()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ basDt: 20260828, mrktCtg: "일반채권", clprPrc: 10000, trqu: 1000 });
  });

  test("빈 입력은 빈 배열", () => {
    expect(priceRowsForLlm([])).toEqual([]);
  });
});

describe("toBondSummary", () => {
  const detail: BondDetailResponse = {
    bond: {
      isinCdNm: "국고채권01125-2603(23-2)",
      bondIsurNm: "대한민국",
      bondExprDt: 20260315,
      bondIssuDt: 20230315,
      bondSrfcInrt: 3.125,
      bondIntTcd: { code: "01", label: "이표채" },
    },
    state: { bondBal: 5_000_000_000, kisGrade: "AAA", kbpGrade: "AAA", niceGrade: "AAA", fnGrade: "AAA" },
    stateHistory: [],
    latestPrices: [],
  };

  test("bond/state에서 핵심 필드만 추린다", () => {
    const summary = toBondSummary("KR6000011D36", "000001D3", detail);
    expect(summary).toMatchObject({
      isinCd: "KR6000011D36",
      srtnCd: "000001D3",
      name: "국고채권01125-2603(23-2)",
      issuer: "대한민국",
      maturityDate: 20260315,
      couponRate: 3.125,
      outstandingBalance: 5_000_000_000,
      grades: { kis: "AAA", kbp: "AAA", nice: "AAA", fn: "AAA" },
    });
  });

  test("state가 없으면 grades/outstandingBalance는 null", () => {
    const summary = toBondSummary("KR6000011D36", null, { ...detail, state: null });
    expect(summary.grades).toBeNull();
    expect(summary.outstandingBalance).toBeNull();
  });
});

describe("toBondSearchResultRows", () => {
  const row: BondSearchRow = {
    isin_cd: "KR6000011D36",
    srtn_cd: "000001D3",
    isin_cd_nm: "국고채권01125-2603(23-2)",
    bond_isur_nm: "대한민국",
    bond_expr_dt: 20260315,
    bond_srfc_inrt: 3.125,
    bond_int_tcd: "01",
    scrs_itms_kcd: "1101",
    bond_bal: 5_000_000_000,
    kis_grade: "AAA",
  };

  const codeLabels = new Map([
    ["scrsItmsKcd:1101", "국채"],
    ["bondIntTcd:01", "이표채"],
  ]);

  test("최신 시세가 있으면 latestPrice를 붙인다", () => {
    const price: BondSearchLatestPriceRow = {
      isin_cd: "KR6000011D36",
      bas_dt: 20260828,
      mrkt_ctg: 1,
      clpr_prc: 10500,
      clpr_vs: -3,
      clpr_bnf_rt: 3.01,
      trqu: 2000,
    };
    const [result] = toBondSearchResultRows([row], [price]);
    expect(result.latestPrice).toMatchObject({ basDt: 20260828, market: "KTS", closePrice: 10500 });
  });

  test("최신 시세가 없는 종목은 latestPrice가 null", () => {
    const [result] = toBondSearchResultRows([row], []);
    expect(result.latestPrice).toBeNull();
  });

  test("행이 없으면 빈 배열", () => {
    expect(toBondSearchResultRows([], [])).toEqual([]);
  });

  test("codeLabels로 종류·이자유형 코드의 라벨을 붙인다", () => {
    const [result] = toBondSearchResultRows([row], [], codeLabels);
    expect(result).toMatchObject({
      kind: "1101",
      kindName: "국채",
      interestType: "01",
      interestTypeName: "이표채",
    });
  });

  test("codeLabels에 없는 코드는 라벨이 null이고 코드 원문은 유지된다", () => {
    const [result] = toBondSearchResultRows([{ ...row, scrs_itms_kcd: "9999" }], [], codeLabels);
    expect(result.kind).toBe("9999");
    expect(result.kindName).toBeNull();
  });

  test("코드 자체가 null이면 코드·라벨 모두 null", () => {
    const [result] = toBondSearchResultRows([{ ...row, scrs_itms_kcd: null, bond_int_tcd: null }], [], codeLabels);
    expect(result.kind).toBeNull();
    expect(result.kindName).toBeNull();
    expect(result.interestType).toBeNull();
    expect(result.interestTypeName).toBeNull();
  });

  test("같은 종목에 두 시장 시세가 있으면 먼저 등장한(mrkt_ctg가 작은) 쪽을 결정적으로 채택한다", () => {
    const kts: BondSearchLatestPriceRow = {
      isin_cd: "KR6000011D36",
      bas_dt: 20260828,
      mrkt_ctg: 1,
      clpr_prc: 10500,
      clpr_vs: -3,
      clpr_bnf_rt: 3.01,
      trqu: 2000,
    };
    const general: BondSearchLatestPriceRow = { ...kts, mrkt_ctg: 2, clpr_prc: 10490 };

    // BOND_SEARCH_LATEST_PRICE_SQL은 mrkt_ctg ASC로 정렬해 반환하므로 KTS가 먼저 온다.
    const [result] = toBondSearchResultRows([row], [kts, general]);
    expect(result.latestPrice).toMatchObject({ market: "KTS", closePrice: 10500 });
  });
});
