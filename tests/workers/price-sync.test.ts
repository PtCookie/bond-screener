import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "cloudflare:workers";
import { runPriceSyncStep } from "@/lib/sync/price-sync";
import { getSyncRun, startSyncRun, type SyncRun } from "@/lib/d1/sync-run-repo";
import { PRICE_PAGE_SIZE } from "@/lib/sync/config";
import { rawArchiveKey, snapshotPriceDeltaKey, SNAPSHOT_INDEX_KEY } from "@/lib/r2/keys";
import { resetD1 } from "./helpers/reset-d1";
import { buildEnvelope, buildErrorEnvelope, buildPriceItems } from "./helpers/envelope";
import { stubFetchOnce } from "./helpers/fetch-stub";
import { notNull } from "./helpers/assert";

const BAS_DT = 20260821;

beforeEach(resetD1);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startAndGetRun(now = 1000): Promise<SyncRun> {
  await startSyncRun(env.DB, "price", BAS_DT, now);
  const run = await getSyncRun(env.DB, "price", BAS_DT);
  if (!run) throw new Error("startSyncRun 직후 run이 없음");
  return run;
}

describe("runPriceSyncStep — 정상 경로", () => {
  test("정상 응답을 D1에 삽입하고 writePriceDelta로 index를 갱신한다", async () => {
    const items = buildPriceItems(3, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 3 }));

    const run = await startAndGetRun();
    const result = await runPriceSyncStep(env, run);

    expect(result.done).toBe(true);

    const priceCount = await env.DB.prepare("SELECT COUNT(*) c FROM bond_price").first<{ c: number }>();
    expect(priceCount?.c).toBe(3);

    const archived = await env.ARCHIVE.get(rawArchiveKey("price", BAS_DT, 1));
    expect(archived).not.toBeNull();

    const deltaObj = await env.ARCHIVE.get(snapshotPriceDeltaKey(BAS_DT));
    expect(deltaObj).not.toBeNull();

    const indexObj = await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY);
    const index = await notNull(indexObj).json<{ priceDeltas: { basDt: number }[] }>();
    expect(index.priceDeltas.map((d) => d.basDt)).toEqual([BAS_DT]);

    const updatedRun = await getSyncRun(env.DB, "price", BAS_DT);
    expect(updatedRun).toMatchObject({ status: "done", next_page: 2 });
  });

  test("totalCount=0 → empty로 마감되고, 델타는 기록하지 않는다(index.json 오염 방지)", async () => {
    stubFetchOnce(200, buildEnvelope({ items: [], totalCount: 0 }));

    const run = await startAndGetRun();
    const result = await runPriceSyncStep(env, run);

    expect(result.done).toBe(true);
    const updatedRun = await getSyncRun(env.DB, "price", BAS_DT);
    expect(updatedRun?.status).toBe("empty");

    // raw 아카이브는 0건이어도 기록된다.
    const archived = await env.ARCHIVE.get(rawArchiveKey("price", BAS_DT, 1));
    expect(archived).not.toBeNull();

    // 델타/인덱스는 만들어지지 않는다.
    const deltaObj = await env.ARCHIVE.get(snapshotPriceDeltaKey(BAS_DT));
    expect(deltaObj).toBeNull();
    const indexObj = await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY);
    expect(indexObj).toBeNull();
  });

  test("다중 페이지 수집 시 델타에는 마지막 페이지 items만 담긴다 (현재 알려진 한계 — 고정)", async () => {
    // PRICE_PAGE_SIZE=1000이므로 totalCount를 그보다 크게 잡아 2페이지 시나리오를 만든다.
    const totalCount = PRICE_PAGE_SIZE + 5;

    const page1Items = buildPriceItems(PRICE_PAGE_SIZE, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items: page1Items, totalCount, pageNo: 1 }));
    const run1 = await startAndGetRun();
    const result1 = await runPriceSyncStep(env, run1);
    expect(result1.done).toBe(false); // 1*1000 < 1005

    const page2Items = buildPriceItems(5, String(BAS_DT)).map((item, i) => ({ ...item, isinCd: `KR2PAGE${i}` }));
    stubFetchOnce(200, buildEnvelope({ items: page2Items, totalCount, pageNo: 2 }));
    const run2: SyncRun = { ...notNull(await getSyncRun(env.DB, "price", BAS_DT)), next_page: 2 };
    const result2 = await runPriceSyncStep(env, run2);
    expect(result2.done).toBe(true); // 2*1000 >= 1005

    const priceCount = await env.DB.prepare("SELECT COUNT(*) c FROM bond_price").first<{ c: number }>();
    expect(priceCount?.c).toBe(totalCount); // D1에는 전량 반영됨

    const deltaObj = await env.ARCHIVE.get(snapshotPriceDeltaKey(BAS_DT));
    const delta = await notNull(deltaObj).json<{ rows: unknown[][] }>();
    expect(delta.rows).toHaveLength(5); // 델타에는 page2 items 5건만 (page1 1000건 유실)
  });
});

describe("runPriceSyncStep — 오픈API 에러 정책", () => {
  test("backoff: D1 무변경, 커서 불변", async () => {
    stubFetchOnce(200, buildErrorEnvelope("23", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR"));

    const run = await startAndGetRun();
    const result = await runPriceSyncStep(env, run);

    expect(result).toEqual({ done: false, queriesUsed: 0 });
    const updatedRun = await getSyncRun(env.DB, "price", BAS_DT);
    expect(updatedRun).toMatchObject({ status: "running", next_page: 1 });
  });

  test("fatal: failed로 마감된다", async () => {
    stubFetchOnce(200, buildErrorEnvelope("10", "INVALID_REQUEST_PARAMETER_ERROR"));

    const run = await startAndGetRun();
    const result = await runPriceSyncStep(env, run);

    expect(result.done).toBe(true);
    const updatedRun = await getSyncRun(env.DB, "price", BAS_DT);
    expect(updatedRun?.status).toBe("failed");
  });
});

describe("runPriceSyncStep — fetch 이후 예외 처리 (버그 D 회귀)", () => {
  test("R2 델타 쓰기가 throw해도 failed로 마감되고 좀비 run이 남지 않는다", async () => {
    const items = buildPriceItems(1, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 1 }));

    const run = await startAndGetRun();

    // ARCHIVE.put은 raw 아카이브에도 쓰이므로 첫 호출은 통과시키고, 델타/인덱스 put에서 던진다.
    const originalPut = env.ARCHIVE.put.bind(env.ARCHIVE);
    let putCount = 0;
    vi.spyOn(env.ARCHIVE, "put").mockImplementation((...args: Parameters<R2Bucket["put"]>) => {
      putCount += 1;
      if (putCount >= 2) throw new Error("R2 delta put 실패(시뮬레이션)");
      return originalPut(...args);
    });

    await expect(runPriceSyncStep(env, run)).resolves.toBeDefined();
    vi.mocked(env.ARCHIVE.put).mockRestore();

    const updatedRun = await getSyncRun(env.DB, "price", BAS_DT);
    expect(updatedRun?.status).toBe("failed");
  });
});
