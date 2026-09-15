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

/**
 * 시간이 지나면 풀릴 여지가 있는 HTTP 상태인지. 5xx는 게이트웨이·원본 서버의 일시적 장애,
 * 408/429는 타임아웃·과다요청이라 같은 요청을 나중에 보내면 성공할 수 있다. 그 외(401/403 등)는
 * 시크릿·등록·차단 문제라 몇 번을 보내도 결과가 같다.
 */
function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** `docs/api/README.md` "에러코드" 절의 현행 표를 그대로 반영한 매핑. */
export function classify(error: unknown): RetryPolicy {
  if (error instanceof OpenApiGatewayError) {
    // 인증 계열(20/29/30/31)이 압도적으로 흔한 GW 오류 원인이며 전부 시크릿·등록 문제라 재시도 무의미.
    // 다만 `client.ts`의 parseGatewayError는 **HTTP 200이 아니면 무조건** 이 예외를 던지므로
    // 포털 게이트웨이의 일시적 장애까지 같은 통에 담긴다 — 2026-09-15에 실제로 issu
    // basDt=20260914가 25/31 페이지에서 504 한 번으로 `failed` 마감됐고, `failed`는
    // `shouldStart()`(src/lib/sync/plan.ts)가 재시작 대상으로 보지 않는 데다 다음 날은 타깃
    // basDt가 넘어가 버려 그날 기본정보를 영영 채우지 못했다. 그래서 status로 갈라
    // 일시적 계열만 backoff(커서 유지 → 다음 tick 재개)로 돌린다.
    return isTransientHttpStatus(error.httpStatus) ? "backoff" : "fatal";
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

  // 네트워크 오류(TimeoutError 등), OpenApiUnexpectedResponseError(JSON 파싱 실패 등
  // 응답 자체가 예상 밖 형식인 경우) — OpenApiError/OpenApiGatewayError처럼 구조화된
  // 원인 코드가 없어 같은 tick 안에서의 1회 재시도가 의미 있을지 판단할 근거가 없다.
  // "retry"였다가 그 재시도마저 실패하면 failSyncRun()으로 status='failed'가 영구
  // 기록되는데, `shouldStart()`(src/lib/sync/plan.ts)는 'failed'를 재시도 대상으로
  // 보지 않아 다음 basDt로 넘어가기 전까지(주말이 끼면 며칠) 복구 기회가 없다 — 실제로
  // 순수 TimeoutError 한 번으로 이 상태에 빠진 적이 있다. "backoff"는 커서를 유지한 채
  // 이번 tick만 포기해 다음 tick(1분 뒤)에 자동으로 재개하므로 자가 복구된다.
  return "backoff";
}
