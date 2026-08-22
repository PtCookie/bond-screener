/**
 * Cloudflare Workers 진입점.
 *
 * `fetch`는 `@astrojs/cloudflare` 어댑터의 `handle`에 그대로 위임한다
 * (`@astrojs/cloudflare/entrypoints/server`가 하던 일과 동일). `scheduled`(cron)만
 * 이 파일에서 추가로 구현한다. 이 파일을 두기 위해 `wrangler.jsonc`의 `main`을
 * 어댑터 entrypoint 대신 이 경로로 바꿨다 — 어댑터가 사용자 지정 `main`을
 * 공식 지원하며(`main: config.main ?? "@astrojs/cloudflare/entrypoints/server"`),
 * 번들링은 wrangler esbuild가 아니라 `@cloudflare/vite-plugin`이 담당하므로
 * 이 파일이 어댑터 내부 virtual module을 참조해도 문제없다.
 */
import { handle } from "@astrojs/cloudflare/handler";
import { runSyncTick } from "@/lib/sync/tick";

export default {
  fetch: handle,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSyncTick(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
