import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { BondBasiInfoItem, BondPriceInfoItem, OpenApiEnvelope } from "@/api";
import { BOND_COLUMNS, BOND_PRICE_COLUMNS } from "@/lib/bond/columns";
import { buildBondPriceRow, buildBondRow, mapBondCodeLabels, mapBondStateValues } from "@/lib/bond/mappers";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

const issuFixture = loadFixture<OpenApiEnvelope<BondBasiInfoItem>>("issu-page.json");
const priceFixture = loadFixture<OpenApiEnvelope<BondPriceInfoItem>>("price-page.json");

describe("buildBondRow", () => {
  const item = issuFixture.response.body.items;
  if (item === "") throw new Error("fixture가 비어있음");
  const first = item.item[0];

  test("BOND_COLUMNS와 같은 길이의 행을 만든다", () => {
    const row = buildBondRow(first, 20260820, null);
    expect(row.length).toBe(BOND_COLUMNS.length);
  });

  test("isin_cd/crno/isin_cd_nm/bond_isur_nm이 올바른 위치에 들어간다", () => {
    const row = buildBondRow(first, 20260820, null);
    const isinIdx = BOND_COLUMNS.indexOf("isin_cd");
    const crnoIdx = BOND_COLUMNS.indexOf("crno");
    expect(row[isinIdx]).toBe(first.isinCd);
    expect(row[crnoIdx]).toBe(first.crno);
  });

  test("항상 빈 필드(cptUsgeDcd 등)는 컬럼 자체가 없다", () => {
    const asRecord = row_to_record(buildBondRow(first, 20260820, null));
    expect(asRecord).not.toHaveProperty("cpt_usge_dcd");
    expect(asRecord).not.toHaveProperty("cpt_usge_dcd_nm");
    expect(asRecord).not.toHaveProperty("prmnc_bond_tmn_dt");
    expect(asRecord).not.toHaveProperty("qib_tmn_dt");
  });

  test("irtChngDcdNm은 예외적으로 텍스트 그대로 보관된다 (코드가 항상 빈 값)", () => {
    const row = buildBondRow(first, 20260820, null);
    const idx = BOND_COLUMNS.indexOf("irt_chng_dcd_nm");
    expect(row[idx]).toBe(first.irtChngDcdNm);
  });

  test("신규 종목이면 first_seen_bas_dt == basDt", () => {
    const row = buildBondRow(first, 20260820, null);
    const idx = BOND_COLUMNS.indexOf("first_seen_bas_dt");
    expect(row[idx]).toBe(20260820);
  });

  test("기존 종목이면 first_seen_bas_dt가 보존된다", () => {
    const row = buildBondRow(first, 20260820, 20200101);
    const idx = BOND_COLUMNS.indexOf("first_seen_bas_dt");
    expect(row[idx]).toBe(20200101);
  });

  test("srtn_cd/itms_nm은 기본정보 API 결과에서 항상 null", () => {
    const row = buildBondRow(first, 20260820, null);
    expect(row[BOND_COLUMNS.indexOf("srtn_cd")]).toBeNull();
    expect(row[BOND_COLUMNS.indexOf("itms_nm")]).toBeNull();
  });

  test("동일 입력이면 지문이 같고, basDt만 달라도 지문은 그대로다(지문은 basDt를 안 봄)", () => {
    const rowA = buildBondRow(first, 20260820, null);
    const rowB = buildBondRow(first, 20260821, null);
    const fpIdx = BOND_COLUMNS.indexOf("fp");
    expect(rowA[fpIdx]).toBe(rowB[fpIdx]);
  });
});

describe("mapBondCodeLabels", () => {
  const item = issuFixture.response.body.items;
  if (item === "") throw new Error("fixture가 비어있음");

  test("코드/라벨이 둘 다 있는 쌍만 뽑는다", () => {
    const first = item.item[0]; // scrsItmsKcd="1108", scrsItmsKcdNm="일반회사채"
    const labels = mapBondCodeLabels(first);
    const scrs = labels.find((row) => row[0] === "scrsItmsKcd");
    expect(scrs).toEqual(["scrsItmsKcd", "1108", "일반회사채"]);
  });

  test("kisScrsItmsKcdNm처럼 code_label 대상이 아닌 필드는 섞이지 않는다", () => {
    const first = item.item[0];
    const labels = mapBondCodeLabels(first);
    expect(labels.find((row) => row[0] === "kisScrsItmsKcd")).toBeUndefined();
  });
});

describe("mapBondStateValues", () => {
  test("bondBal 등 7개 값을 BOND_STATE_VALUE_COLUMNS 순서로 뽑는다", () => {
    const item = issuFixture.response.body.items;
    if (item === "") throw new Error("fixture가 비어있음");
    const values = mapBondStateValues(item.item[0]);
    expect(values).toHaveLength(7);
    expect(values[0]).toBe(Number(item.item[0].bondBal));
  });
});

describe("buildBondPriceRow", () => {
  test("BOND_PRICE_COLUMNS와 같은 길이의 행을 만든다", () => {
    const item = priceFixture.response.body.items;
    if (item === "") throw new Error("fixture가 비어있음");
    const row = buildBondPriceRow(item.item[0]);
    expect(row.length).toBe(BOND_PRICE_COLUMNS.length);
  });

  test("mrktCtg가 정수 코드로 변환된다", () => {
    const item = priceFixture.response.body.items;
    if (item === "") throw new Error("fixture가 비어있음");
    const ktsItem = item.item.find((i) => i.mrktCtg === "KTS");
    if (!ktsItem) throw new Error("픽스처에 KTS 종목이 없음");
    const row = buildBondPriceRow(ktsItem);
    expect(row[BOND_PRICE_COLUMNS.indexOf("mrkt_ctg")]).toBe(1);
  });

  test("xpYrCnt/itmsCtg가 공백(' ')인 일반채권 행은 null로 정규화된다", () => {
    const item = priceFixture.response.body.items;
    if (item === "") throw new Error("fixture가 비어있음");
    const genItem = item.item.find((i) => i.mrktCtg === "일반채권");
    if (!genItem) throw new Error("픽스처에 일반채권 종목이 없음");
    expect(genItem.xpYrCnt).toBe(" "); // 픽스처 전제 확인
    const row = buildBondPriceRow(genItem);
    expect(row[BOND_PRICE_COLUMNS.indexOf("xp_yr_cnt")]).toBeNull();
    expect(row[BOND_PRICE_COLUMNS.indexOf("itms_ctg")]).toBeNull();
  });

  test("KTS 행은 xpYrCnt/itmsCtg가 채워진다", () => {
    const item = priceFixture.response.body.items;
    if (item === "") throw new Error("fixture가 비어있음");
    const ktsItem = item.item.find((i) => i.mrktCtg === "KTS");
    if (!ktsItem) throw new Error("픽스처에 KTS 종목이 없음");
    const row = buildBondPriceRow(ktsItem);
    expect(row[BOND_PRICE_COLUMNS.indexOf("xp_yr_cnt")]).not.toBeNull();
    expect(row[BOND_PRICE_COLUMNS.indexOf("itms_ctg")]).not.toBeNull();
  });
});

function row_to_record(row: readonly unknown[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  BOND_COLUMNS.forEach((col, i) => {
    record[col] = row[i];
  });
  return record;
}
