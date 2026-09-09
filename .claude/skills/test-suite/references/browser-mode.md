# Vitest Browser Mode (browser 프로젝트)

`vitest.browser.config.ts`, 대상은 `tests/components/**`·`tests/hooks/**`. jsdom이 아니라 **실제 브라우저**(Playwright provider, chromium/firefox/webkit)에서 돈다.

## jsdom을 쓰지 않는 이유

- `@base-ui/react` 팝오버가 `Element.getAnimations()`/`ResizeObserver`/pointer capture를 요구해 jsdom에선 폴리필해도 불안정하다.
- `PriceChart`(lightweight-charts)가 canvas 2D context를 요구한다.
- `useIsMobile`이 `matchMedia`를 실제로 평가해야 한다.

`vitest.node.config.ts`와 동일하게 astro의 `getViteConfig()`를 경유하므로 `@/` 별칭·Tailwind가 그대로 따라온다.

## 함정

- **파일 여러 개가 동시에 `Failed to import test file ... SyntaxError`로 죽으면 소스 탓이 아니다.** Vite가 의존성 사전번들(`node_modules/.vite/vitest/<sha1("browser")>/deps`)을 다시 만드는 동안 브라우저가 테스트 파일을 import하면 그 순간 진행 중이던 파일들만 깨진다. `vitest.browser.config.ts`의 `optimizeDeps.noDiscovery`/`include`가 이를 막고 있으니 지우지 말 것 — 새 런타임 의존성을 쓰는 테스트를 추가하면 `include`에도 추가한다. 배경은 AGENTS.md "알려진 이슈".
- **`render`/`renderHook`은 async다** — `vitest-browser-react`의 것이며 `await`를 빠뜨리면 `screen.getByText is not a function` 같은 알기 어려운 에러가 난다.
- **자동 cleanup은 메인 엔트리(`vitest-browser-react`, `/pure` 아님)가 제공한다.** 단 `useScreenerViewState`처럼 `window.history`/`sessionStorage`를 직접 건드리는 훅은 자동 cleanup 대상이 아니라, `tests/setup-browser.ts`의 `afterEach`가 매 테스트 후 원래 URL로 `replaceState`하고 `sessionStorage.clear()`한다(안 하면 훅 테스트끼리 서로의 URL·스토리지를 오염시킨다).
- **Base UI 팝오버는 Portal로 body 직속에 렌더된다.** 필터 팝오버 텍스트가 표 셀(등급 Badge 등)과 겹쳐 전역 쿼리가 모호해지면 `document.querySelector('[data-slot="popover-content"]')`로 스코프를 좁힐 것(Vitest: `page.elementLocator(...)`, Playwright: `page.locator(...)`).
- **`useTable` 하네스에 `autoResetPageIndex: false`를 반드시 넣을 것.** `screenerFeatures`로 직접 하네스를 만들 때 이걸 빠뜨리면 TanStack Table이 매 상태 변경마다 pageIndex를 0으로 되돌려 페이지 이동 자체가 무력화된다(`BondScreener.tsx`가 프로덕션에서 이 옵션을 켜는 이유와 동일).
- **쿼리는 기본이 부분일치다.** `exact: true`를 안 주면 "금액" 섹션 제목이 "채권발행금액" 같은 라벨에도 매치해 모호해진다(실제로 여러 번 겪음).
- **`window.location`은 가로챌 수 없다.** 실제 브라우저에서 `location`(Window 소유)·`href`(Location 소유) 둘 다 own accessor property이자 `configurable:false`라 jsdom과 달리 `defineProperty`로 스텁할 방법이 없다(세 브라우저 전부 실측 확인) — 클릭 시 실제 네비게이션이 일어나는지는 컴포넌트 테스트가 아니라 Playwright E2E로 검증할 것.
