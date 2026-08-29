import { describe, expect, test } from "vitest";
import type { BondDetailSource } from "@/lib/d1/detail-repo";
import { BOND_COLUMNS, BOND_PRICE_COLUMNS, BOND_STATE_COLUMNS, type BondRowRecord } from "@/lib/bond/columns";
import {
  PRICE_SERIES_COLUMNS,
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
      codeLabels: new Map(),
    };
    expect(toBondDetailResponse(source).state).toBeNull();
  });

  test("latestPrices의 mrktCtg 정수 코드가 문자열 시장구분으로 복원된다", () => {
    const source: BondDetailSource = {
      bond: buildBondRowRecord(),
      stateHistory: [],
      latestPrices: [buildPriceRow({ mrkt_ctg: 1 }), buildPriceRow({ mrkt_ctg: 2 })],
      codeLabels: new Map(),
    };
    const detail = toBondDetailResponse(source);
    expect(detail.latestPrices.map((p) => p.mrktCtg)).toEqual(["KTS", "일반채권"]);
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
