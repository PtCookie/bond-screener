import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "cloudflare:workers";
import { runIssuSyncStep } from "@/lib/sync/issu-sync";
import { getSyncRun, startSyncRun, type SyncRun } from "@/lib/d1/sync-run-repo";
import { ISSU_PAGE_SIZE } from "@/lib/sync/config";
import { rawArchiveKey } from "@/lib/r2/keys";
import { resetD1 } from "./helpers/reset-d1";
import { buildEnvelope, buildErrorEnvelope, buildIssuItems } from "./helpers/envelope";
import { stubFetchOnce, stubFetchSequence } from "./helpers/fetch-stub";
import { notNull } from "./helpers/assert";

const BAS_DT = 20260821;

beforeEach(resetD1);
afterEach(() => {
  vi.unstubAllGlobals();
  // vi.spyOn으로 건 스파이는 실패한 assert 도중 개별 mockRestore()가 안 불릴 수 있으니
  // 여기서 일괄 복구한다.
  vi.restoreAllMocks();
});

/** startSyncRun으로 sync_run 행을 만들고 그 값을 그대로 돌려준다 — runIssuSyncStep의 실제 호출 방식. */
async function startAndGetRun(now = 1000): Promise<SyncRun> {
  await startSyncRun(env.DB, "issu", BAS_DT, now);
  const run = await getSyncRun(env.DB, "issu", BAS_DT);
  if (!run) throw new Error("startSyncRun 직후 run이 없음");
  return run;
}

describe("runIssuSyncStep — 정상 경로", () => {
  test("1페이지 응답을 D1에 upsert하고 R2에 원본을 아카이브하고 커서를 전진시킨다", async () => {
    const items = buildIssuItems(3, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 3 }));

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true); // 1*200 >= 3
    expect(result.queriesUsed).toBeGreaterThan(0);

    const bondCount = await env.DB.prepare("SELECT COUNT(*) c FROM bond").first<{ c: number }>();
    expect(bondCount?.c).toBe(3);

    const archived = await env.ARCHIVE.get(rawArchiveKey("issu", BAS_DT, 1));
    expect(archived).not.toBeNull();

    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun).toMatchObject({ status: "done", next_page: 2, total_count: 3 });
  });

  test("마지막 페이지 경계: totalCount=29087, ISSU_PAGE_SIZE=200 → page 145는 미완, 146에서 마감", async () => {
    // 페이지 145: next_page(145) * 200 = 29000 < 29087 → 아직 안 끝남
    const page145 = buildIssuItems(200, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items: page145, totalCount: 29087, pageNo: 145 }));

    await startSyncRun(env.DB, "issu", BAS_DT, 1000);
    const run145: SyncRun = { ...notNull(await getSyncRun(env.DB, "issu", BAS_DT)), next_page: 145 };
    const result145 = await runIssuSyncStep(env, run145);
    expect(result145.done).toBe(false); // 145*200=29000 < 29087

    // 페이지 146: 146*200=29200 >= 29087 → 마감
    const page146 = buildIssuItems(87, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items: page146, totalCount: 29087, pageNo: 146 }));

    const run146: SyncRun = { ...notNull(await getSyncRun(env.DB, "issu", BAS_DT)), next_page: 146 };
    const result146 = await runIssuSyncStep(env, run146);
    expect(result146.done).toBe(true);
  });

  test("totalCount이 페이지 크기의 정확한 배수일 때 그 페이지에서 바로 마감된다", async () => {
    // ISSU_PAGE_SIZE=200, totalCount=400 → page 2에서 2*200=400>=400 → 마감(3페이지 조회 안 함)
    const items = buildIssuItems(ISSU_PAGE_SIZE, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: ISSU_PAGE_SIZE * 2, pageNo: 2 }));

    await startSyncRun(env.DB, "issu", BAS_DT, 1000);
    const run: SyncRun = { ...notNull(await getSyncRun(env.DB, "issu", BAS_DT)), next_page: 2 };
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true);
  });

  test("totalCount=0 → empty로 마감되지만 raw 아카이브는 그대로 기록된다", async () => {
    stubFetchOnce(200, buildEnvelope({ items: [], totalCount: 0 }));

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true);
    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("empty");

    const archived = await env.ARCHIVE.get(rawArchiveKey("issu", BAS_DT, 1));
    expect(archived).not.toBeNull();
  });
});

