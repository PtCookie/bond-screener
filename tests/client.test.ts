import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { fetchOpenApiPage } from "@/lib/openapi/client";
import { OpenApiError, OpenApiGatewayError } from "@/lib/openapi/errors";

function fixtureText(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function stubFetch(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as typeof fetch;
}

describe("fetchOpenApiPage", () => {
  test("정상 응답을 items 배열로 변환한다", async () => {
    const page = await fetchOpenApiPage({
      baseUrl: "https://example.test",
      operation: "op",
      params: {},
      serviceKey: "key",
      fetchImpl: stubFetch(200, fixtureText("issu-page.json")),
    });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.totalCount).toBeGreaterThan(0);
  });

  test("items가 빈 문자열이면 빈 배열로 정규화한다", async () => {
    const page = await fetchOpenApiPage({
      baseUrl: "https://example.test",
      operation: "op",
      params: {},
      serviceKey: "key",
      fetchImpl: stubFetch(200, fixtureText("empty-items.json")),
    });
    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  test("resultCode !== 00 이면 OpenApiError를 던진다", async () => {
    const errorBody = JSON.stringify({
      response: {
        header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" },
        body: { numOfRows: "1", pageNo: "1", totalCount: "0", items: "" },
      },
    });
    await expect(
      fetchOpenApiPage({
        baseUrl: "https://example.test",
        operation: "op",
        params: {},
        serviceKey: "key",
        fetchImpl: stubFetch(200, errorBody),
      }),
    ).rejects.toThrow(OpenApiError);
  });

  test("HTTP 200이 아니면 GW 오류 봉투를 OpenApiGatewayError로 변환한다", async () => {
    await expect(
      fetchOpenApiPage({
        baseUrl: "https://example.test",
        operation: "op",
        params: {},
        serviceKey: "key",
        fetchImpl: stubFetch(401, fixtureText("gw-error.json")),
      }),
    ).rejects.toThrow(OpenApiGatewayError);
  });

  test("serviceKey는 정확히 한 번만 인코딩된다 (이중 인코딩 방지)", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return new Response(fixtureText("empty-items.json"), { status: 200 });
    }) as typeof fetch;

    await fetchOpenApiPage({
      baseUrl: "https://example.test",
      operation: "op",
      params: {},
      serviceKey: "a+b/c=", // Decoded 값에 흔한 특수문자
      fetchImpl,
    });

    expect(capturedUrl).toContain("serviceKey=" + encodeURIComponent("a+b/c="));
  });

  test("resultType=json이 항상 주입된다", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return new Response(fixtureText("empty-items.json"), { status: 200 });
    }) as typeof fetch;

    await fetchOpenApiPage({
      baseUrl: "https://example.test",
      operation: "op",
      params: {},
      serviceKey: "key",
      fetchImpl,
    });

    expect(capturedUrl).toContain("resultType=json");
  });
});
