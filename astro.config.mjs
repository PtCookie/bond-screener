// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { env } from "node:process";

// Workaround for Vitest
const isVitest = !!env.VITEST;

// https://astro.build/config
export default defineConfig({
  output: "server",

  site: "https://bond-screener.ptcookie.net",

  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()],

    // .claude/worktrees/<name>/ 는 프로젝트 루트 **안에** 만들어지는 git worktree(저장소 전체
    // 사본, 자체 tsconfig.json 포함)다. 이걸 감시 대상에서 빼지 않으면 다른 Claude Code 세션이
    // worktree를 만들거나 지우는 순간 Vite가 그 tsconfig.json의 add/change 이벤트를 잡아
    // reloadOnTsconfigChange()를 돌린다 — 모든 environment의 moduleGraph.invalidateAll() +
    // full-reload다. 테스트 실행 중에 이게 터지면 브라우저 3종이 모듈을 import하던 도중
    // 모듈 그래프가 통째로 날아가면서 "Failed to import test file ... SyntaxError"가
    // 파일·브라우저 단위로 무작위하게 뜬다(실측 확인). dev 서버에서도 같은 이유로 불필요한
    // full-reload가 걸린다.
    server: {
      watch: {
        // Vite가 자기 기본 목록(.git/node_modules 등)에 이어 붙이므로 덮어쓰지 않는다.
        ignored: ["**/.claude/**"],
      },
    },
  },

  adapter: isVitest ? undefined : cloudflare(),
});
