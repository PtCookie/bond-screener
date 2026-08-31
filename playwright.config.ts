import { defineConfig, devices } from "@playwright/test";

/**
 * 이 앱(Astro dev 서버) 전용 E2E 설정.
 *
 * 컴포넌트 단위 크로스브라우저 검증은 Vitest Browser Mode(vitest.browser.config.ts,
 * chromium/firefox/webkit 3종)가 이미 담당한다 — 여기서는 실제 Astro 서버·SSR·라우팅·
 * 전체 페이지 리로드를 거치는 상태 지속성 등 컴포넌트 테스트로 재현할 수 없는 것만 본다.
 * 그래서 기본 프로젝트는 데스크톱 chromium 1종 + 모바일 1종으로 좁힌다.
 *
 * `/api/snapshot/*`는 각 스펙이 page.route()로 모킹한다(e2e/fixtures/snapshot.ts) —
 * pnpm seed:local(.backfill/ 319MB, 오픈API 재수집 필요) 없이도 결정론적으로 돈다.
 * 상세 페이지(/bond/[id])는 SSR이 D1을 직접 타므로 이 모킹 대상이 아니다 — E2E에서는
 * 라우팅 전이(URL이 바뀌는 것)까지만 검증하고 응답 내용은 단언하지 않는다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Astro 7.2({astro}/dist/cli/agent.js)는 `am-i-vibing`으로 "AI 에이전트가 실행 중인지"를
    // CLAUDECODE 등 환경변수로 감지해, 감지되면 `--background` 없이도 dev 서버를 자동으로
    // 백그라운드 데몬으로 띄우고 launcher 프로세스는 즉시 종료한다(실측 확인: Claude Code
    // 세션에서 `astro dev`를 아무 플래그 없이 실행해도 상태 메시지만 찍고 바로 끝난다).
    // Playwright는 command가 계속 살아있는 포그라운드 프로세스라고 가정하므로, 이 자동
    // 백그라운드 전환을 "Process from config.webServer exited early"로 오인해 실패한다.
    // CLAUDECODE를 빈 문자열로 지워(`checkEnvVar`가 Boolean() 판정이라 빈 문자열은
    // falsy) 감지를 끄면 정상적인 포그라운드 프로세스로 뜬다.
    env: { CLAUDECODE: "" },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },

    // firefox/webkit은 CI에서만 — 로컬 실행 시간을 4배로 늘리지 않기 위함. 브라우저별
    // 렌더링 차이는 Vitest Browser Mode(위 참고)가 컴포넌트 수준에서 이미 덮는다.
    ...(process.env.CI
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
});
