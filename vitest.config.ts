import { defineConfig } from "vitest/config";

// 오케스트레이터일 뿐 — 실제 설정은 세 프로젝트에 있다:
// vitest.node.config.ts(바인딩 불필요, node), vitest.browser.config.ts(DOM 필요,
// 실제 브라우저 — Browser Mode), vitest.workers.config.ts(D1/R2 바인딩 필요, 실제 workerd).
export default defineConfig({
  test: {
    projects: ["vitest.node.config.ts", "vitest.browser.config.ts", "vitest.workers.config.ts"],
  },
});
