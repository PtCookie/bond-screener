import { getViteConfig } from "astro/config";
import { defaultExclude } from "vitest/config";

// 바인딩(D1/R2)이 필요 없는 순수 로직 테스트. `node:sqlite`/`node:fs`를 그대로 쓰는
// 기존 tests/*.test.ts가 여기서 돈다. 바인딩이 필요한 테스트는 vitest.workers.config.ts
// (실제 workerd 런타임, tests/workers/**)로, DOM이 필요한 컴포넌트·훅 테스트는
// vitest.browser.config.ts(Browser Mode, tests/components/**·tests/hooks/**)로 분리했다
// — AGENTS.md "테스트" 절 참고.
//
// e2e/**는 반드시 제외해야 한다 — 기본 include가 "**/*.{test,spec}.*"라 제외하지 않으면
// Playwright 전용 e2e/*.spec.ts까지 여기서 수집돼 "Playwright Test did not expect test()
// to be called here"로 전체가 실패한다(실제로 겪은 문제).
export default getViteConfig({
  test: {
    name: "node",
    exclude: [...defaultExclude, "tests/workers/**", "tests/components/**", "tests/hooks/**", "e2e/**"],
  },
});
