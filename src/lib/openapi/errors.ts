/**
 * 채권 오픈API 2종의 오류 응답을 예외로 표현하고, cron 파이프라인이 취할 행동을 분류한다.
 *
 * 두 층의 오류가 있다(`docs/api/README.md`의 "공통 응답 규약" 참고):
 * - API 레벨 오류: HTTP 200 + `response.header.resultCode !== "00"` → {@link OpenApiError}
 * - GW(게이트웨이) 레벨 오류: HTTP 200이 아님(401/403 등) + `OpenAPI_ServiceResponse` 봉투 → {@link OpenApiGatewayError}
 *
 * 코드 `20`이 서로 다른 원인 3개(SERVICE_KEY_IS_NULL/PERMISSION_DENIED/SERVICE_ACCESS_DENIED_ERROR)에
 * 중복 배정되어 있어 `resultCode`만으로는 분기할 수 없다 — {@link classify}는 코드와 메시지를
 * 함께 본다.
 */

/** API 레벨 오류(`response.header.resultCode !== "00"`, HTTP 200). */
export class OpenApiError extends Error {
  readonly resultCode: string;
  readonly resultMsg: string;

  constructor(resultCode: string, resultMsg: string) {
    super(`[OpenApiError] ${resultCode} ${resultMsg}`);
    this.name = "OpenApiError";
    this.resultCode = resultCode;
    this.resultMsg = resultMsg;
  }
}

/** GW 레벨 오류(HTTP 200이 아님 + `OpenAPI_ServiceResponse` 봉투). */
export class OpenApiGatewayError extends Error {
  readonly httpStatus: number;
  readonly returnReasonCode: string;
  readonly errMsg: string;

  constructor(httpStatus: number, returnReasonCode: string, errMsg: string) {
    super(`[OpenApiGatewayError] HTTP ${httpStatus} ${returnReasonCode} ${errMsg}`);
    this.name = "OpenApiGatewayError";
    this.httpStatus = httpStatus;
    this.returnReasonCode = returnReasonCode;
    this.errMsg = errMsg;
  }
}

/** 응답이 예상 밖 형식일 때(예: `.response`가 없는데 HTTP 200) 사용하는 방어적 오류. */
export class OpenApiUnexpectedResponseError extends Error {
  constructor(message: string) {
    super(`[OpenApiUnexpectedResponseError] ${message}`);
    this.name = "OpenApiUnexpectedResponseError";
  }
}

/**
 * cron 파이프라인이 오류를 만났을 때 취할 행동.
 * - `retry`: 같은 tick에서 1회 재시도
 * - `backoff`: 이번 tick은 포기하되 커서는 유지(다음 tick에서 재개)
 * - `abort-today`: 오늘 남은 시도를 전부 중단(`sync_run.status='failed'`), 다음날 자동 재시작
 * - `fatal`: 재시도로 해결되지 않는 코드/시크릿 문제. `failed` + 로그만 남김
 */
export type RetryPolicy = "retry" | "backoff" | "abort-today" | "fatal";

/** `docs/api/README.md` "에러코드" 절의 현행 표를 그대로 반영한 매핑. */
export function classify(error: unknown): RetryPolicy {
  if (error instanceof OpenApiGatewayError) {
    // 인증 계열(20/29/30/31)이 압도적으로 흔한 GW 오류 원인이며 전부 시크릿·등록 문제라 재시도 무의미.
    return "fatal";
  }

  if (error instanceof OpenApiError) {
    switch (error.resultCode) {
      case "01": // APPLICATION_ERROR
      case "04": // HTTP_ERROR
      case "05": // SERVICETIMEOUT_ERROR
        return "retry";
      case "23": // LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR (30 TPS)
        return "backoff";
      case "22": // LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR (일일 호출량)
        return "abort-today";
      case "10": // INVALID_REQUEST_PARAMETER_ERROR
      case "12": // NO_OPENAPI_SERVICE_ERROR
      case "20": // SERVICE_KEY_IS_NULL / PERMISSION_DENIED / SERVICE_ACCESS_DENIED_ERROR (resultMsg로만 구분 가능하나 셋 다 fatal)
      case "29": // BLACKLIST_IP_ACCESS_ERROR
      case "30": // SERVICE_KEY_IS_NOT_REGISTERED_ERROR
      case "31": // DEADLINE_HAS_EXPIRED_ERROR
        return "fatal";
      default:
        // 문서 미등록 코드(레거시 32/99 등). README 지침대로 방어적으로 재시도.
        return "retry";
    }
  }

  // 네트워크 오류, JSON 파싱 실패 등 — 일시적일 가능성이 높다고 보고 재시도.
  return "retry";
}
