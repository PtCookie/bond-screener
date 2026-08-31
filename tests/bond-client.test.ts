/**
 * `src/lib/bond/client.ts` — 상세 페이지 전용 브라우저 fetch 헬퍼. 쿼리스트링 조립과
 * HTTP 실패 경로만 검증한다(응답 파싱 자체는 `fetchJson`이 `res.json()`을 그대로 위임).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchBondPrices } from "@/lib/bond/client";
import { stubFetch, type StubFetchHandle } from "./helpers/fetch-stub";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBondPrices", () => {
  test("isinCd/from/to/market으로 쿼리스트링을 조립해 요청한다", async () => {
    const handle: StubFetchHandle = stubFetch([
      {
        match: (url) => url.startsWith("/api/bond/KR6000011D36/prices"),
        body: { isinCd: "KR6000011D36", from: 20260101, to: 20260828, columns: [], rows: [], truncated: false },
      },
    ]);

    await fetchBondPrices({ isinCd: "KR6000011D36", from: 20260101, to: 20260828, market: "일반채권" });

    expect(handle.calledUrls).toHaveLength(1);
    const url = new URL(handle.calledUrls[0], "https://example.com");
    expect(url.pathname).toBe("/api/bond/KR6000011D36/prices");
    expect(url.searchParams.get("from")).toBe("20260101");
    expect(url.searchParams.get("to")).toBe("20260828");
    expect(url.searchParams.get("market")).toBe("일반채권");
  });

  test("응답을 그대로 파싱해 반환한다", async () => {
    const payload = {
      isinCd: "KR6000011D36",
      from: 1,
      to: 2,
      columns: ["basDt"],
      rows: [[20260828]],
      truncated: false,
    };
    stubFetch([{ match: (url) => url.includes("/prices"), body: payload }]);

    const result = await fetchBondPrices({ isinCd: "KR6000011D36", from: 1, to: 2, market: "KTS" });
    expect(result).toEqual(payload);
  });

  test("HTTP 실패 시 상태 코드를 포함한 한국어 에러 메시지로 reject된다", async () => {
    stubFetch([{ match: (url) => url.includes("/prices"), status: 500, body: "" }]);

    await expect(fetchBondPrices({ isinCd: "KR6000011D36", from: 1, to: 2, market: "KTS" })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});
