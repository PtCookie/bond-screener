# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

공공데이터포털(data.go.kr)이 제공하는 금융위원회 채권 오픈API 2종(기본정보, 시세정보)을 조회하는 Astro 기반 웹 애플리케이션. React Islands 패턴으로 인터랙티브 UI를 구성하고, Cloudflare Workers에 배포한다.

## Commands

```bash
pnpm dev              # 개발 서버 시작 (localhost:4321)
pnpm build            # 프로덕션 빌드 (./dist/)
pnpm preview          # 빌드 결과 로컬 미리보기
pnpm lint             # ESLint 실행
pnpm format           # Prettier 포매팅 실행
pnpm test             # Vitest watch 모드 실행 (node/browser/workers 세 프로젝트)
pnpm test --run       # Vitest 1회 실행 (CI/훅과 동일)
pnpm test <file>      # 특정 파일 테스트 실행
pnpm test --project=browser --run   # Browser Mode(React 컴포넌트·훅)만 실행
pnpm test:e2e         # Playwright E2E 실행 (webServer가 pnpm dev를 자동으로 띄움)
pnpm generate-types   # wrangler.jsonc 기반 Cloudflare 바인딩 타입 생성 (worker-configuration.d.ts)
pnpm deploy           # 빌드 후 Cloudflare Workers에 배포 (astro build && wrangler deploy)
pnpm prepare          # lefthook 설치 (최초 세팅 시 자동 실행됨)

# 원격 배포 상태 확인 (secret/migration/backfill이 실제로 반영됐는지는 코드로 알 수 없음):
wrangler secret list --config ./wrangler.jsonc
wrangler d1 migrations list bond-screener --remote --config ./wrangler.jsonc
wrangler d1 execute bond-screener --remote --config ./wrangler.jsonc --command "SELECT COUNT(*) FROM bond"
```

## Git Hooks (lefthook)

- **pre-commit**: staged 파일에 `tsc --noEmit` 타입 체크 + ESLint + Prettier 자동 실행 (`*.{js,mjs,ts,tsx,astro,css,json}`)
- **pre-push**: `pnpm test --run` 실행
- `pnpm prepare` 로 lefthook 설치 (초기 세팅 시 필요)

## 알려진 이슈

