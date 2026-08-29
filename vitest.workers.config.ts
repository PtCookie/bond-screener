import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// D1/R2 바인딩이 필요한 테스트(cron 오케스트레이션 계층)만 여기서 실제 workerd 런타임
// 위에 돈다. Astro의 getViteConfig()는 쓰지 않는다 — @astrojs/cloudflare 어댑터가
// 등록하는 @cloudflare/vite-plugin과 이 플러그인이 같은 "ssr" 환경을 두고 충돌하기
// 때문(AGENTS.md "테스트" 절 참고). `wrangler.jsonc`의 `main`도 참조하지 않는다 —
// `src/worker.ts`가 `@astrojs/cloudflare/handler`의 virtual module을 import해서
// Astro 빌드 컨텍스트 밖에서는 해석되지 않는다. 우리는 sync/*.ts의 plain 함수를
// 테스트 안에서 직접 호출하므로 Worker 진입점(main) 자체가 필요 없다.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  plugins: [
    cloudflareTest(async () => {
      // wrangler.jsonc 전체를 읽는 대신 마이그레이션 디렉터리만 명시적으로 읽는다 —
      // configPath를 넘기지 않는 이유는 위 주석 참고.
      const migrations = await readD1Migrations(path.resolve(rootDir, "migrations"));
      return {
        miniflare: {
          // wrangler.jsonc와 동일하게 맞춰 fidelity를 확보한다.
          compatibilityDate: "2026-05-21",
          compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
          d1Databases: { DB: "test-db" },
          r2Buckets: { ARCHIVE: "test-archive" },
          bindings: {
            BOND_API_SERVICE_KEY: "test-key",
            // tests/workers/setup.ts가 applyD1Migrations()에 그대로 넘긴다.
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    name: "workers",
    include: ["tests/workers/**/*.test.ts"],
    setupFiles: ["./tests/workers/setup.ts"],
  },
});
