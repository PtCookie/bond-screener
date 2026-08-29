/**
 * 오픈API 응답 봉투를 문자열로 조립하는 테스트 헬퍼. `fetchOpenApiPage`가 `res.text()`로
 * 읽으므로(client.ts:52) 다중 페이지·`totalCount` 경계 시나리오는 문자열 레벨에서
 * 만들어야 한다. `tests/client.test.ts`의 `stubFetch`(단일 픽스처 파일 반환)와 달리
 * 여기서는 item 개수·totalCount를 자유롭게 조작한다.
 */
import type { BondBasiInfoItem, BondPriceInfoItem } from "@/api";
import issuFixture from "../../fixtures/issu-page.json";
import priceFixture from "../../fixtures/price-page.json";

const issuTemplate = (issuFixture.response.body.items as { item: BondBasiInfoItem[] }).item[0];
const priceTemplate = (priceFixture.response.body.items as { item: BondPriceInfoItem[] }).item[0];

/** 실제 응답 1건을 템플릿 삼아 `isinCd`(및 필요한 필드)만 갈아끼운다. */
export function buildIssuItem(overrides: Partial<BondBasiInfoItem>): BondBasiInfoItem {
  return { ...issuTemplate, ...overrides };
}

export function buildIssuItems(count: number, basDt: string): BondBasiInfoItem[] {
  return Array.from({ length: count }, (_, i) =>
    buildIssuItem({ isinCd: `KR${basDt}${String(i).padStart(6, "0")}`, basDt }),
  );
}

export function buildPriceItem(overrides: Partial<BondPriceInfoItem>): BondPriceInfoItem {
  return { ...priceTemplate, ...overrides };
}

export function buildPriceItems(count: number, basDt: string): BondPriceInfoItem[] {
  return Array.from({ length: count }, (_, i) =>
    buildPriceItem({
      isinCd: `KR${basDt}${String(i).padStart(6, "0")}`,
      srtnCd: `S${basDt}${String(i).padStart(3, "0")}`,
      basDt,
    }),
  );
}

/** 정상 응답 봉투(HTTP 200, `resultCode: "00"`). */
export function buildEnvelope<TItem>(opts: {
  items: TItem[];
  totalCount: number;
  pageNo?: number;
  numOfRows?: number;
}): string {
  return JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: {
        numOfRows: String(opts.numOfRows ?? opts.items.length),
        pageNo: String(opts.pageNo ?? 1),
        totalCount: opts.totalCount,
        // 오픈API 특성: 0건이면 items가 빈 문자열로 온다(객체가 아님).
        items: opts.items.length === 0 ? "" : { item: opts.items },
      },
    },
  });
}

/** API 레벨 오류 봉투(HTTP 200, `resultCode !== "00"`). */
export function buildErrorEnvelope(resultCode: string, resultMsg: string): string {
  return JSON.stringify({
    response: {
      header: { resultCode, resultMsg },
      body: { numOfRows: "1", pageNo: "1", totalCount: "0", items: "" },
    },
  });
}
