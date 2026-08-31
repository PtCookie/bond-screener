/**
 * `src/hooks/useBondPrices.ts` — `fetchBondPrices`(`src/lib/bond/client.ts`)를 TanStack
 * Query로 감싸는 훅. 파라미터가 바뀌면 새 요청이 나가는지, `keepPreviousData`로 전환 중
 * 이전 데이터가 유지되는지를 본다.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PriceSeriesResponsePayload } from "@/lib/bond/price-series";
import { useBondPrices } from "@/hooks/useBondPrices";
import { stubFetch, type StubFetchHandle } from "../helpers/fetch-stub";
import { renderHookWithQuery } from "../helpers/render-query";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makePayload(overrides: Partial<PriceSeriesResponsePayload> = {}): PriceSeriesResponsePayload {
  return {
    isinCd: "KR6000011D36",
    from: 20260101,
    to: 20260828,
    columns: ["basDt", "mrktCtg", "clprPrc", "clprBnfRt"],
    rows: [[20260828, "일반채권", 10000, 3.2]],
    truncated: false,
    ...overrides,
  };
}

describe("useBondPrices", () => {
  test("정상 경로 — 응답을 그대로 노출한다", async () => {
    const payload = makePayload();
    stubFetch([{ match: (url) => url.includes("/api/bond/KR6000011D36/prices"), body: payload }]);

    const { result } = await renderHookWithQuery(() => useBondPrices("KR6000011D36", "일반채권", 20260101, 20260828));

    await expect.poll(() => result.current.isPending).toBe(false);
    expect(result.current.data?.rows).toEqual(payload.rows);
  });

  test("market을 항상 쿼리스트링에 명시한다", async () => {
    const handle: StubFetchHandle = stubFetch([
      { match: (url) => url.includes("/api/bond/KR6000011D36/prices"), body: makePayload() },
    ]);

    const { result } = await renderHookWithQuery(() => useBondPrices("KR6000011D36", "KTS", 20260101, 20260828));
    await expect.poll(() => result.current.isPending).toBe(false);

    expect(handle.calledUrls[0]).toContain("market=KTS");
  });

  test("파라미터가 바뀌면 새 요청이 나가고, keepPreviousData로 전환 중 이전 데이터가 유지된다", async () => {
    const first = makePayload({ rows: [[20260101, "일반채권", 9900, 3.1]] });
    const second = makePayload({ rows: [[20260201, "일반채권", 10100, 3.3]] });

    // 두 번째 요청을 수동으로 붙들어 둔다 — stubFetch(즉시 응답)로는 전환 중간의
    // "이전 데이터 + isPlaceholderData" 상태가 순식간에 지나가 관찰할 수 없다.
    let resolveSecond!: (res: Response) => void;
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("from=20260101")) return new Response(JSON.stringify(first), { status: 200 });
      if (url.includes("from=20260301")) return secondResponse;
      throw new Error(`예상치 못한 요청: ${url}`);
    }) as typeof fetch);

    const { result, rerender } = await renderHookWithQuery(
      (props?: { from: number; to: number }) => {
        const { from, to } = props ?? { from: 20260101, to: 20260201 };
        return useBondPrices("KR6000011D36", "일반채권", from, to);
      },
      { initialProps: { from: 20260101, to: 20260201 } },
    );
    await expect.poll(() => result.current.data?.rows).toEqual(first.rows);

    await rerender({ from: 20260301, to: 20260401 });
    // keepPreviousData: 새 요청이 아직 미완료인 이 시점에도 isPending이 아니라
    // isPlaceholderData로 이전 데이터를 계속 보여준다 — 빈 화면으로 깜빡이지 않는다.
    expect(result.current.data?.rows).toEqual(first.rows);
    expect(result.current.isPlaceholderData).toBe(true);

    resolveSecond(new Response(JSON.stringify(second), { status: 200 }));
    await expect.poll(() => result.current.data?.rows).toEqual(second.rows);
    expect(result.current.isPlaceholderData).toBe(false);
  });
});
