/**
 * `vi.stubGlobal("fetch", ...)` 래퍼. `tests/workers/helpers/fetch-stub.ts`와 같은 역할이지만
 * 그건 workers 프로젝트(cloudflareTest) 전용 경로라 재사용할 수 없다 — 이건 node·browser
 * 두 프로젝트가 공유하는 버전이다.
 *
 * `src/lib/snapshot/client.ts`/`src/lib/bond/client.ts`/각 훅이 상대 경로(`/api/...`)로
 * fetch를 부르므로 라우트는 정확 일치 문자열 또는 매처 함수로 판별한다.
 *
 * 사용하는 테스트 파일은 반드시 `afterEach(() => vi.unstubAllGlobals())`를 둘 것 —
 * `tests/workers/helpers/fetch-stub.ts`의 관례를 그대로 따른다.
 */
import { vi } from "vitest";

export interface StubRoute {
  /** URL 문자열 정확 일치, 또는 URL을 받아 boolean을 돌려주는 매처. */
  match: string | ((url: string) => boolean);
  status?: number;
  /** 문자열이면 그대로, 아니면 JSON.stringify해서 응답 본문으로 쓴다. */
  body: unknown;
}

export interface StubFetchHandle {
  /** 호출된 순서대로 요청 URL을 기록 — "정확히 어떤 URL 3종이 나갔는지" 같은 단언에 쓴다. */
  calledUrls: string[];
}

/** 매칭되는 라우트가 없으면 조용히 통과시키지 않고 throw한다 — 의도치 않은 요청을 놓치지 않기 위함. */
export function stubFetch(routes: StubRoute[]): StubFetchHandle {
  const calledUrls: string[] = [];
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calledUrls.push(url);
    const route = routes.find((r) => (typeof r.match === "string" ? r.match === url : r.match(url)));
    if (!route) throw new Error(`stubFetch: 매칭되는 라우트가 없습니다 — ${url}`);
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200 });
  }) as typeof fetch);
  return { calledUrls };
}
