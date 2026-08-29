/**
 * `vi.stubGlobal("fetch", ...)` 래퍼. `issu-sync.ts`/`price-sync.ts`는 `fetchImpl`을
 * 주입받지 않고 전역 `fetch`를 그대로 쓰므로(코드 조사 결과 확인됨) 이게 유일한 스텁
 * 경로다. 각 테스트 파일은 반드시 `afterEach(() => vi.unstubAllGlobals())`를 둘 것 —
 * 이 프로젝트 전체에 `vi.*` 사용 선례가 없어 새로 도입하는 관례다.
 */
import { vi } from "vitest";

/** 모든 호출에 동일한 응답 하나를 돌려준다. */
export function stubFetchOnce(status: number, body: string): void {
  vi.stubGlobal("fetch", (async () => new Response(body, { status })) as typeof fetch);
}

/** 호출 순서대로 다른 응답을 돌려준다(마지막 항목은 그 뒤로도 반복). retry/backoff 시퀀스 테스트용. */
export function stubFetchSequence(responses: { status: number; body: string }[]): void {
  let call = 0;
  vi.stubGlobal("fetch", (async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return new Response(r.body, { status: r.status });
  }) as typeof fetch);
}

/** 호출될 때마다 throw — 네트워크 레벨 실패(TypeError 등) 재현용. */
export function stubFetchThrows(error: unknown): void {
  vi.stubGlobal("fetch", (async () => {
    throw error;
  }) as typeof fetch);
}
