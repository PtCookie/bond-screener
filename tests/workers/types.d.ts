/// <reference types="@cloudflare/vitest-plugin/types" />

// `worker-configuration.d.ts`(wrangler types 산출물)가 선언한 `Cloudflare.Env`에
// 테스트 전용 바인딩을 병합한다. `wrangler types`가 재생성해도 이 파일은 건드리지
// 않으므로 계속 남는다. import/export가 없는 전역 스크립트라 선언 병합이 그대로 된다.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
  }
}
