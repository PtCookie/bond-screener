# Playwright E2E (`e2e/`)

`playwright.config.ts`. 실행은 **`pnpm test:e2e`**다 — 이 스크립트가 D1 픽스처 시드까지 함께 돌린다(아래 참고). 파일·프로젝트를 좁혀 부를 때만 `pnpm exec playwright test <파일> --project=chromium`을 쓰되, 시드가 이미 끝나 있어야 한다.

> **4321 포트가 남의 서버면 전부 깨진다.** `reuseExistingServer: !CI`라 로컬에서 4321에 다른 앱(다른 Astro 프로젝트 등)이 떠 있으면 Playwright가 그걸 그대로 재사용해 **모든** 스펙이 엉뚱한 사이트를 상대로 실패한다(실측: 다른 프로젝트가 4321을 잡고 있어 27건 중 25건 실패, 원인이 코드처럼 보였다). 원인 불명의 전면 실패를 만나면 먼저 `curl -sI http://localhost:4321/`로 우리 앱인지 확인할 것.

## 데이터: 목록은 모킹, 상세는 픽스처 D1

`webServer`가 `pnpm dev`를 띄운다. 데이터는 두 갈래이고, **둘 다 `pnpm seed:local`(`.backfill/` 319MB, 오픈API 재수집 필요)이 필요 없다.**

- **목록 화면** — 각 스펙이 `page.route()`로 `/api/snapshot/*`를 모킹한다(`e2e/fixtures/snapshot.ts`가 `src/lib/snapshot/encode.ts`를 상대 경로로 직접 import해 픽스처를 만든다 — 그 파일이 `@/` 별칭을 안 쓰는 이유는 AGENTS.md "데이터 계층" 절 참고).
- **상세 페이지(`/bond/[id]`)** — SSR이 D1을 직접 타 `page.route()`가 닿지 않는다. `scripts/seed-e2e.mjs`가 **E2E 전용 로컬 D1**(`.wrangler/e2e-state`)을 매번 새로 만들어 마이그레이션 + `e2e/fixtures/detail.sql`(픽스처 1종목)을 심는다. 경로 전달은 `playwright.config.ts`의 `webServer.env.E2E_PERSIST_PATH` → `astro.config.mjs`가 어댑터 `persistState`로 넘김(`@cloudflare/vite-plugin`의 `persistState`와 wrangler의 `--persist-to`가 똑같이 `<path>/v3`를 쓴다 — 양쪽 dist 실측). 개발용 실데이터 D1(`.wrangler/state`)과 **섞지 말 것**.
- `detail.sql`의 종목 정체성(ISIN·종목명·발행인)은 `snapshot.ts`의 `makeBonds()` 첫 종목과 일치해야 한다 — `navigation.spec.ts`가 목록에서 클릭해 들어간 상세를 `makeBonds()` 쪽 값으로 단언하므로 한쪽만 고치면 즉시 깨진다.

### 시드는 `globalSetup`이 아니라 `test:e2e` 스크립트 앞단에 있다

`playwright@1.62.1`의 `createGlobalSetupTasks`는 `createPluginSetupTasks`(= `webServer` 플러그인) **뒤에** `globalSetups`를 배치한다(`lib/runner/index.js:6003` 실측). 즉 globalSetup에서 시드하면 이미 뜬 dev 서버의 Miniflare가 연 SQLite를 갈아엎게 된다. 그래서 `package.json`이 `"test:e2e": "node scripts/seed-e2e.mjs && playwright test"`로 묶는다 — **`pnpm exec playwright test`를 직접 부르면 시드가 안 돈다**(상세 테스트가 500/404로 깨진다).

### 상세 페이지는 응답 상태를 명시적으로 단언한다

`page.waitForURL()`은 상태 코드를 보지 않는다. 그래서 CI에 D1 스키마가 없던 시절(2026-09 이전) 상세 페이지가 `no such table: bond`로 **500**을 내는데도 `navigation.spec.ts`는 통과했고, 로그에만 스택 트레이스가 쌓였다. 지금은 `expect(response?.status()).toBe(200)`(정상)·`toBe(404)`(없는 ISIN)로 상태를 직접 고정한다 — 상세 경로를 건드릴 때 이 단언을 빼지 말 것.

## 데스크톱/모바일 프로젝트 분리

