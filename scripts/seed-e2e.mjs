#!/usr/bin/env node
// Playwright E2E용 로컬 D1을 처음부터 만든다: `.wrangler/e2e-state` 초기화 →
// 마이그레이션 적용 → `e2e/fixtures/detail.sql` 픽스처 삽입.
//
// **개발용 D1(`.wrangler/state`, `pnpm seed:local`로 채운 실데이터)과 분리한 이유**:
// E2E는 결정론적인 한 종목만 있으면 되는데, 그걸 개발 DB에 섞으면 가짜 종목이 로컬
// 스크리너(스냅샷 재빌드 시)까지 흘러든다. `@cloudflare/vite-plugin`의 `persistState`와
// wrangler의 `--persist-to`가 똑같이 `<path>/v3`를 쓰므로(양쪽 dist 실측), 같은 경로만
// 넘기면 dev 서버와 이 스크립트가 같은 SQLite를 본다 — 경로 전달은
// `playwright.config.ts`의 `webServer.env.E2E_PERSIST_PATH` → `astro.config.mjs`.
//
// **`playwright test`보다 먼저 돌아야 한다**(`package.json`의 `test:e2e`가 `&&`로 묶는다).
// Playwright는 `webServer`를 `globalSetup`보다 먼저 띄우므로(`playwright@1.62.1`의
// `createGlobalSetupTasks`가 플러그인 셋업 뒤에 globalSetup을 배치 — dist 실측),
// globalSetup에서 시드하면 이미 뜬 dev 서버의 Miniflare가 연 SQLite를 갈아엎게 된다.
//
// 사용법: node scripts/seed-e2e.mjs

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/env.mjs";
import { readDatabaseName, WRANGLER_ENV } from "./lib/wrangler-config.mjs";

/** `astro.config.mjs`가 `E2E_PERSIST_PATH`로 받는 값과 반드시 같아야 한다. */
const PERSIST_PATH = ".wrangler/e2e-state";
const FIXTURE_SQL = "e2e/fixtures/detail.sql";

function wrangler(args) {
  // `pnpm exec wrangler ...` 형태를 유지한다 — Claude Code 세션의 샌드박스 예외가 이
  // 문자열에 매칭된다(AGENTS.md). WRANGLER_ENV는 텔레메트리(sparrow.cloudflare.com)를
  // 끈다 — 샌드박스 네트워크 정책에 막히면 명령 전체가 조용히 실패한다.
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: WRANGLER_ENV,
  });
}

const db = readDatabaseName();
const persistArgs = ["--local", "--persist-to", PERSIST_PATH, "--config", "./wrangler.jsonc"];

// 매번 지우고 새로 만든다 — 이전 실행이 남긴 상태가 테스트 결과를 바꾸지 않게.
rmSync(path.join(PROJECT_ROOT, PERSIST_PATH), { recursive: true, force: true });

wrangler(["d1", "migrations", "apply", db, ...persistArgs]);
wrangler(["d1", "execute", db, ...persistArgs, "--file", FIXTURE_SQL, "--yes"]);

console.log(`\nE2E D1 준비 완료: ${PERSIST_PATH} (${db}, ${FIXTURE_SQL})`);