- **`astro.config.mjs`의 `isVitest` 분기(=vitest일 때 `adapter`를 비활성화)를 제거하지 말 것.** 근본 원인을 실측으로 규명했다: `@astrojs/cloudflare@14.1.3`가 자기 Worker 환경을 `viteEnvironment: { name: "ssr" }`로 등록하는데, Vitest 4.1.10은 `configEnvironment` 훅에서 **모든** 환경의 `resolve.external`을 `[...builtinModules, ...builtinModules.map(m => "node:"+m)]`로 무조건 덮어쓴다. `@cloudflare/vite-plugin@1.45.1`의 `validateWorkerEnvironmentOptions`는 이 값이 "node 빌트인만"이면 통과시키지만, Node 24의 `builtinModules`에는 이미 `node:` 접두사가 붙은 항목이 4개(`node:sea`/`node:sqlite`/`node:test`/`node:test/reporters`) 있어 Vitest가 이를 거르지 않고 접두사를 한 번 더 붙인 `node:node:sqlite` 같은 이중 접두사 4개를 만들어낸다 — 플러그인의 허용 집합엔 없는 값이라 검증에 실패해 `pnpm test`가 시작조차 못 한다. 즉 **양쪽 라이브러리의 node 빌트인 접두사 처리 한 줄 차이**가 원인이며, 어느 한쪽이 고쳐지기 전까지는 이 우회가 유일한 해결책이다.
- Claude Code 세션에서 `pnpm dev`/`pnpm exec wrangler`는 `.claude/settings.json`의 `sandbox.excludedCommands`에 등록돼 있어 **명령을 그 문자열 그대로(감싸지 않고) 실행해야** 샌드박스 밖에서 전체 호스트 권한으로 돈다. `timeout pnpm dev &`처럼 앞에 다른 명령을 붙이면 패턴이 안 맞아 그냥 샌드박스 안에서 실행되고, 그렇게 뜬 dev 서버는 프로세스 네임스페이스가 갈려서 이후 `pnpm dev stop`(언샌드박스 실행)으로도 못 찾고 못 죽인다 — 백그라운드로 띄울 때 특히 주의. 테스트도 같은 이유로 **반드시 `pnpm test ...` 형태**로 부를 것(`pnpm exec vitest`는 매칭 안 돼 크로미움이 샌드박스에서 죽는다). 또한 `pnpm test -- --project=browser`처럼 `--`를 끼우면 vitest 옵션 파싱이 깨진다 — `pnpm test --project=browser --run`처럼 붙일 것.
- D1 로컬 모드(`wrangler d1 execute --local`)는 `sandbox.network.allowLocalBinding: true`(같은 설정 파일)가 있어야 동작한다. 이미 켜져 있음 — 지우지 말 것.
- 로컬(Miniflare) `wrangler d1 execute --local --json`의 `meta`에는 `rows_written`이 없다(`duration`만 옴) — 원격 전용 필드다. 로컬 write 카운트에 의존하는 로직을 추가할 때는 `null` 허용 폴백을 둘 것(`scripts/backfill.mjs`의 `executeSqlFile` 참고).
- `scripts/backfill.mjs`/`scripts/build-snapshot.mjs`가 `execFileSync`로 spawn하는 `wrangler` 서브프로세스는 (예: `pnpm backfill apply ...`처럼) 최상위 Bash 명령이 `pnpm exec wrangler ...` 자체가 아닌 한 `sandbox.excludedCommands`에 매칭되지 않아 샌드박스 안에서 실행된다. wrangler가 기본으로 보내는 텔레메트리(`sparrow.cloudflare.com`) 호출이 샌드박스 네트워크 정책에 막혀 명령 전체가 조용히 실패하므로, 두 스크립트 모두 `scripts/lib/wrangler-config.mjs`의 `WRANGLER_ENV`(`WRANGLER_SEND_METRICS=false`)를 해당 `execFileSync` 호출의 `env`로 넘겨 텔레메트리 자체를 끈다 — 새 `execFileSync(..., "wrangler", ...)` 호출을 추가할 때도 이 `env`를 넘길 것.
- wrangler의 OAuth 로그인 토큰은 만료되면 자동 갱신을 시도하는데, non-interactive 환경(예약 작업/스크립트 실행)에서는 브라우저 재인증을 못 해 `wrangler whoami`/`d1 execute` 등이 "Not logged in. Your auth token has expired..." 로 실패한다. 이 경우 사용자가 인터랙티브 터미널에서 `wrangler login`을 다시 실행해야 하며, 예약 작업으로 완전히 자동화하려면 `CLOUDFLARE_API_TOKEN` 환경변수(OAuth 대신 API 토큰 인증)를 등록하는 방법을 검토할 것.
- `pnpm add`/`pnpm install`이 샌드박스에서 `[ERR_PNPM_UNEXPECTED_STORE]`로 실패할 수 있다(`node_modules`가 링크된 store와 pnpm이 쓰려는 store 경로가 다름) — `--store-dir /Users/cookie/Library/pnpm/store/v11`을 붙여 실행할 것.
- `git stash`(pop 포함)는 lockfile 변경이 있으면 자동으로 `pnpm install`을 트리거해 샌드박스에서 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`로 실패할 수 있다(무해하게 중단됨, 이전 stash는 그대로 살아있음) — 원본 파일 내용만 빠르게 비교/린트하고 싶으면 stash 대신 임시 파일로 떠서 확인할 것.
- **서버에서 데이터를 전혀 내려받지 않고 클라이언트 fetch에만 의존하는 island는 `client:load`를 쓰지 말 것** — `index.astro`의 `BondScreener`(`useScreenerData`가 클라이언트에서 `/api/snapshot/*`을 fetch, SSR 시점엔 항상 로딩 스켈레톤만 렌더)가 실제로 이 버그를 겪었다. `@astrojs/react@6.0.1`의 `dist/client.js`는 island가 이미 하이드레이션된 상태(`isAlreadyHydrated`로 `__reactContainer` 키 감지)라도 그 키를 지우고 `hydrateRoot`를 다시 호출한다 — 브라우저가 back/forward로 "이전 방문 때 데이터 로드가 끝나 활성화된 DOM"을 그대로 복원한 뒤 이 재하이드레이션이 실행되면, 클라이언트의 첫 렌더(필터/데이터 모두 초기값 → 버튼들 `disabled`)와 복원된 DOM(로드 완료 → `disabled` 아님)이 어긋나 React 하이드레이션 불일치 콘솔 경고가 뜬다(`disabled={true}` vs `disabled={null}` 형태로 나타남, 실측 확인: 콜드 SSR HTML엔 항상 `disabled`가 이미 붙어 있어 최초 로드에서는 재현되지 않고 뒤로가기 복원에서만 재현됨). `client:only="react"`로 바꾸면 서버 HTML과 대조하는 단계 자체가 없어져 이 문제가 구조적으로 사라진다 — 서버가 props로 실제 데이터를 내려주는 island(`bond/[id].astro`의 `BondDetail`)는 이 문제와 무관하니 `client:load`를 유지할 것.
- `pnpm add`/`pnpm install`이 의존성 트리에 `.vscode/settings.json`을 포함한 패키지가 끼면(예: `@astrojs/sitemap`이 끌어오는 `stream-replace-string`) `[ERR_PNPM_EPERM] ... copyfile ... .vscode/settings.json`로 실패한다 — 샌드박스가 경로에 `.vscode/`가 들어간 쓰기를 정책적으로 차단해서다(에디터 자동 실행 설정을 노리는 공급망 공격 방지). `--package-import-method=copy` 등 pnpm 옵션으로 우회 안 됨 — 사용자에게 터미널에서 직접 `pnpm add`(위 `--store-dir` 포함)를 실행해 달라고 요청할 것.
- `sips`/`qlmanage` 등 macOS 자체 이미지 변환 도구는 이 샌드박스에서 못 쓴다 — 내부적으로 실제 시스템 TMPDIR(`/var/folders/...`)에 스크래치 파일을 쓰려다 `Error 13`/`sandbox initialization failed`로 실패한다(샌드박스는 `$TMPDIR`만 쓰기 허용). SVG→PNG/ICO 같은 변환이 필요하면 Node 내장 모듈(`zlib.crc32` 등)로 직접 인코딩하거나 사용자에게 실행을 요청할 것.
- Bash `curl`이 방금 연결한 Custom Domain에 CONNECT 단계부터 502를 낼 수 있다 — 실제로는 DNS·라우팅 모두 정상인데 Bash 샌드박스의 네트워크 프록시가 과거 실패를 들고 있는 것으로 보인다(외부 DoH로 직접 조회하면 정상 확인됨). 라이브 여부를 판단할 땐 Browser 도구(`mcp__Claude_Browser__navigate`, 별도 네트워크 경로)로 교차 확인할 것 — Bash curl의 502만 보고 사이트가 죽었다고 단정하지 말 것.
- Custom Domain은 대시보드 조작 없이 `wrangler.jsonc`만으로 붙는다: `"workers_dev": false` + `"routes": [{ "pattern": "<domain>", "custom_domain": true }]` 후 `wrangler deploy` — DNS 레코드·인증서 발급까지 Cloudflare가 자동 처리한다.
- `@astrojs/cloudflare` 14.2.x부터 빌드 시 `imageService` 기본값이 `cloudflare-binding`으로 바뀌어 `IMAGES`/`SESSION` 바인딩을 자동으로 켜고 경고를 띄운다 — `astro:assets`의 `<Image>`나 Astro Sessions를 안 쓰면(이 프로젝트는 둘 다 안 씀) 무해한 경고이니 `wrangler.jsonc`에 억지로 바인딩을 추가하지 말 것.
- Workers Rate Limiting 바인딩(`ratelimits`, `env.<NAME>.limit({key})`)은 로컬 `astro dev`/Miniflare에서 전혀 제한하지 않는다(실측: 40연속 요청 전부 200) — wrangler의 바인딩 지원표엔 `ratelimit: "local-only"`로 잡혀 있지만 실제 로컬 시뮬레이터가 없다. 반드시 배포 후 프로덕션에서 검증할 것. 카운터도 전역이 아니라 **Cloudflare 위치(colo)별**이라 같은 클라이언트가 요청마다 다른 카운터에 걸릴 수 있음(공식 문서에 명시된 근사치 설계) — 정확한 전역 한도가 아니라 남용 방지용 근사치로만 쓸 것.
- `git log`상 최신 커밋과 실제 배포본이 다를 수 있다 — 예전엔 `wrangler deploy`가 순수 수동이라 커밋해도 자동 반영이 안 됐다(실제로 여러 날치 커밋이 배포 안 된 채 방치된 적 있음). 지금은 CI/CD가 연결돼 있지만(2026-08-31부터, `git.ptcookie.net` 자체 호스팅) **`production` 브랜치에 push할 때만 배포가 걸린다 — `main`에 커밋/병합해도 자동 배포되지 않는다.** 배포 여부가 의심되면 `pnpm exec wrangler deployments list --config ./wrangler.jsonc`(오래된 순 정렬)로 마지막 배포 시각을 커밋 시각과 대조해 확인할 것.
- **`.claude/worktrees/<name>/`(루트 안에 생기는 git worktree)를 Vite/Vitest 감시·수집 대상에서 빼는 설정을 제거하지 말 것.** 다른 Claude Code 세션이 만드는 이 디렉터리는 저장소 전체 사본(자체 `tsconfig.json`·`tests/`·`node_modules` 포함)이고 `.git/info/exclude`로 git-ignore되지만, Vite도 Vitest도 그 파일을 읽지 않아 두 가지 문제를 일으킨다. ① `vitest.node.config.ts`의 기본 include(`**/*.{test,spec}.*`)가 worktree 사본의 `tests/**`를 통째로 수집해 browser 전용 테스트가 forks 풀로 끌려 들어가 `vitest/browser can be imported only inside the Browser Mode`로 무더기 실패한다(실측: node 프로젝트가 29개 대신 92개 파일을 수집, 34개 실패) — `exclude`에 `.claude/**`를 넣어 막는다. ② Vite의 watcher가 worktree의 `tsconfig.json` add/change 이벤트를 잡으면 `reloadOnTsconfigChange()`가 **모든** environment에 대해 `moduleGraph.invalidateAll()` + `full-reload`를 날린다(vite 8.2.2 `dist/node/chunks/node.js:3546` 실측 확인). `pnpm dev` 중에 다른 세션이 worktree를 만들거나 지우면 이유 없는 full-reload가 걸린다 — `astro.config.mjs`의 `vite.server.watch.ignored`(node·browser 프로젝트와 `pnpm dev`가 공유)와 `vitest.workers.config.ts`의 동일 설정(`getViteConfig()`를 안 거쳐서 따로 필요)으로 막는다. Vite가 이 값을 자기 기본 목록에 **이어 붙이므로** 덮어쓸 걱정은 없다. **단 ②가 `pnpm test --run`(pre-push)의 실패 원인은 될 수 없다** — Vitest는 run 모드에서 `viteConfig.server.watch = null` + `await server.watcher.close()`를 하고(`vitest@4.1.11` `dist/chunks/cli-api.*.js`의 `configResolved`/`configureServer`), `@vitest/browser`는 자기 Vite 서버를 아예 `server: { hmr: false, watch: null }`로 띄운다(`dist/index.js`의 `createBrowserServer`). 즉 테스트 실행 중에는 watcher 자체가 없다. 예전에 이 항목이 설명하던 `Failed to import test file ... SyntaxError` 유령 실패의 진짜 원인은 아래 별도 항목(의존성 사전번들 재생성)이다.
- **browser 프로젝트에서 파일 여러 개가 한꺼번에 `Failed to import test file ... SyntaxError`로 죽으면 의존성 사전번들 재생성과 겹친 것이다 — 소스 코드 문제가 아니다.** 실측 사례: `git push`의 pre-push(`pnpm test --run`)에서 chromium 5개 파일이 전부 `SyntaxError: Unexpected token '}'`로 실패했는데, 그 실행 로그 맨 위에 `[vite] (client) Re-optimizing dependencies because vite config has changed` → `[optimizer] bundling dependencies...`가 찍혀 있었고 실패한 파일들은 브라우저 단계가 시작되자마자 나온 것들이었다. Vite는 `node_modules/.vite/vitest/<sha1(프로젝트명)>/deps/_metadata.json`의 `lockfileHash`/`configHash`가 현재 값과 다르면 그 `deps` 디렉터리를 통째로 지우고 다시 번들하는데(`loadCachedDepOptimizationMetadata`, vite 8.2.2 `dist/node/chunks/node.js:32147`), Vitest browser 모드는 Vite 서버가 listen 되는 즉시 브라우저 3종 풀을 `Promise.all`로 띄워 테스트 파일을 native `import()`로 받아온다. 그래서 재번들과 import가 겹치면 그 순간 진행 중이던 파일들만 깨지고, `SyntaxError`는 테스트 파일이 아니라 그 파일이 끌어온 최적화 청크에서 나므로 여러 파일에 **똑같은** 메시지가 뜬다. browser 모드는 자기 Vite 서버를 `hmr: false`로 띄우기 때문에 Vite가 이럴 때 쓰는 복구 수단(full-reload)도 동작하지 않는다. `configHash` 입력에는 `resolve`·플러그인 이름 목록·`optimizeDeps.include/exclude`가, `lockfileHash`에는 `pnpm-lock.yaml` 내용이 들어가므로 **설정이나 의존성을 바꾼 뒤 첫 테스트 실행**(= 커밋 직후 `git push`)에서만 터지고 바로 다시 돌리면 캐시가 갱신돼 통과한다 — lefthook은 원인이 아니다. **`vitest.browser.config.ts`의 `optimizeDeps.noDiscovery`/`include`가 이걸 막으니 지우지 말 것** — `noDiscovery: true` + 비어 있지 않은 `include`면 Vite가 기본 `createDepsOptimizer` 대신 `createExplicitDepsOptimizer`(같은 파일 35505, 34701)를 쓰는데, 그 `init()`은 `optimizeExplicitEnvironmentDeps`의 번들·`commit()`까지 **await**한다(32115). 이 `init()`은 `EnvironmentInstance.listen()`이 await하고(35537), `@vitest/browser`의 `createBrowserServer`는 `await vite.listen()`이 끝난 뒤에야 브라우저를 띄운다 — 즉 경합 구간 자체가 사라진다. 기본 optimizer의 `init()`은 스캔 프라미스만 걸어두고 곧바로 반환하기 때문에(34451) listen 이후에도 번들이 계속 돌아가는 것이 이 버그의 핵심이다. 대신 `include`에 없는 의존성은 사전번들 없이 소스로 로드되므로(느려질 뿐 실패는 아님) 새 런타임 의존성을 쓰는 테스트를 추가하면 목록에도 추가할 것. 강제 재현은 브라우저 캐시(`sha1("browser")` = `ef98362b…`)의 `_metadata.json`에서 `configHash`를 아무 값으로 바꾼 뒤 `pnpm test --run`으로 한다 — 다만 **타이밍 의존이라 매번 재현되지는 않는다**(수정 전 8회 중 0회, 재최적화가 불안정해진 조건에서 3회 중 1회 재현). 재현했을 때 webkit은 `SyntaxError: Unexpected identifier 'path'. Expected '}' to end an object literal.`, chromium은 `SyntaxError: Unexpected token '}'`로 **엔진마다 다른 메시지**를 낸다 — 둘 다 같은 증상이니 메시지 문구로 다른 문제라고 판단하지 말 것.
- 이 저장소의 git remote는 GitHub가 아니라 자체 호스팅 `git.ptcookie.net`이다 — `gh` CLI 사용 불가. PR 관련 작업은 시도하지 말고 사용자에게 방법을 물을 것.

## Tech Stack

- **Astro v7** — 페이지 라우팅 및 정적/서버 렌더링 (`output: "server"`)
- **React 19** — Astro Islands로 인터랙티브 컴포넌트
- **shadcn/ui** (`@base-ui/react` 기반, Phosphor 아이콘) — UI 컴포넌트 라이브러리 (`src/components/ui/`)
- **Tailwind v4** — `@tailwindcss/vite` 플러그인
- **TanStack Query v5** (`@tanstack/react-query`) — 클라이언트 사이드 서버 상태 관리. `src/components/providers/QueryProvider.tsx`가 island당 `QueryClient`를 하나씩 만들어 감싸고(`BondScreener`/`BondDetail`), `src/hooks/useScreenerData.ts`/`useBondPrices.ts`가 각각 스냅샷·시세 시계열 fetch에 쓴다. `@tanstack/eslint-plugin-query`가 `eslint.config.ts`에 연결되어 있음
- **Cloudflare Workers** — 배포 플랫폼. `@astrojs/cloudflare` 어댑터 이미 설정됨
- **Vitest** — 단위/통합 테스트. `node`(순수 로직) / **`browser`(Vitest Browser Mode, React 컴포넌트·훅, jsdom 아님)** / `workers`(D1/R2 바인딩) 세 프로젝트로 나뉜다 — 아래 "테스트" 절 참고
- **Playwright** — E2E(`e2e/`). 스크리너 화면의 사용자 플로우를 `page.route()` 모킹으로 검증
- **ESLint** / **Prettier** — 린팅 / 포매팅

## Architecture

### Astro + React Islands

`.astro` 파일은 서버에서 렌더링되고, 인터랙티브 기능이 필요한 컴포넌트에만 `client:*` 디렉티브로 React를 사용한다 (예: `<BondTable client:load />`).

### 데이터 페칭 패턴

오픈API 호출은 `src/lib/` 또는 `src/api/`에 분리한다. Astro 페이지에서 서버 사이드로 초기 데이터를 페칭한 뒤 React island에 props로 전달하는 패턴을 기본으로 한다.

### Cloudflare 배포

`@astrojs/cloudflare` 어댑터 사용, `astro.config.mjs`에서 `output: "server"` 설정 완료. `wrangler.jsonc`의 `main`은 어댑터 entrypoint가 아니라 커스텀 진입점 `src/worker.ts`를 가리킨다 — cron `scheduled` 핸들러(아래 "데이터 계층" 절)를 추가하기 위해서다. `src/worker.ts`는 `fetch`를 `@astrojs/cloudflare/handler`의 `handle`에 그대로 위임하므로 Astro 라우팅 동작은 이전과 동일하다. 시크릿(`serviceKey` 등)·바인딩은 `import { env } from "cloudflare:workers"`로 접근한다 — 설치된 `@astrojs/cloudflare`(Astro v6+ 대응, v14.1.3)는 `Astro.locals.runtime.env`를 제거했고 접근 시 즉시 throw한다(`node_modules/@astrojs/cloudflare/dist/utils/cf-helpers.js`의 `createLocals` 실측 확인). 옛 어댑터 문서·예제의 `Astro.locals.runtime.env` 패턴을 따라 하지 말 것.
- **로컬 개발**(`pnpm dev`/`wrangler dev`): 프로젝트 루트에 `.dev.vars` 또는 `.env` 파일에 `KEY="VALUE"` 형식으로 넣는다. **둘 중 하나만 사용할 것** — `.dev.vars`가 존재하면 `.env`의 값은 무시된다. 오픈API 인증키는 `BOND_API_SERVICE_KEY`라는 이름으로 넣는다(`.claude/skills/probe-bond-api`가 이 이름을 찾는다).
- **배포**(`wrangler deploy`): `.dev.vars`/`.env`는 로컬 전용이라 배포된 Worker에는 전달되지 않는다. 반드시 `wrangler secret put <NAME>`으로 Cloudflare 플랫폼에 시크릿을 등록해야 하며, `wrangler deploy`는 그 등록된 값을 그대로 바인딩한다.
- `.dev.vars`, `.env`는 커밋 금지 (`.gitignore`에 `.dev.vars*`, `.env*` 패턴으로 등록됨).
- 바인딩 타입을 바꾼 뒤에는 `pnpm generate-types`로 `worker-configuration.d.ts`를 갱신한다.
- D1/R2 CLI 명령(`wrangler d1 execute`, `wrangler r2 object put` 등)은 항상 `--config ./wrangler.jsonc`를 명시할 것 — 빌드 산출물(`dist/server/wrangler.json`)로의 배포 리다이렉트와 혼동을 피하기 위함.

### 데이터 계층 (D1 + R2 + cron)

일일 호출 쿼터(개발계정 10,000건)와 시크릿 노출 문제 때문에 클라이언트가 오픈API를 직접 호출하지 않는다. `Client → Workers(cron) → data.go.kr` 구조로, Workers가 매일 데이터를 미리 긁어 D1에 저장하고 R2에 정적 스냅샷을 올리면 클라이언트는 R2 스냅샷만 받는다(D1 read 비용 절감 — 목록 조회 경로는 D1을 전혀 타지 않는다).

**2026-09-01부터 Workers Paid 플랜이다.** 이 절 곳곳의 "Free tier CPU 10ms/invocation" 제약은 더 이상 유효하지 않다(Paid의 cron CPU 한도는 1시간 미만 간격 기준 30초). 그 제약 때문에 갈라놨던 두 설계가 이번에 통합됐다: ① 스크리너 목록 스냅샷 빌드가 이제 cron 안에서 자동 실행된다(`src/lib/snapshot/build.ts`, 아래 "주간 스냅샷" 절), ② cron tick이 한 invocation에 페이지를 여러 개 처리한다(아래 "cron 파이프라인" 절). **다만 isolate 메모리(128MB)는 Free/Paid 공통 제약이라 그대로 남는다** — 스냅샷처럼 D1 테이블을 전량 조회하는 코드를 추가할 때는 CPU 예산이 넉넉해졌다고 전량 `all()`을 쓰지 말고, 반드시 키셋 페이지네이션으로 청크를 흘려 넣을 것(`src/lib/d1/snapshot-repo.ts`/`src/lib/snapshot/build.ts` 참고 — 로컬 실측으로 bond 전량(29,079행)을 객체 배열로 들면 peak heap ~85MB였다).

**`src/lib/sync/`·`src/lib/snapshot/`·`src/lib/d1/`을 수정했으면 `snapshot-sync-reviewer` 서브에이전트로 리뷰할 것.** 이 계층의 불변식 전체 체크리스트와, 각 항목을 어겼을 때 실제로 터진 증상·실측 근거가 `.claude/agents/snapshot-sync-reviewer.md`에 정리돼 있다 — 아래 항목들은 그 요약(설계와 규칙)만 남기고 상세 배경은 그쪽에 둔다.

- **스키마**: `migrations/0001_init.sql`(`bond`/`bond_state`/`bond_price`/`code_label`/`sync_run`/`app_meta`), `migrations/0002_indexes.sql`(`idx_bond_expr_dt`/`idx_bond_srtn_cd`, 백필 완료 후 2026-08-28 적용). 백필 중에는 인덱스가 있으면 D1 write가 2배로 잡혀 `migrations/pending/`에 보류해 뒀던 것 — 새 인덱스를 추가할 때도 대량 백필이 얽힌 테이블이면 같은 패턴(pending에 보관 후 백필 완료 시 이동)을 고려할 것.
- **fetch/정규화**: `src/lib/openapi/`(공통 클라이언트·오류 분류·`""`/`" "`/`"NULL"` 정규화), `src/lib/bond/`(컬럼 순서 정본 `columns.ts`, 매핑 `mappers.ts`, 변경 감지 지문 `fingerprint.ts`).
- **D1 접근**: `src/lib/d1/sql.ts`가 `json_each(?1)`로 파라미터 1개에 배열을 실어 쿼리 1개로 벌크 upsert하는 SQL을 생성한다(쿼리당 bound parameter 100개 제한 우회 — 이 한도는 플랜과 무관하게 그대로라 기법 자체가 계속 필요하다). 새 upsert SQL은 반드시 `buildInsertSelect` 헬퍼를 거칠 것 — `WHERE true` 더미절 같은 SQLite 문법 함정을 헬퍼가 한 번만 방어한다.
- **cron 파이프라인**: `src/worker.ts`의 `scheduled` → `src/lib/sync/tick.ts`(`runSyncTick`). 한 tick(1분 간격) 안에서 `TICK_WALL_BUDGET_MS`(20초)·`MAX_PAGES_PER_TICK`(40) 중 먼저 닿는 예산까지 페이지를 이어 처리한다(`src/lib/sync/config.ts`) — 실질 상한은 CPU가 아니라 오픈API 응답 지연(wall-clock)이다. `runPagesUntilBudget`은 매 페이지 처리 후 D1에서 커서를 다시 읽어 진행 여부를 판단한다(backoff로 못 넘긴 페이지를 헛되이 재시도하지 않기 위함). **기본정보(`issu`)는 2026-09부터 시세와 동일하게 매 영업일 수집한다**(예전엔 주 1회 지정 요일이었다). 오늘 대상 basDt로 `issu`가 `done`이 되면, **다음 tick**에서 스크리너 스냅샷 파이프라인이 자동으로 이어진다(아래 "스크리너 스냅샷" 절) — base 전량 재빌드 요일(`SNAPSHOT_REBUILD_WEEKDAY_KST`, 기본 수요일)이면 `snapshot` 액션, 그 외 평일엔 그날 변경분만 담는 `bondDelta` 액션이다. `planTick`이 `app_meta`의 `snapshot_bas_dt`/`bond_delta_bas_dt`를 그 basDt와 비교해 판단하며, 기본정보용 `sync_run`과 달리 이 둘은 전용 `sync_run` 행을 만들지 않는다(좀비 run으로 파이프라인 전체가 막히는 것을 피하기 위한 의도된 설계).
- **`sync_run.status`는 `done`과 `empty`를 구분한다.** 오픈API 갱신이 영업일+1일 오후 1시 이후라 cron이 먼저 조회하면 0건이 온다 — `finishSyncRun`은 `totalCount===0`이면 `empty`로 마감하고, `planTick`은 `empty`를 미시작(`null`)과 동일한 재시도 대상으로 보되 `EMPTY_RETRY_BACKOFF_MS`(15분, `src/lib/sync/config.ts`)가 지나야 재시작한다(경과 시간은 기존 `finished_at`/`updated_at`으로만 판단 — 새 컬럼 없음). **`startSyncRun`은 `empty`/`failed`에서 재시작될 때 커서·누계·에러(`next_page`/`total_count`/`rows_seen`/`rows_written`/`finished_at`/`error`)를 전부 리셋한다** — `tests/workers/sync-run-repo.test.ts`/`tick.test.ts`가 회귀 방지 중.
- **D1은 `WITHOUT ROWID` 없는 TEXT PRIMARY KEY 테이블에서 write가 2배로 잡힌다**(SQLite의 암묵적 PK 인덱스 — `bond` 29,079행 삽입이 58,158 write로 실측됐다). 새 테이블의 PK가 TEXT면 `WITHOUT ROWID` 여부를 반드시 검토할 것.
- **`wrangler d1 execute --file`은 SQL statement 하나가 100,000 byte를 넘으면 `SQLITE_TOOBIG`으로 실패한다.** 벌크 INSERT는 행 개수가 아니라 바이트 예산으로 청크를 나눠야 한다 — `scripts/lib/sql-gen.mjs`의 `buildMultiValuesInsert`(테이블별 실제 write 배수를 `writeMultiplier`로 추적해 일일 write 예산도 함께 관리)가 이미 이렇게 되어 있으니 새 백필 SQL을 추가할 때도 이 헬퍼를 거칠 것.
- **테스트**: vitest는 `test.projects`로 **세 프로젝트**를 돈다(`vitest.config.ts`가 오케스트레이터). 바인딩이 필요 없는 순수 로직은 **node**(`tests/*.test.ts`, `tests/scripts/**`), DOM이 필요한 React 컴포넌트·훅은 **browser**(`tests/components/**`/`tests/hooks/**`, Vitest Browser Mode — jsdom 아님), D1/R2 바인딩이 필요하면 **workers**(`tests/workers/**`, 실제 workerd)에 둔다. 사용자 플로우는 Playwright E2E(`e2e/**`)다. **테스트를 작성·수정하거나 원인이 불분명하게 실패하면 `test-suite` 스킬을 볼 것** — 프로젝트별 함정(Browser Mode의 async `render`·Portal 스코프·`autoResetPageIndex`, workers의 파일 단위 스토리지 격리·스파이 순서, E2E의 셀렉터 충돌·retry 타임아웃·`astro dev` 데몬 문제)과 지우면 안 되는 설정이 정리돼 있다.
- **초기 백필**: `pnpm backfill <subcommand>` (`scripts/backfill.mjs`). `scripts/lib/*.mjs`는 `src/lib/`의 정규화·매핑·지문 로직을 **plain JS로 중복 구현**한 것이다(스크립트가 `node scripts/backfill.mjs`로 바로 돌아야 해서 `@/` 경로 별칭을 쓰는 TS를 import할 수 없음) — **`src/lib/bond/fingerprint.ts`와 `scripts/lib/fingerprint.mjs`는 반드시 동일한 지문을 내야 한다**(어긋나면 백필 적재분과 cron 계산분이 달라져 전 종목이 "변경됨"으로 오판된다). 둘 중 하나를 고쳤으면 한쪽만 고치고 끝내지 말고 `fingerprint-parity-check` 스킬로 교차 검증할 것.
  - `apply --source issu|price --remote|--local [--budget 90000]`의 `--remote`와 `--local`은 회계가 다르다. **`--remote`만 `.backfill/state.json`을 읽고 쓴다** — 청크별 `applied`/`appliedAt`/`actualRowsWritten`과 D1 free tier 일일 write 한도(`dailyWrites`, UTC 자정 리셋)를 추적해 이미 적용한 청크를 건너뛰고 예산을 넘기지 않는다. `--local`은 이 장부를 아예 보지 않는다(Miniflare SQLite는 write 한도가 없어 매번 전체 청크를 전량 재적용). Paid 전환으로 이 write 예산 회계 자체는 더 이상 필요 없어졌지만(월 5,000만 write 포함) 백필이 이미 완료된 뒤라 **코드는 그대로 둔다** — 다음에 이 파일을 보는 사람이 "왜 이런 장부가 있지" 의아해하지 않도록 남겨 둔다. `pnpm backfill status`는 항상 원격 기준만 보고한다.
  - 로컬 개발용 데이터를 채우려면 `.backfill/sql/`에 이미 생성된 청크를 그대로 재사용한다(재수집 불필요): `pnpm db:reset:local && pnpm seed:local`(`package.json`) — `.wrangler/state/v3/{d1,r2}` 초기화 → 마이그레이션 → issu/price 전량 적용 → `pnpm snapshot:local`까지 한 번에 돈다. `.backfill/`은 git-ignore 대상(319MB)이라 이게 지워지면 오픈API를 다시 긁어야 한다.
- **스크리너 스냅샷 — base(주 1회) + bond 델타(매 영업일)**: 기본정보가 매 영업일 수집되지만(위 "cron 파이프라인" 절), base(`snapshot/bond/{basDt}.json`, 3MB대, `immutable` 캐시)를 매일 재빌드하면 방문자가 매일 그 전체를 다시 받는다. 그래서 base는 `SNAPSHOT_REBUILD_WEEKDAY_KST`(기본 수요일, `src/lib/sync/config.ts`)에만 전량 재빌드(compaction)하고, 그 외 평일에는 그날 변경된 종목만 담은 작은 **bond 델타**(`snapshot/bond-delta/{basDt}.json`)를 올린다 — 시세가 이미 쓰던 base+delta 패턴(아래 "읽기 계층 — 목록" 절)을 bond 축으로 확장한 것이다. `src/lib/sync/plan.ts`의 분기: `issu`가 오늘 basDt로 `done`이고 base가 그 basDt로 아직 없으면(재빌드 요일이거나 base 자체가 없으면) `snapshot`, 아니면 `bondDelta`. base 재빌드가 `SNAPSHOT_MAX_ATTEMPTS`를 소진해 포기해도 `bondDelta`로 자동 폴백해 최신을 유지한다.

  **basDt 정체성 규칙(중요)**: base의 R2 키·`index.json`·`app_meta.snapshot_bas_dt`는 항상 "수집 대상 basDt"(그 tick의 `issu` run이 조회한 basDt)를 쓴다 — `bond.last_chg_bas_dt`의 최댓값을 쓰지 않는다. `src/lib/snapshot/encode.ts`의 `createSnapshotBuilder().finish(basDtOverride)`가 이 override를 받고, `buildAndPutSnapshot(env, targetBasDt)`가 항상 넘긴다. 위반하면 매 tick 재빌드 오판, 또는 `immutable` 캐시 키에 다른 내용을 덮어써 클라이언트가 영영 못 받는 문제로 이어진다(상세 근거는 `snapshot-sync-reviewer`). `scripts/build-snapshot.mjs`(수동 폴백)는 "수집 대상"이라는 개념이 없어 override 없이 기존 `MAX(last_chg_bas_dt)` 동작을 유지한다.

  base 빌드는 `bond`(정적 필드) + `bond_state`(현재값, `LEFT JOIN`) + `code_label` + 종목별 "최신" 시세(`bond_price`를 `MAX(bas_dt)` 서브쿼리로 조인) 4종을 `src/lib/d1/snapshot-repo.ts`가 **키셋 페이지네이션**(`isin_cd` 오름차순 청크, `SNAPSHOT_CHUNK_SIZE=5000`)으로 읽어 `createSnapshotBuilder()`에 순차로 흘려 넣는다 — 128MB isolate 메모리 제약 때문에 전량 `all()`을 쓰지 않는 것이 핵심 설계 포인트다. 페이지 종료 판단은 "받은 행 수"가 아니라 "페이지 내 **고유** `isin_cd` 수"로 한다(`distinctIsinCds`) — 한 `isin_cd`가 KTS·일반채권 두 행을 낼 수 있어서다.

  **bond 델타**(`src/lib/snapshot/bond-delta.ts`, `buildAndPutBondDelta`)는 그날의 변경분을 D1 재조회로 얻는다(`SNAPSHOT_BOND_CHANGED_SQL`: `WHERE b.last_chg_bas_dt = ?1 OR s.valid_from = ?1` — "bond 정적 필드 변경(신규 종목 포함) OR bond_state 변경(신용등급·잔액)"을 정확히 덮는다). 델타 한 행은 시세 델타(변경된 필드만)와 달리 그 종목의 **그날 현재 전체 상태**를 담아, 여러 날짜가 쌓여도 basDt 오름차순 덮어쓰기만으로 최신이 남는다(`mergeBondDeltas`). `bond_isur_nm`은 원문 문자열로 싣고(델타는 base의 `issuers` 사전을 모른다) 병합 시 그 사전에 인턴된다. 변경 행이 `BOND_DELTA_MAX_ROWS`(5000)를 넘으면 전량 재빌드로 폴백한다(`tooLarge`, `runBondDeltaAction`).

  `pnpm snapshot -- --remote|--local`(`scripts/build-snapshot.mjs`, **타깃 명시 필수** — 무인자 실행은 exit(1)한다; 로컬용 지름길은 `pnpm snapshot:local`)은 이제 (a) 로컬 dev 시드(`pnpm seed:local`이 내부에서 호출) (b) cron 파이프라인이 막혔을 때의 수동 원격 폴백, 두 용도로만 쓰인다 — D1을 전량 한 번에 조회해(청크 없음) `src/lib/snapshot/format.ts`(v2 포맷: 컬럼 지향 배열, 발행인 사전화, 날짜는 epoch day)로 인코딩한다(rows_read 실측 577,729). 이 스크립트는 백필 스크립트들과 반대로 `scripts/lib/*.mjs`에 로직을 재구현하지 않고 **`src/lib/snapshot/format.ts`/`encode.ts`/`index-file.ts`를 상대 경로로 직접 import한다** — 세 파일이 `@/` 별칭을 쓰지 않게 작성돼 있어 Node 24의 type stripping으로 `.ts`를 그대로 실행할 수 있기 때문(백필 스크립트 시절엔 이 방법을 몰라 plain JS 이중 구현으로 우회했었다). **cron 경로(`build.ts`, 청크 조회)와 스크립트 경로(전량 조회)는 D1 쿼리가 완전히 다르지만 인코더(`createSnapshotBuilder`/`encodeSnapshot`)와 index 갱신 함수(`applyBondSnapshotToIndex`)는 한 벌을 공유한다** — 두 경로의 산출물이 바이트 단위로 갈리면 안 되므로(발행인 사전 인덱스가 행 도착 순서로 결정되고, 두 경로 모두 `isin_cd` 오름차순으로만 행을 넣는다는 전제가 이걸 보장한다) 새로 스냅샷 관련 로직을 고칠 때 이 공유를 깨지 말 것 — `tests/workers/snapshot-build.test.ts`가 두 경로의 산출물이 `JSON.stringify` 기준으로 일치하는지 회귀 검증한다.
- **스냅샷 압축은 하지 않는다.** R2에는 평문 JSON을 그대로 저장하고 `/api/snapshot/[...path].ts`(`src/pages/api/snapshot/`)가 `object.body`를 스트리밍 패스스루한다 — Cloudflare 엣지가 `application/json` 응답에 실제 클라이언트 `Accept-Encoding` 기준으로 gzip/brotli를 자동 적용하기 때문(Worker CPU와 무관한 네트워크 계층 기능, "엣지 응답 압축" 문서 참고). **한때 R2에 `.json.gz`/`.json.br` 두 벌을 올려두고 Worker가 `Accept-Encoding`을 보고 골라 서빙하도록 만들었으나 동작하지 않았다** — 로컬 dev(Miniflare 기반 Workers 런타임)에서 실측한 결과 (1) `request.headers.get("accept-encoding")`은 Cloudflare가 항상 정규화한 값("br, gzip")만 보여줘 실제 클라이언트가 뭘 보냈는지 알 수 없었고(실제 값은 `request.cf.clientAcceptEncoding`에 있음) (2) `R2Object.writeHttpMetadata()`로 넘긴 `Content-Encoding` 헤더도 최종 응답에서 사라졌다. 새로 압축 관련 코드를 추가하기 전에 이 두 가지를 먼저 실측할 것.
- **읽기(서빙) 계층 — 목록**: 클라이언트는 `/api/snapshot/index` → base(`snapshot/bond/{basDt}.json`, 불변 캐시) + `index.bondDeltas`가 가리키는 bond 델타(`snapshot/bond-delta/{basDt}.json`) + `index.priceDeltas`가 가리키는 시세 델타(`snapshot/price/{basDt}.json`)를 병렬로 fetch한 뒤(`src/lib/snapshot/client.ts`), `mergeBondDeltas` → `mergePriceDeltas`(둘 다 `src/lib/snapshot/merge.ts`, 각각 basDt 오름차순으로 덮어씀) → `decode.ts`(`ScreenerRow[]`로 변환) 순서로 병합한다 — **bond를 먼저** 병합해야 그날 신규 상장된 종목에 같은 날 시세 델타가 붙는다. `src/hooks/useScreenerData.ts`(TanStack Query, `staleTime: Infinity`)가 이 파이프라인을 감싸고, `src/components/screener/BondScreener.tsx`가 소비한다. D1은 이 경로에 전혀 관여하지 않는다(목록 조회로 인한 D1 read가 0). `index.bondDeltas`가 없는(bond 델타 도입 이전) index.json도 `src/lib/r2/price-delta.ts`의 `readIndex()`(서버)와 `client.ts`의 `?? []`(클라이언트) 양쪽에서 빈 배열로 보정해 하위 호환한다.
- **읽기(서빙) 계층 — 상세·시계열**: 목록 스냅샷은 화면용 컬럼 10개만 담으므로, 종목 하나를 깊게 볼 때는 D1을 직접 쿼리한다. `GET /api/bond/[id]`(`src/pages/api/bond/[id].ts`)는 `bond` 전체 컬럼 + `bond_state` 이력(SCD Type 2, `valid_from` 내림차순) + 최신 `bond_price`(같은 `bas_dt`에 KTS·일반채권이 동시에 있을 수 있어 배열)를 묶어 반환하고, `GET /api/bond/[id]/prices`(`src/pages/api/bond/[id]/prices.ts`)는 `from`/`to`(기본 최근 1년)·`market` 필터로 시계열을 스냅샷과 같은 컬럼 지향 포맷으로 반환한다. `id`는 12자리 ISIN 또는 9자리 단축코드(srtnCd) — 후자는 `idx_bond_srtn_cd`(partial UNIQUE, `migrations/0002_indexes.sql`)를 태운다. `bond_price` PK가 `(isin_cd, bas_dt, mrkt_ctg)` + `WITHOUT ROWID`라 시계열 조회는 보조 인덱스 없이 PK 레인지 스캔이 된다. 상세 조회는 요청당 D1 쿼리 3~4개(`db.batch`로 `bond`/이력/최신시세를 라운드트립 1회에 묶고, 응답에 실제 등장한 코드만 `code_label`에서 추가 조회)로 예산을 짧게 잡는다.
  로직은 라우트 파일 밖에 둔다 — `src/lib/d1/detail-repo.ts`(조회)·`src/lib/d1/price-repo.ts`의 `fetchBondPriceSeries`·`src/lib/bond/detail.ts`(snake_case 행 → camelCase 응답 변환)·`src/lib/api/params.ts`(ISIN/srtnCd 분기, 날짜·시장 파라미터 검증, JSON 응답 헬퍼)로 나뉜다. 라우트(`[id].ts`/`[id]/prices.ts`)는 이 조각들을 조합만 하는 얇은 껍데기다 — workers vitest 프로젝트가 `wrangler.jsonc`의 `main`을 참조하지 않아(Astro virtual module을 해석 못 함, 아래 "테스트" 절 참고) 라우트 파일 자체는 테스트할 수 없기 때문에, 테스트 가능한 로직을 전부 라우트 밖으로 뺐다.

### MCP 서버

`/mcp`(`src/pages/mcp.ts`)가 채권 데이터를 Claude(웹·데스크톱·모바일 앱 공통, claude.ai 계정의 커스텀 커넥터)에 노출하는 MCP(Model Context Protocol) 엔드포인트다. `@modelcontextprotocol/server`(SDK v2, 2026-07-28 스펙)의 `createMcpHandler`로 구현한 **stateless Streamable HTTP** — Durable Object도 세션도 없다. 팩토리(`createBondMcpServer`, `src/lib/mcp/server.ts`)가 요청마다 새 `McpServer` 인스턴스를 만들어 요청 간 상태가 섞이지 않는다.

- **인증 없음**: 이 데이터는 이미 스크리너 화면·`/api/bond/*`로 공개돼 있어 MCP로 새로 노출되는 정보가 없다. 남용 방지는 기존 `BOND_API_LIMITER`(IP당 분당 30회, `checkRateLimit`)만 라우트 레벨에서 건다.
- **JSON Schema validator를 명시 지정한다.** SDK는 런타임을 감지해 Node는 ajv, workerd/브라우저는 `@cfworker/json-schema`(패키지 자체에 번들돼 있어 별도 설치 불필요)를 자동 선택하지만, Astro/Vite 번들링을 거친 뒤에도 이 감지가 실제 Workers 런타임에서 올바르게 풀리는지는 보장되지 않는다 — ajv는 `new Function`(eval 계열)에 의존해 Workers에서 실패할 수 있다. `src/lib/mcp/server.ts`가 `@modelcontextprotocol/server/validators/cf-worker`의 `CfWorkerJsonSchemaValidator`를 `McpServer` 생성자의 `jsonSchemaValidator` 옵션으로 강제 지정한다 — `tests/workers/mcp-server.test.ts`가 실제 workerd 위에서 이 경로까지 검증한다.
- **툴 3종**(`src/lib/mcp/tools.ts`): `search_bonds`(발행인/종목명/만기/표면이율/KIS 신용등급/발행잔액 필터 — D1을 직접 쿼리하는 유일한 목록 조회 경로, `src/lib/d1/search-repo.ts`), `get_bond`(ISIN/단축코드 상세 — `detail-repo.ts` 재사용), `get_bond_prices`(시세 시계열 — `price-repo.ts` 재사용). `get_bond`/`get_bond_prices`는 새 로직 없이 `/api/bond/*` 라우트가 쓰는 조회·변환 함수를 그대로 재사용한다. 응답 JSON은 `src/lib/mcp/format.ts`가 조립하는데, HTTP 응답(스냅샷·시계열의 컬럼 지향 배열)을 그대로 내보내지 않고 행 객체로 펴서 LLM이 읽기 좋게 만든다.
- **`search_bonds`만 D1을 직접 검색한다.** 스크리너 목록 조회(R2 스냅샷)는 D1 read가 0이지만, `search_bonds`는 서버 측 검색이 필요해 새 쿼리를 추가했다(`buildBondSearchQuery`, `src/lib/d1/sql.ts`). 발행인/종목명 LIKE는 `bond` 테이블(2026-09 기준 29,079행) 전체 스캔이다 — 호출 빈도가 사람 대화 수준이라 감내 가능한 트레이드오프로 의도한 것이며, `limit` 상한(50)을 풀지 말 것.
- 라우트 파일(`src/pages/mcp.ts`)에는 로직을 두지 않는다 — 다른 API 라우트와 같은 이유(workers vitest가 Astro 라우트 파일 자체를 실행할 수 없다, 아래 "테스트" 절 참고)로 라우팅·CORS·rate limit만 담당하고, 툴 정의·D1 조회는 `src/lib/mcp/`·`src/lib/d1/search-repo.ts`에 있다. `tests/workers/mcp-server.test.ts`가 `createMcpHandler(...).fetch(request)`를 라우트 없이 직접 호출해 검증한다 — `responseMode: "auto"`(기본값)가 `tools/call`을 SSE로 응답하는 것을 실측했으므로, 테스트 헬퍼가 일반 JSON과 SSE(`data: {...}` 프레임) 둘 다 파싱한다.
- 로컬 검증: `pnpm dev` 후 `curl -s -X POST http://localhost:4321/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`, 또는 `npx @modelcontextprotocol/inspector@latest`로 붙여 확인한다.

### 디렉터리 구조

```
docs/
  api/            # 오픈API 2종 명세 문서 (src/api/와 1:1 대응)
migrations/       # D1 스키마 마이그레이션
scripts/          # 초기 백필·스냅샷 빌드 CLI (Node ESM, 무의존성)
src/
  api/            # 오픈API 요청/응답 TypeScript 타입·상수 (와이어 포맷 그대로, 로직 없음)
  components/     # React 및 Astro 컴포넌트
    providers/    # QueryProvider 등 React island 내부에서 쓰는 컨텍스트 프로바이더
    ui/           # shadcn/ui 컴포넌트 (자동 생성, 직접 수정 가능)
  hooks/          # React 커스텀 훅 (useScreenerData 등, TanStack Query 기반)
  layouts/        # Astro 레이아웃
  lib/
    openapi/      # 공통 fetch 클라이언트, 오류 분류, 값 정규화
    bond/          # 컬럼 순서 정본, 매핑, 변경 감지 지문, 상세 응답 변환(detail.ts)
    d1/            # D1 바인딩 호출 (쓰기 repo + detail-repo.ts/snapshot-repo.ts/search-repo.ts 등 읽기 repo, meta-repo.ts는 app_meta CRUD), json_each SQL 생성
    api/           # /api/* 라우트 공용 입력 검증·응답 헬퍼 (params.ts)
    sync/          # cron tick 오케스트레이션, 순수 스케줄링 로직
    r2/            # R2 키 네이밍, 아카이브, 시세 델타 스냅샷
    snapshot/      # 스크리너 목록 스냅샷 v2 포맷·인코드·디코드·병합·cron 빌드(build.ts)·bond 델타(bond-delta.ts) (format.ts/encode.ts/index-file.ts는 @/ 별칭 미사용)
    mcp/           # MCP 서버 팩토리(server.ts)·툴 3종 정의(tools.ts)·응답 포맷(format.ts)
    utils.ts       # 범용 유틸리티 (cn 등)
  pages/
    api/          # 서버 API 라우트 (snapshot 프록시, bond/[id] 상세·시계열 등)
    mcp.ts        # MCP(Model Context Protocol) 엔드포인트 — 라우팅·CORS·rate limit만
  worker.ts       # Workers 진입점 (fetch 위임 + scheduled)
```

`src/api/`에 두 API의 요청/응답 TypeScript 타입이, `docs/api/`에 전체 필드 명세 문서가 있다.

## 오픈API 명세

공공데이터포털 금융위원회 채권 오픈API 2종. **전체 필드·파라미터 명세는 [`docs/api/README.md`](./docs/api/README.md), [`docs/api/bond-issu-info.md`](./docs/api/bond-issu-info.md), [`docs/api/bond-price-info.md`](./docs/api/bond-price-info.md)를, 대응 타입은 `src/api/`를 참고.** 여기서는 요약만 다룬다.

정본은 세 곳이며 우선순위는 다음과 같다: ① `openapi.do` 페이지의 Swagger UI(응답 스키마·서비스 URL의 최신 정본, 단 요청 파라미터는 비어 있음) → ② 리포지터리 루트의 `GetBondIssuInfoService_V2.docx`/`GetBondSecuritiesInfoService.docx`(요청 파라미터의 유일한 정본) → ③ 카탈로그 `openapi.json`(`https://www.data.go.kr/catalog/15059592/openapi.json`, `.../15094784/openapi.json`)은 데이터셋 메타데이터일 뿐 파라미터·스키마는 없으므로 참고용으로만 사용.

### 공통 규약

- 인증: 쿼리스트링 `serviceKey` (공공데이터포털에서 발급받은 인증키, Decoded 값을 `URLSearchParams`에 넣을 것 — 이중 인코딩 주의)
- `resultType` 기본값은 **`xml`**. JSON 응답을 원하면 매 요청에 `resultType=json`을 명시해야 한다.
- **API 레벨 오류는 HTTP 200으로 응답한다.** 반드시 `response.header.resultCode === "00"`을 확인할 것. **단 GW 레벨 오류(`serviceKey` 누락·미등록·만료 등)는 HTTP 200이 아니며(401/403 등) `{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{...}}}` 형태의 별도 봉투로 온다** — Swagger·docx 미문서화, 실호출로 확인됨. 타입은 `src/api/common.ts`의 `OpenApiGatewayErrorResponse`, 상세는 `docs/api/README.md`의 "공통 응답 규약" 참고.
- **에러코드는 docx 발행 이후 포털에서 개편되었다.** 현행 코드(`01/04/05/10/12/20×3/22/23/29/30/31`)와 docx의 레거시 코드(`1/10/12/20/22/30/31/32/99`)가 다르므로 반드시 `docs/api/README.md`의 현행 표를 기준으로 판단할 것. 특히 `20`이 서로 다른 메시지 3개에 중복 배정되어 있어 `resultCode`만으로는 분기할 수 없고 `resultMsg`를 함께 봐야 하며, `23`(초당 호출 초과)이 신설되었다.
- 응답 봉투: `response.header{resultCode,resultMsg}` + `response.body{numOfRows,pageNo,totalCount,items.item[]}`. **조회 결과가 0건이면 `items`가 객체가 아니라 빈 문자열(`""`)로 온다.**
- 페이징: `pageNo`, `numOfRows`. 제한: 30 TPS, 개발계정 일 10,000건, 최대 메시지 4000 byte, 평균 응답 500ms
- 데이터 갱신주기: 일 1회, **기준일자 기준 영업일 +1일 오후 1시 이후 반영** (예: 금요일 데이터는 차주 월요일)
- 채권기본정보의 응답 필드는 **전부 문자열**(숫자·날짜 포함)이다. 채권시세정보는 가격·수익률·거래량 계열 11개 필드가 Swagger 스키마상 JSON 기준 `number`로 선언되어 있어 두 API의 숫자 표현 규약이 다르다(`src/api/common.ts`의 `NumericLike` 참고). 빈 값은 `""` 또는 문자열 `"NULL"`로 오므로 파싱 계층에서 정규화가 필요하다.

### ① 채권기본정보 — `GetBondIssuInfoService_V2`

- 베이스 URL: `https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2` (경로에 `/service/` 없음)
- 오퍼레이션: `getBondBasiInfo_V2`
- **필수 조건**: `basDt`(기준일자) / `crno`(법인등록번호) / `isinCd`(ISIN코드) 중 **최소 하나**를 넘겨야 한다. 전부 생략하면 전체 최신 데이터 조회로 빠져 timeout이 발생한다. (docx의 요청 파라미터 표에는 `isinCd`가 누락되어 있으나, 상세기능 설명문과 포털 설명은 모두 이를 포함한다.)
- 선택 파라미터: `basDt`(YYYYMMDD), `crno`(13자리), `isinCd`(12자리), `bondIsurNm`(채권발행인명, 최대 100자)
- 응답 필드 75개 전체는 `docs/api/bond-issu-info.md` 참고. 주요 필드: `isinCd`/`isinCdNm`, `bondIsurNm`(발행인명), `bondIssuDt`/`bondExprDt`(발행일/만기일), `bondSrfcInrt`(표면이율), `bondIntTcd`/`bondIntTcdNm`(이표채/할인채 구분), `intPayCyclCtt`(이자지급주기), `nxtmCopnDt`/`rbfCopnDt`(차기/직전 이표일), `bondIssuAmt`/`bondPymtAmt`/`bondBal`(발행/납입/잔액 금액), `grnDcd`/`grnDcdNm`(보증구분), `bondRnknDcd`/`bondRnknDcdNm`(채권순위), `txtnDcd`/`txtnDcdNm`(과세구분), `optnTcd`/`optnTcdNm`(옵션유형), 신용등급 4종(`kisScrsItmsKcdNm`/`kbpScrsItmsKcdNm`/`niceScrsItmsKcdNm`/`fnScrsItmsKcdNm`)

### ② 채권시세정보 — `GetBondSecuritiesInfoService`

- 베이스 URL: `https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService` (경로에 `/service/` **있음** — ①과의 가장 흔한 실수 지점)
- 오퍼레이션: `getBondPriceInfo`
- 필수 파라미터 없음 (`serviceKey` 제외 모든 조회 파라미터가 옵션)
- 필터 접두사 규약: `begin*`(≥), `end*`(<), `like*`(포함), 접두사 없음(정확히 일치). **접두사 조합은 필드마다 다르다** — 임의로 일반화하지 말고 실재하는 20개 파라미터만 사용할 것(전체 목록은 `docs/api/bond-price-info.md`). 예: `srtnCd`는 `likeSrtnCd`만 존재(정확일치 없음), `mrktCtg`는 정확일치만 존재(`begin`/`end`/`like` 없음), `basDt`만 4종 접두사 전부 지원.
- `mrktCtg`(시장구분) 값: `KTS`(국채전문유통시장) / `일반채권` / `소액채권`
- 주요 응답 필드: `basDt`, `srtnCd`(9자리 단축코드), `isinCd`, `itmsNm`(종목명), `mrktCtg`, `clprPrc`/`clprVs`/`clprBnfRt`(종가·전일대비·수익률), `mkpPrc`/`mkpBnfRt`(시가), `hiprPrc`/`hiprBnfRt`(고가), `loprPrc`/`loprBnfRt`(저가), `trqu`(거래량), `trPrc`(거래대금)
- `xpYrCnt`(만기년수), `itmsCtg`(지표/경과)는 **KTS 시장에서만** 채워진다.

### 라이선스 (공공누리)

- **채권기본정보**: 공공누리 제2유형 — 출처표시 + **상업적 이용금지**. 상업적으로 활용하려면 데이터 원천 소유자인 한국예탁결제원(KSD)과 별도 정보이용계약이 필요 (portal@ksd.or.kr).
- **채권시세정보**: 이용허락범위 제한 없음.
- 서비스를 공개/수익화할 경우 기본정보 쪽 라이선스 제약을 먼저 확인할 것.

## Conventions

- 패키지 매니저: **pnpm** 전용 (npm/yarn 사용 금지)
- TypeScript strict 모드 적용 (`tsconfig.json`)
- 포매팅은 **Prettier**로 관리. `.prettierignore`에 `*.md`가 포함되어 있어 마크다운 문서는 Prettier 대상이 아니다.
- shadcn/ui 컴포넌트 추가: `pnpm dlx shadcn@latest add <component>`
- 테스트 파일: `tests/` 디렉터리 (`src/` 내부 아님)
- Tailwind v4: `@tailwindcss/vite` Vite 플러그인 방식 (PostCSS 아님)
- Node 버전 고정: `.node-version` 24.18.0 (`engines`: `^22.12.0 || ^24.11.0`)
- `.mcp.json`에 Cloudflare Docs, Astro Docs, Playwright MCP 서버가 등록되어 있다.
