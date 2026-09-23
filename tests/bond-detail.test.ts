import { describe, expect, test } from "vitest";
import type { BondDetailSource } from "@/lib/d1/detail-repo";
import { BOND_COLUMNS, BOND_PRICE_COLUMNS, BOND_STATE_COLUMNS, type BondRowRecord } from "@/lib/bond/columns";
import {
  PRICE_SERIES_COLUMNS,
  pairPrevPrice,
  toBondDetailFields,
  toBondDetailResponse,
  toPriceSeriesResponse,
} from "@/lib/bond/detail";

/** `BOND_COLUMNS` 전체를 채운 `bond` 행 — 기본값은 전부 null, 필요한 필드만 override. */
function buildBondRowRecord(overrides: Partial<BondRowRecord> = {}): BondRowRecord {
  const base = Object.fromEntries(BOND_COLUMNS.map((c) => [c, null])) as unknown as BondRowRecord;
  return { ...base, isin_cd: "KR6000011D36", isin_cd_nm: "테스트채권", bond_isur_nm: "테스트발행사", ...overrides };
}

describe("toBondDetailFields", () => {
  test("snake_case 컬럼명을 camelCase 응답 필드명으로 변환한다", () => {
    const bond = buildBondRowRecord({ bond_srfc_inrt: 3.25 });
    const fields = toBondDetailFields(bond, new Map());
    expect(fields.isinCd).toBe("KR6000011D36");
    expect(fields.bondIsurNm).toBe("테스트발행사");
    expect(fields.bondSrfcInrt).toBe(3.25);
  });

  test("운영 전용 컬럼(fp)은 응답에서 제외된다", () => {
    const bond = buildBondRowRecord({ fp: 12345 });
    const fields = toBondDetailFields(bond, new Map());
    expect(fields).not.toHaveProperty("fp");
  });

  test("0/1 yn 컬럼은 boolean으로 변환되고, null은 null 그대로 유지된다", () => {
    const bond = buildBondRowRecord({ strips_psbl_yn: 1, crfnd_yn: 0, prmnc_bond_yn: null });
    const fields = toBondDetailFields(bond, new Map());
    expect(fields.stripsPsblYn).toBe(true);
    expect(fields.crfndYn).toBe(false);
    expect(fields.prmncBondYn).toBeNull();
  });

  test("code_label 대상 컬럼은 {code,label} 쌍으로 변환된다", () => {
    const bond = buildBondRowRecord({ grn_dcd: "1" });
    const labels = new Map([["grnDcd:1", "보증"]]);
    const fields = toBondDetailFields(bond, labels);
    expect(fields.grnDcd).toEqual({ code: "1", label: "보증" });
  });

  test("code_label에 없는 코드는 label: null로 내려간다", () => {
    const bond = buildBondRowRecord({ grn_dcd: "9" });
    const fields = toBondDetailFields(bond, new Map());
    expect(fields.grnDcd).toEqual({ code: "9", label: null });
  });

  test("코드 자체가 null이면 {code,label} 쌍이 아니라 null 그대로 내려간다", () => {
    const bond = buildBondRowRecord({ grn_dcd: null });
    const fields = toBondDetailFields(bond, new Map());
    expect(fields.grnDcd).toBeNull();
  });

  test("irtChngDcdNm은 짝 코드가 없는 예외라 텍스트 그대로 유지된다", () => {
    const bond = buildBondRowRecord({ irt_chng_dcd_nm: "고정금리" });
    const fields = toBondDetailFields(bond, new Map());
    expect(fields.irtChngDcdNm).toBe("고정금리");
  });
});

function buildStateRow(overrides: Partial<Record<(typeof BOND_STATE_COLUMNS)[number], string | number | null>> = {}) {
  const base = Object.fromEntries(BOND_STATE_COLUMNS.map((c) => [c, null])) as Record<
    (typeof BOND_STATE_COLUMNS)[number],
    string | number | null
  >;
  return { ...base, isin_cd: "KR6000011D36", valid_from: 20260101, ...overrides };
}

