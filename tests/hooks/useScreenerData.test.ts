/**
 * `src/hooks/useScreenerData.ts` — `fetchScreenerSnapshot`(index → base → decode)를
 * TanStack Query로 감싸는 얇은 훅. 오케스트레이션 자체는 `tests/snapshot-client.test.ts`가
 * 덮으므로, 여기서는 훅이 그 결과를 query 상태(isPending/data/isError)로 노출하는지만 본다.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { useScreenerData } from "@/hooks/useScreenerData";
import { stubFetch } from "../helpers/fetch-stub";
import { renderHookWithQuery } from "../helpers/render-query";
import { makeSnapshotIndex, makeSnapshotPayload } from "../helpers/snapshot-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useScreenerData", () => {
  test("정상 경로 — rows/basDt/priceBasDt를 노출한다", async () => {
    const payload = makeSnapshotPayload();
    const index = makeSnapshotIndex(payload);
    stubFetch([
      { match: "/api/snapshot/index", body: index },
      { match: `/api/snapshot/bond/${payload.basDt}`, body: payload },
    ]);

    const { result } = await renderHookWithQuery(() => useScreenerData());

    await expect.poll(() => result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.rows).toHaveLength(1);
    expect(result.current.data?.rows[0].isinCd).toBe("KR6000011D36");
    expect(result.current.data?.basDt).toBe(payload.basDt);
  });

  test("index에 base가 없으면 isError가 된다", async () => {
    stubFetch([{ match: "/api/snapshot/index", body: { generatedAt: "", bond: null, priceDeltas: [] } }]);

    const { result } = await renderHookWithQuery(() => useScreenerData());

    await expect.poll(() => result.current.isError).toBe(true);
  });

  test("HTTP 실패 시 isError가 된다", async () => {
    stubFetch([{ match: "/api/snapshot/index", status: 500, body: "" }]);

    const { result } = await renderHookWithQuery(() => useScreenerData());

    await expect.poll(() => result.current.isError).toBe(true);
  });
});
