// 백필 전용 API 클라이언트. src/lib/openapi/client.ts와 같은 처리 순서를 따르지만,
// Node 스크립트에서 TS를 import할 수 없어 plain JS로 중복 구현했다.
// 베이스 URL/오퍼레이션명의 정본은 src/api/bond-issu-info.ts, src/api/bond-price-info.ts —
// 고치면 그쪽도 같이 확인할 것.
export const ISSU_BASE_URL = "https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2";
export const ISSU_OPERATION = "getBondBasiInfo_V2";
export const PRICE_BASE_URL = "https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService";
export const PRICE_OPERATION = "getBondPriceInfo";

/**
 * @param {string} baseUrl
 * @param {string} operation
 * @param {Record<string, string|number|undefined>} params
 * @param {string} serviceKey
 * @returns {Promise<{items: any[], totalCount: number, pageNo: number, numOfRows: number, rawBody: string}>}
 */
export async function fetchPage(baseUrl, operation, params, serviceKey) {
  const search = new URLSearchParams();
  search.set("serviceKey", serviceKey);
  search.set("resultType", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    search.set(k, String(v));
  }
  const url = `${baseUrl}/${operation}?${search.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const rawBody = await res.text();

  if (!res.ok) {
    let detail = rawBody.slice(0, 300);
    try {
      const parsed = JSON.parse(rawBody);
      const header = parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader;
      if (header) detail = `${header.returnReasonCode} ${header.errMsg}`;
    } catch {
      // rawBody 그대로 사용
    }
    throw new Error(`GW 오류: HTTP ${res.status} ${detail}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(`JSON 파싱 실패 (앞 200자: ${rawBody.slice(0, 200)})`);
  }
  if (!parsed?.response) {
    throw new Error(`.response 없음 (앞 200자: ${rawBody.slice(0, 200)})`);
  }

  const { header, body } = parsed.response;
  if (header.resultCode !== "00") {
    throw new Error(`API 오류: ${header.resultCode} ${header.resultMsg}`);
  }

  const items = typeof body.items === "string" ? [] : body.items.item;
  return {
    items,
    totalCount: Number(body.totalCount) || 0,
    pageNo: Number(body.pageNo) || 1,
    numOfRows: Number(body.numOfRows) || items.length,
    rawBody,
  };
}

/** 30 TPS 제한을 지키기 위한 최소 호출 간격(ms). 여유를 둬 25 TPS로 제한. */
export const MIN_CALL_INTERVAL_MS = Math.ceil(1000 / 25);

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