function buildPriceRow(overrides: Partial<Record<(typeof BOND_PRICE_COLUMNS)[number], string | number | null>> = {}) {
  const base = Object.fromEntries(BOND_PRICE_COLUMNS.map((c) => [c, null])) as Record<
    (typeof BOND_PRICE_COLUMNS)[number],
    string | number | null
  >;
  return { ...base, isin_cd: "KR6000011D36", bas_dt: 20260828, mrkt_ctg: 2, ...overrides };
}

describe("toBondDetailResponse", () => {
  test("state는 stateHistory[0](valid_from 내림차순의 첫 행)이다", () => {
    const source: BondDetailSource = {
      bond: buildBondRowRecord(),
      stateHistory: [
        buildStateRow({ valid_from: 20260201, kis_grade: "AA-" }),
        buildStateRow({ valid_from: 20260101 }),
      ],
      latestPrices: [],
      prevPrices: [],
      codeLabels: new Map(),
    };
    const detail = toBondDetailResponse(source);
    expect(detail.state?.validFrom).toBe(20260201);
    expect(detail.state?.kisGrade).toBe("AA-");
    expect(detail.stateHistory).toHaveLength(2);
  });

  test("이력이 없으면 state는 null", () => {
    const source: BondDetailSource = {
      bond: buildBondRowRecord(),
      stateHistory: [],
      latestPrices: [],
      prevPrices: [],
      codeLabels: new Map(),
    };
    expect(toBondDetailResponse(source).state).toBeNull();
  });

  test("latestPrices의 mrktCtg 정수 코드가 문자열 시장구분으로 복원된다", () => {
    const source: BondDetailSource = {
      bond: buildBondRowRecord(),
      stateHistory: [],
      latestPrices: [buildPriceRow({ mrkt_ctg: 1 }), buildPriceRow({ mrkt_ctg: 2 })],
      prevPrices: [],
      codeLabels: new Map(),
    };
    const detail = toBondDetailResponse(source);
    expect(detail.latestPrices.map((p) => p.mrktCtg)).toEqual(["KTS", "일반채권"]);
  });
});

describe("pairPrevPrice", () => {
  // 2026-08-18(화)은 8/17 대체공휴일 다음 날 — 실제 직전 영업일은 8/14(금).
  test("직전 평일에 같은 시장 행이 있으면 그 행이다", () => {
    const cur = buildPriceRow({ bas_dt: 20260820, mrkt_ctg: 2, clpr_prc: 9961, clpr_vs: 0 });
    const prev = buildPriceRow({ bas_dt: 20260819, mrkt_ctg: 2, clpr_prc: 9961 });
    expect(pairPrevPrice(cur, [prev])).toBe(prev);
  });

  test("월요일은 직전 금요일 행을 인정한다", () => {
    const cur = buildPriceRow({ bas_dt: 20260824, mrkt_ctg: 2 });
    const prev = buildPriceRow({ bas_dt: 20260821, mrkt_ctg: 2 });
    expect(pairPrevPrice(cur, [prev])).toBe(prev);
  });

  test("공휴일을 끼어도 clpr_vs ≠ 0이고 가격 산식이 맞으면 인정한다", () => {
    const cur = buildPriceRow({ bas_dt: 20260818, mrkt_ctg: 2, clpr_prc: 9961, clpr_vs: 5 });
    const prev = buildPriceRow({ bas_dt: 20260814, mrkt_ctg: 2, clpr_prc: 9956 });
    expect(pairPrevPrice(cur, [prev])).toBe(prev);
  });

  test("공휴일을 끼고 clpr_vs = 0이면 판정할 수 없어 null", () => {
    const cur = buildPriceRow({ bas_dt: 20260818, mrkt_ctg: 2, clpr_prc: 9956, clpr_vs: 0 });
    const prev = buildPriceRow({ bas_dt: 20260814, mrkt_ctg: 2, clpr_prc: 9956 });
    expect(pairPrevPrice(cur, [prev])).toBeNull();
  });

  test("거래 공백 뒤(clpr_vs = 0)의 과거 행은 전일로 보지 않는다", () => {
    const cur = buildPriceRow({ bas_dt: 20260828, mrkt_ctg: 2, clpr_prc: 9990, clpr_vs: 0 });
    const prev = buildPriceRow({ bas_dt: 20260810, mrkt_ctg: 2, clpr_prc: 9950 });
    expect(pairPrevPrice(cur, [prev])).toBeNull();
  });

  test("가격 산식이 맞지 않으면 clpr_vs ≠ 0이어도 null", () => {
    const cur = buildPriceRow({ bas_dt: 20260828, mrkt_ctg: 2, clpr_prc: 9990, clpr_vs: 5 });
    const prev = buildPriceRow({ bas_dt: 20260810, mrkt_ctg: 2, clpr_prc: 9950 });
    expect(pairPrevPrice(cur, [prev])).toBeNull();
  });

  test("다른 시장의 행은 짝으로 쓰지 않는다", () => {
    const cur = buildPriceRow({ bas_dt: 20260820, mrkt_ctg: 1 });
    const prev = buildPriceRow({ bas_dt: 20260819, mrkt_ctg: 2 });
    expect(pairPrevPrice(cur, [prev])).toBeNull();
  });
});

