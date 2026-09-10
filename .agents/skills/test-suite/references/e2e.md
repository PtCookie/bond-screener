# Playwright E2E (`e2e/`)

`playwright.config.ts`. 실행은 `pnpm test:e2e`(스크립트) 또는 이 세션에서는 샌드박스 예외 매칭을 위해 `pnpm exec playwright test ...`.

## 데이터는 모킹한다 — 시드가 필요 없다

`webServer`가 `pnpm dev`를 띄우고, 각 스펙이 `page.route()`로 `/api/snapshot/*`를 모킹한다(`e2e/fixtures/snapshot.ts`가 `src/lib/snapshot/encode.ts`를 상대 경로로 직접 import해 픽스처를 만든다 — 그 파일이 `@/` 별칭을 안 쓰는 이유는 AGENTS.md "데이터 계층" 절 참고). 따라서 `pnpm seed:local`(`.backfill/` 319MB, 오픈API 재수집 필요)이 **필요 없다.**

상세 페이지(`/bond/[id]`)는 SSR이 D1을 직접 타 이 모킹 대상이 아니다 — E2E에서는 **라우팅 전이(URL이 바뀌는 것)까지만** 검증하고 응답 내용은 단언하지 않는다.

## 데스크톱/모바일 프로젝트 분리

`screener.spec.ts`류(데스크톱 표 레이아웃, 종목당 `<tr>` 1개, 고정 td 인덱스 가정)는 `test.skip(({ isMobile }) => isMobile, ...)`로 `Mobile Chrome`을 건너뛴다. 모바일(종목당 2행)은 `responsive.spec.ts`가 반대로 `test.skip(({ isMobile }) => !isMobile, ...)`로 데스크톱을 건너뛰며 따로 검증한다.

## 셀렉터·타이밍 함정

- **`ScreenerFilterRange` 트리거(예: "만기일", "표면이율")는 같은 이름의 표 헤더 정렬 버튼과 접근성 이름이 충돌한다**(다중선택 트리거는 "라벨 전체/개수" 접미사가 붙어 안 겹침) — `exact: true`와 DOM 순서(필터 바가 표보다 먼저 나옴, `.first()`)로 구분할 것.
- **fetch 실패 → 에러 화면 전환을 기다리는 단언에는 넉넉한 타임아웃(예: 15초)을 줄 것.** `useScreenerData`가 TanStack Query의 기본 retry(3회, 지수 백오프)를 끄지 않으므로, 기본 5초로는 재시도 도중(`isPending` 유지) 타임아웃돼 "0건"으로 보이는 중간 상태를 에러로 오인해 실패한다.

## `astro dev`가 자동으로 백그라운드 데몬이 된다 — `webServer`를 깨뜨린다

Astro 7.2(`{astro}/dist/cli/agent.js`)는 `am-i-vibing` 패키지로 "AI 에이전트가 실행 중인지"를 `CLAUDECODE` 등 환경변수로 감지하고, 감지되면 `--background` 플래그 없이도 dev 서버를 백그라운드 데몬으로 띄운 뒤 launcher 프로세스를 즉시 종료한다(실측: 플래그 없이 `astro dev`를 실행해도 상태 메시지 한 줄만 찍고 끝나며, 실제 서버는 `astro dev status`로 확인되는 별도 프로세스로 계속 돈다).

Playwright는 `webServer.command`가 계속 살아있는 포그라운드 프로세스라고 가정하므로 이 자동 전환을 `Process from config.webServer exited early`로 오인해 실패한다. `playwright.config.ts`의 `webServer.env`에 `{ CLAUDECODE: "" }`를 넘겨 감지를 끈다(`am-i-vibing`의 `checkEnvVar`가 `Boolean(value)` 판정이라 빈 문자열은 falsy — 실측 확인). 이 프로젝트 밖에서 `astro dev`를 다른 자동화(cron, CI 스크립트 등)로 띄울 때도 같은 문제가 재현될 수 있다.