`screener.spec.ts`류(데스크톱 표 레이아웃, 종목당 `<tr>` 1개, 고정 td 인덱스 가정)는 `test.skip(({ isMobile }) => isMobile, ...)`로 `Mobile Chrome`을 건너뛴다. 모바일(종목당 2행)은 `responsive.spec.ts`가 반대로 `test.skip(({ isMobile }) => !isMobile, ...)`로 데스크톱을 건너뛰며 따로 검증한다.

## 셀렉터·타이밍 함정

- **`ScreenerFilterRange` 트리거(예: "만기일", "표면이율")는 같은 이름의 표 헤더 정렬 버튼과 접근성 이름이 충돌한다**(다중선택 트리거는 "라벨 전체/개수" 접미사가 붙어 안 겹침) — `exact: true`와 DOM 순서(필터 바가 표보다 먼저 나옴, `.first()`)로 구분할 것.
- **fetch 실패 → 에러 화면 전환을 기다리는 단언에는 넉넉한 타임아웃(예: 15초)을 줄 것.** `useScreenerData`가 TanStack Query의 기본 retry(3회, 지수 백오프)를 끄지 않으므로, 기본 5초로는 재시도 도중(`isPending` 유지) 타임아웃돼 "0건"으로 보이는 중간 상태를 에러로 오인해 실패한다.

## `astro dev`가 자동으로 백그라운드 데몬이 된다 — `webServer`를 깨뜨린다

Astro 7.2(`{astro}/dist/cli/agent.js`)는 `am-i-vibing` 패키지로 "AI 에이전트가 실행 중인지"를 `CLAUDECODE` 등 환경변수로 감지하고, 감지되면 `--background` 플래그 없이도 dev 서버를 백그라운드 데몬으로 띄운 뒤 launcher 프로세스를 즉시 종료한다(실측: 플래그 없이 `astro dev`를 실행해도 상태 메시지 한 줄만 찍고 끝나며, 실제 서버는 `astro dev status`로 확인되는 별도 프로세스로 계속 돈다).

Playwright는 `webServer.command`가 계속 살아있는 포그라운드 프로세스라고 가정하므로 이 자동 전환을 `Process from config.webServer exited early`로 오인해 실패한다. `playwright.config.ts`의 `webServer.env`에 `{ CLAUDECODE: "" }`를 넘겨 감지를 끈다(`am-i-vibing`의 `checkEnvVar`가 `Boolean(value)` 판정이라 빈 문자열은 falsy — 실측 확인). 이 프로젝트 밖에서 `astro dev`를 다른 자동화(cron, CI 스크립트 등)로 띄울 때도 같은 문제가 재현될 수 있다.

그렇게 뜬 데몬은 **`pnpm dev stop`으로 끈다**. `--port`는 무시된다 — `stop`은 `getRootURL(flags)`(`--root`, 기본 cwd)로 `<root>/.astro/dev.json` 락 파일을 읽어 거기 적힌 pid에 SIGTERM(5초 후 SIGKILL)을 보낼 뿐이다(`{astro}/dist/cli/server.js`의 `stop`, `dist/core/dev/lockfile.js`). **락 파일은 프로젝트 루트당 하나**라 같은 프로젝트에서 서버를 둘 이상 띄우면(예: Playwright webServer가 포그라운드로 떠 있는데 데몬을 또 띄우면) 마지막 것만 추적되고, 먼저 뜬 서버는 `stop`으로 못 잡는다 — 그땐 `lsof -nP -iTCP:<port> -sTCP:LISTEN`으로 pid를 찾아 `kill`할 것.

살아 있는 서버에 `pnpm dev stop`이 "No dev server is running."이라고 답하면 락 파일이 stale로 오판돼 지워진 것이다: `checkExistingServer`는 `find-proc`으로 그 pid의 커맨드라인을 읽어 astro 실행 파일 패턴(`ASTRO_COMMAND_PATTERN`)과 대조하고, 일치하지 않으면 죽은 것으로 보고 락을 삭제한다. 프로세스 조회가 막힌 환경(예: `lsof`/`kill` 권한이 없는 Claude Code 샌드박스)에서 실제로 이 오판이 관측됐다 — 그 경우 서버는 계속 살아 있으므로 포트로 pid를 찾아 직접 죽여야 한다.
