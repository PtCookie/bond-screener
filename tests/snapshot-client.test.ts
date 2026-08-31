/**
 * `src/lib/snapshot/client.ts` — index → base(+델타) 병렬 fetch → 병합 → 디코드 전체
 * 오케스트레이션. 개별 조각(`mergePriceDeltas`/`decodeSnapshot`)은 각자 테스트가 있으므로
 * 여기서는 **호출 순서·URL·에러 경로**만 본다.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchScreenerSnapshot } from "@/lib/snapshot/client";
import { DELTA_COLUMNS } from "@/lib/r2/price-delta";
import { stubFetch, type StubFetchHandle } from "./helpers/fetch-stub";
import { makeSnapshotIndex, makeSnapshotPayload } from "./helpers/snapshot-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchScreenerSnapshot", () => {
  test("정상 경로 — index → base → decode까지 정확한 URL로 요청한다(델타 없음)", async () => {
    const payload = makeSnapshotPayload();
    const index = makeSnapshotIndex(payload);
    const handle: StubFetchHandle = stubFetch([
      { match: "/api/snapshot/index", body: index },
      { match: `/api/snapshot/bond/${payload.basDt}`, body: payload },
    ]);

    const result = await fetchScreenerSnapshot();

    expect(handle.calledUrls).toEqual(["/api/snapshot/index", `/api/snapshot/bond/${payload.basDt}`]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].isinCd).toBe("KR6000011D36");
    expect(result.basDt).toBe(payload.basDt);
  });

  test("index.priceDeltas가 있으면 각 델타도 병렬로 요청하고 병합한다", async () => {
    const payload = makeSnapshotPayload();
    const deltaBasDt = 20260829;
    const index = makeSnapshotIndex(payload, [{ key: "x", basDt: deltaBasDt, count: 1 }]);
    const deltaPayload = {
      basDt: deltaBasDt,
      columns: DELTA_COLUMNS,
      rows: [["KR6000011D36", "일반채권", 10100, 100, 3.3, 2000]],
    };
    const handle: StubFetchHandle = stubFetch([
      { match: "/api/snapshot/index", body: index },
      { match: `/api/snapshot/bond/${payload.basDt}`, body: payload },
      { match: `/api/snapshot/price/${deltaBasDt}`, body: deltaPayload },
    ]);

    const result = await fetchScreenerSnapshot();

    expect(new Set(handle.calledUrls)).toEqual(
      new Set(["/api/snapshot/index", `/api/snapshot/bond/${payload.basDt}`, `/api/snapshot/price/${deltaBasDt}`]),
    );
    // 델타가 병합됐으므로 종가가 base(10000)가 아니라 델타 값(10100)으로 바뀐다.
    expect(result.rows[0].clprPrc).toBe(10100);
    expect(result.priceBasDt).toBe(deltaBasDt);
  });

  test("index.bond가 없으면 한국어 에러 메시지로 throw한다", async () => {
    stubFetch([{ match: "/api/snapshot/index", body: { generatedAt: "", bond: null, priceDeltas: [] } }]);

    await expect(fetchScreenerSnapshot()).rejects.toThrow(
      "스냅샷 index에 base(bond)가 없습니다 — pnpm snapshot 실행 필요",
    );
  });

  test("index 요청 자체가 HTTP 실패하면 상태 코드를 포함한 메시지로 reject된다", async () => {
    stubFetch([{ match: "/api/snapshot/index", status: 500, body: "" }]);

    await expect(fetchScreenerSnapshot()).rejects.toThrow(/요청 실패: \/api\/snapshot\/index \(HTTP 500\)/);
  });

  test("base 요청이 HTTP 실패하면 상태 코드를 포함한 메시지로 reject된다", async () => {
    const payload = makeSnapshotPayload();
    const index = makeSnapshotIndex(payload);
    stubFetch([
      { match: "/api/snapshot/index", body: index },
      { match: `/api/snapshot/bond/${payload.basDt}`, status: 404, body: "" },
    ]);

    await expect(fetchScreenerSnapshot()).rejects.toThrow(/HTTP 404/);
  });
});