describe("runIssuSyncStep — 오픈API 에러 정책", () => {
  test("backoff(코드 23): D1 무변경, 커서 불변, done:false", async () => {
    stubFetchOnce(200, buildErrorEnvelope("23", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR"));

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result).toEqual({ done: false, queriesUsed: 0 });
    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun).toMatchObject({ status: "running", next_page: 1 });
  });

  test("retry(코드 01) 1회 후 성공하면 정상 경로로 진행된다", async () => {
    const items = buildIssuItems(2, String(BAS_DT));
    stubFetchSequence([
      { status: 200, body: buildErrorEnvelope("01", "APPLICATION_ERROR") },
      { status: 200, body: buildEnvelope({ items, totalCount: 2 }) },
    ]);

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true);
    const bondCount = await env.DB.prepare("SELECT COUNT(*) c FROM bond").first<{ c: number }>();
    expect(bondCount?.c).toBe(2);
    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("done");
  });

  test("retry 후 재실패하면 failed로 마감된다", async () => {
    stubFetchSequence([
      { status: 200, body: buildErrorEnvelope("01", "APPLICATION_ERROR") },
      { status: 200, body: buildErrorEnvelope("04", "HTTP_ERROR") },
    ]);

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true);
    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("failed");
  });

  test("fatal(코드 30): failed로 마감된다", async () => {
    stubFetchOnce(200, buildErrorEnvelope("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"));

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true);
    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("failed");
    expect(updatedRun?.error).toContain("30");
  });

  test("GW 레벨 오류(HTTP 401): failed로 마감된다", async () => {
    stubFetchOnce(
      401,
      JSON.stringify({
        OpenAPI_ServiceResponse: {
          cmmMsgHeader: { errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnAuthMsg: "", returnReasonCode: "30" },
        },
      }),
    );

    const run = await startAndGetRun();
    const result = await runIssuSyncStep(env, run);

    expect(result.done).toBe(true);
    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("failed");
  });
});

describe("runIssuSyncStep — fetch 이후 예외 처리 (버그 D 회귀)", () => {
  test("fetch는 성공했지만 이후 단계(R2 아카이브)가 throw하면 failed로 마감되고 run이 좀비로 남지 않는다", async () => {
    const items = buildIssuItems(1, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 1 }));

    // run을 먼저 만든다 — startSyncRun/getSyncRun 자체도 D1을 쓰므로, 스파이를 그 전에
    // 걸면 이 준비 단계의 호출까지 스텁 카운트를 소모해버린다.
    const run = await startAndGetRun();

    // R2 put이 throw하도록 archive 바인딩을 망가뜨린다.
    vi.spyOn(env.ARCHIVE, "put").mockImplementation(() => {
      throw new Error("R2 put 실패(시뮬레이션)");
    });

    await expect(runIssuSyncStep(env, run)).resolves.toBeDefined();

    vi.restoreAllMocks(); // 검증 전에 복구 — 안 그러면 getSyncRun의 SELECT까지 걸릴 위험은 없지만 관례상 통일.

    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("failed"); // running으로 방치되면 안 됨(좀비 run)
  });

  test("fetch는 성공했지만 D1 쓰기가 throw해도 failed로 마감된다", async () => {
    const items = buildIssuItems(1, String(BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 1 }));

    const run = await startAndGetRun();

    const originalPrepare = env.DB.prepare.bind(env.DB);
    let callCount = 0;
    vi.spyOn(env.DB, "prepare").mockImplementation((sql: string) => {
      callCount += 1;
      // 첫 SELECT(지문 조회) 호출에서 던진다 — writeBondPage 내부.
      if (callCount === 1 && sql.includes("SELECT")) {
        throw new Error("D1 prepare 실패(시뮬레이션)");
      }
      return originalPrepare(sql);
    });

    await expect(runIssuSyncStep(env, run)).resolves.toBeDefined();

    // mock을 건 채로 조회하면 방금 던진 prepare가 다시 걸리므로, 검증 전에 복구한다.
    vi.mocked(env.DB.prepare).mockRestore();

    const updatedRun = await getSyncRun(env.DB, "issu", BAS_DT);
    expect(updatedRun?.status).toBe("failed");
  });
});
