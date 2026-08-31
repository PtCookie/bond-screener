/**
 * `src/lib/bond/mappers.ts` ↔ `scripts/lib/mappers.mjs` 교차검증. 기존 픽스처
 * (`tests/fixtures/issu-page.json`/`price-page.json`)의 모든 item을 양쪽 구현에 통과시켜
 * 결과 행이 완전히 동일한지 확인한다.
 *
 * `buildBondRow`는 시그니처가 다르다 — TS는 `(item, basDt, existingFirstSeen)`으로
 * 증분 sync에서 `first_seen_bas_dt`를 보존하고, JS(백필 전용)는 `(item, basDt)`뿐이며
 * `first_seen_bas_dt`가 항상 `basDt`다(백필 = 최초 적재이므로 "기존 값 보존" 개념이
 * 없다 — 의도된 차이). 공정한 비교를 위해 TS 쪽을 `existingFirstSeen: null`(→ basDt로
 * 폴백)로 호출해 "신규 행" 시나리오로 맞춘다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { BondBasiInfoItem, BondPriceInfoItem, OpenApiEnvelope } from "@/api";
import { buildBondPriceRow, buildBondRow, buildBondStateRow, mapBondCodeLabels } from "@/lib/bond/mappers";
import {
  buildBondPriceRow as buildBondPriceRowJs,
  buildBondRow as buildBondRowJs,
  buildBondStateRow as buildBondStateRowJs,
  mapBondCodeLabels as mapBondCodeLabelsJs,
} from "../../scripts/lib/mappers.mjs";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

const issuFixture = loadFixture<OpenApiEnvelope<BondBasiInfoItem>>("issu-page.json");
const priceFixture = loadFixture<OpenApiEnvelope<BondPriceInfoItem>>("price-page.json");

const issuItems = issuFixture.response.body.items;
const priceItems = priceFixture.response.body.items;
if (issuItems === "" || priceItems === "") throw new Error("fixture가 비어있음");

const BAS_DT = 20260828;

describe("buildBondRow 교차검증", () => {
  test.each(issuItems.item.map((item, i) => [i, item] as const))("item %i: 전체 행이 동일하다", (_, item) => {
    const tsRow = buildBondRow(item, BAS_DT, null);
    const jsRow = buildBondRowJs(item, BAS_DT);
    expect(jsRow).toEqual(tsRow);
  });
});

describe("buildBondStateRow 교차검증", () => {
  test.each(issuItems.item.map((item, i) => [i, item] as const))("item %i: 전체 행이 동일하다", (_, item) => {
    const tsRow = buildBondStateRow(item, item.isinCd, BAS_DT);
    const jsRow = buildBondStateRowJs(item, item.isinCd, BAS_DT);
    expect(jsRow).toEqual(tsRow);
  });
});

describe("mapBondCodeLabels 교차검증", () => {
  test.each(issuItems.item.map((item, i) => [i, item] as const))(
    "item %i: code_label 행 배열이 동일하다",
    (_, item) => {
      const tsRows = mapBondCodeLabels(item);
      const jsRows = mapBondCodeLabelsJs(item);
      expect(jsRows).toEqual(tsRows);
    },
  );
});

describe("buildBondPriceRow 교차검증", () => {
  test.each(priceItems.item.map((item, i) => [i, item] as const))("item %i: 전체 행이 동일하다", (_, item) => {
    const tsRow = buildBondPriceRow(item);
    const jsRow = buildBondPriceRowJs(item);
    expect(jsRow).toEqual(tsRow);
  });
});