describe("toBondDetailResponse — 전일대비 파생 필드", () => {
  function detailWith(latest: ReturnType<typeof buildPriceRow>[], prev: ReturnType<typeof buildPriceRow>[]) {
    return toBondDetailResponse({
      bond: buildBondRowRecord(),
      stateHistory: [],
      latestPrices: latest,
      prevPrices: prev,
      codeLabels: new Map(),
    });
  }

  test("인정된 직전 행이 있으면 prevBasDt와 수익률 차이(%p, 부동소수 오차 제거)가 붙는다", () => {
    const detail = detailWith(
      [buildPriceRow({ bas_dt: 20260820, clpr_bnf_rt: 4.044 })],
      [buildPriceRow({ bas_dt: 20260819, clpr_bnf_rt: 4.056 })],
    );
    expect(detail.latestPrices[0].prevBasDt).toBe(20260819);
    expect(detail.latestPrices[0].clprBnfRtVs).toBe(-0.012);
  });

  test("비교 불가면 prevBasDt·clprBnfRtVs 둘 다 null", () => {
    const detail = detailWith([buildPriceRow({ bas_dt: 20260820, clpr_bnf_rt: 4.044, clpr_vs: 0 })], []);
    expect(detail.latestPrices[0].prevBasDt).toBeNull();
    expect(detail.latestPrices[0].clprBnfRtVs).toBeNull();
  });

  test("직전 행의 수익률이 null이면 prevBasDt는 남고 clprBnfRtVs만 null", () => {
    const detail = detailWith(
      [buildPriceRow({ bas_dt: 20260820, clpr_bnf_rt: 4.044 })],
      [buildPriceRow({ bas_dt: 20260819, clpr_bnf_rt: null })],
    );
    expect(detail.latestPrices[0].prevBasDt).toBe(20260819);
    expect(detail.latestPrices[0].clprBnfRtVs).toBeNull();
  });
});

describe("toPriceSeriesResponse", () => {
  test("isin_cd를 뺀 BOND_PRICE_COLUMNS 순서를 camelCase로 노출한다", () => {
    expect(PRICE_SERIES_COLUMNS[0]).toBe("basDt");
    expect(PRICE_SERIES_COLUMNS).not.toContain("isinCd");
    expect(PRICE_SERIES_COLUMNS).toHaveLength(BOND_PRICE_COLUMNS.length - 1);
  });

  test("행 배열이 컬럼 순서와 대응하고 mrktCtg가 문자열로 복원된다", () => {
    const rows = [buildPriceRow({ bas_dt: 20260828, mrkt_ctg: 1, clpr_prc: 10250.5, trqu: 1000 })];
    const { columns, rows: outRows } = toPriceSeriesResponse(rows);
    const basDtIdx = columns.indexOf("basDt");
    const mrktCtgIdx = columns.indexOf("mrktCtg");
    const clprPrcIdx = columns.indexOf("clprPrc");
    expect(outRows[0][basDtIdx]).toBe(20260828);
    expect(outRows[0][mrktCtgIdx]).toBe("KTS");
    expect(outRows[0][clprPrcIdx]).toBe(10250.5);
  });
});
