/**
 * 채권 오픈API 2종 공통 fetch 계층. URL 조립, GW/API 오류 분기, `items: ""` 0건 처리를
 * 여기서 한 번만 구현하고 `src/lib/bond/issu-client.ts`/`price-client.ts`가 이를 감싼다.
 */
import type { NumericLike, OpenApiEnvelope, OpenApiGatewayErrorResponse } from "@/api";
import { normInt } from "./normalize";
import { OpenApiError, OpenApiGatewayError, OpenApiUnexpectedResponseError } from "./errors";

export interface OpenApiPage<TItem> {
  items: TItem[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  /** 원문 응답 문자열. R2 아카이브가 재직렬화 없이 그대로 쓴다. */
  rawBody: string;
}

export interface FetchOpenApiPageOptions {
  baseUrl: string;
  operation: string;
  /** `serviceKey`를 제외한 쿼리 파라미터. `resultType`은 이 함수가 항상 `json`으로 덮어쓴다. */
  params: Record<string, NumericLike | undefined>;
  /** 공공데이터포털에서 발급받은 Decoded 값. 이 함수가 정확히 한 번만 인코딩한다. */
  serviceKey: string;
  /** 테스트에서 스텁으로 대체하기 위한 주입 지점. 기본값은 전역 `fetch`. */
  fetchImpl?: typeof fetch;
  /** 요청 타임아웃(ms). 기본 20초 — probe.sh의 `--max-time 20`과 동일 규약. */
  timeoutMs?: number;
}

/**
 * 오픈API 페이지 하나를 호출해 정규화된 결과를 돌려준다.
 *
 * 처리 순서: URL 조립 → fetch → `res.text()`를 한 번만 읽어 아카이브·파싱 양쪽에 재사용
 * → HTTP 오류면 GW 오류 봉투로 파싱 시도 → JSON.parse → `.response` 존재 확인 →
 * `resultCode` 확인 → `items: ""` 타입 가드.
 */
export async function fetchOpenApiPage<TItem>(options: FetchOpenApiPageOptions): Promise<OpenApiPage<TItem>> {
  const { baseUrl, operation, params, serviceKey, timeoutMs = 20_000 } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const search = new URLSearchParams();
  search.set("serviceKey", serviceKey);
  search.set("resultType", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }

  const url = `${baseUrl}/${operation}?${search.toString()}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  const rawBody = await res.text();

  if (!res.ok) {
    throw parseGatewayError(res.status, rawBody);
  }

  let parsed: OpenApiEnvelope<TItem>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new OpenApiUnexpectedResponseError(
      `HTTP ${res.status}인데 JSON 파싱 실패 (앞 200자: ${rawBody.slice(0, 200)})`,
    );
  }

  if (!parsed || typeof parsed !== "object" || !("response" in parsed)) {
    throw new OpenApiUnexpectedResponseError(`.response 없음 (앞 200자: ${rawBody.slice(0, 200)})`);
  }

  const { header, body } = parsed.response;
  if (header.resultCode !== "00") {
    throw new OpenApiError(header.resultCode, header.resultMsg);
  }

  const items = typeof body.items === "string" ? [] : body.items.item;

  return {
    items,
    totalCount: normInt(body.totalCount) ?? 0,
    pageNo: normInt(body.pageNo) ?? 1,
    numOfRows: normInt(body.numOfRows) ?? items.length,
    rawBody,
  };
}

function parseGatewayError(httpStatus: number, rawBody: string): OpenApiGatewayError {
  try {
    const parsed: OpenApiGatewayErrorResponse = JSON.parse(rawBody);
    const header = parsed.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (header) {
      return new OpenApiGatewayError(httpStatus, header.returnReasonCode, header.errMsg);
    }
  } catch {
    // 아래 fallback으로 진행
  }
  return new OpenApiGatewayError(httpStatus, "UNKNOWN", rawBody.slice(0, 200));
}
