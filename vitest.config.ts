import { defineConfig } from "vitest/config";

// 오케스트레이터일 뿐 — 실제 설정은 vitest.node.config.ts(바인딩 불필요, node)와
// vitest.workers.config.ts(D1/R2 바인딩 필요, 실제 workerd) 두 프로젝트에 있다.
export default defineConfig({
  test: {
    projects: ["vitest.node.config.ts", "vitest.workers.config.ts"],
  },
});
