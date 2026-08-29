import { getViteConfig } from "astro/config";
import { defaultExclude } from "vitest/config";

// 바인딩(D1/R2)이 필요 없는 순수 로직 테스트. `node:sqlite`/`node:fs`를 그대로 쓰는
// 기존 tests/*.test.ts가 여기서 돈다. 바인딩이 필요한 테스트는 vitest.workers.config.ts
// (실제 workerd 런타임, tests/workers/**)로 분리했다 — AGENTS.md "테스트" 절 참고.
export default getViteConfig({
  test: {
    name: "node",
    exclude: [...defaultExclude, "tests/workers/**"],
  },
});
