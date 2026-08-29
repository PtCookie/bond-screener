import { describe, expect, test } from "vitest";
import {
  classify,
  OpenApiError,
  OpenApiGatewayError,
  OpenApiUnexpectedResponseError,
  type RetryPolicy,
} from "@/lib/openapi/errors";

describe("classify — docs/api/README.md 현행 에러코드 표를 그대로 고정", () => {
  const cases: { resultCode: string; expected: RetryPolicy; label: string }[] = [
    { resultCode: "01", expected: "retry", label: "APPLICATION_ERROR" },
    { resultCode: "04", expected: "retry", label: "HTTP_ERROR" },
    { resultCode: "05", expected: "retry", label: "SERVICETIMEOUT_ERROR" },
    { resultCode: "23", expected: "backoff", label: "TPS 초과" },
    { resultCode: "22", expected: "abort-today", label: "일일 호출량 초과" },
    { resultCode: "10", expected: "fatal", label: "INVALID_REQUEST_PARAMETER_ERROR" },
    { resultCode: "12", expected: "fatal", label: "NO_OPENAPI_SERVICE_ERROR" },
    { resultCode: "20", expected: "fatal", label: "SERVICE_KEY_IS_NULL 등 (resultMsg 3종 중복 배정)" },
    { resultCode: "29", expected: "fatal", label: "BLACKLIST_IP_ACCESS_ERROR" },
    { resultCode: "30", expected: "fatal", label: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" },
    { resultCode: "31", expected: "fatal", label: "DEADLINE_HAS_EXPIRED_ERROR" },
    { resultCode: "99", expected: "retry", label: "문서 미등록 레거시 코드 — 방어적으로 retry" },
    { resultCode: "32", expected: "retry", label: "문서 미등록 레거시 코드 — 방어적으로 retry" },
  ];

  test.each(cases)("$resultCode ($label) → $expected", ({ resultCode, expected }) => {
    expect(classify(new OpenApiError(resultCode, "메시지"))).toBe(expected);
  });

  test("OpenApiGatewayError는 returnReasonCode와 무관하게 항상 fatal", () => {
    expect(classify(new OpenApiGatewayError(401, "20", "SERVICE_KEY_IS_NULL_ERROR"))).toBe("fatal");
    expect(classify(new OpenApiGatewayError(403, "30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"))).toBe("fatal");
    expect(classify(new OpenApiGatewayError(500, "UNKNOWN", ""))).toBe("fatal");
  });

  test("OpenApiUnexpectedResponseError는 retry (일시적 파싱 실패일 가능성)", () => {
    expect(classify(new OpenApiUnexpectedResponseError("의 없음"))).toBe("retry");
  });

  test("네트워크 에러(TypeError 등)는 retry", () => {
    expect(classify(new TypeError("fetch failed"))).toBe("retry");
  });

  test("문자열 throw, undefined 등 임의 값도 retry (방어적 기본값)", () => {
    expect(classify("문자열 에러")).toBe("retry");
    expect(classify(undefined)).toBe("retry");
    expect(classify(null)).toBe("retry");
  });
});

describe("에러 클래스 — name/message 포맷과 보존 필드", () => {
  test("OpenApiError", () => {
    const err = new OpenApiError("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR");
    expect(err.name).toBe("OpenApiError");
    expect(err.resultCode).toBe("22");
    expect(err.resultMsg).toBe("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR");
    expect(err.message).toBe("[OpenApiError] 22 LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR");
  });

  test("OpenApiGatewayError", () => {
    const err = new OpenApiGatewayError(401, "30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    expect(err.name).toBe("OpenApiGatewayError");
    expect(err.httpStatus).toBe(401);
    expect(err.returnReasonCode).toBe("30");
    expect(err.errMsg).toBe("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    expect(err.message).toBe("[OpenApiGatewayError] HTTP 401 30 SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
  });

  test("OpenApiUnexpectedResponseError", () => {
    const err = new OpenApiUnexpectedResponseError(".response 없음");
    expect(err.name).toBe("OpenApiUnexpectedResponseError");
    expect(err.message).toBe("[OpenApiUnexpectedResponseError] .response 없음");
  });
});
