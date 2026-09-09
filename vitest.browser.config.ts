import { getViteConfig } from "astro/config";
import { playwright } from "@vitest/browser-playwright";

// DOM이 필요한 컴포넌트·훅 테스트(tests/components/**, tests/hooks/**) 전용. jsdom이 아니라
// 실제 브라우저(Playwright provider)에서 돈다 — @base-ui/react 팝오버가 Element.getAnimations()·
// ResizeObserver·pointer capture를 요구하고, PriceChart(lightweight-charts)가 canvas를 요구하며,
// useIsMobile이 matchMedia를 실제로 평가해야 하기 때문이다. jsdom은 셋 다 폴리필해도 불안정하거나
// 아예 불가능하다 — AGENTS.md "테스트" 절 참고.
//
// vitest.node.config.ts와 동일하게 astro의 getViteConfig()를 경유한다 — astro.config.mjs가
// integrations: [react()]와 vite.plugins: [tailwindcss()]를 이미 등록하므로 JSX 변환·@/ 별칭·
// Tailwind가 그대로 따라온다. isVitest 분기 덕에 cloudflare 어댑터는 비활성이라
// vitest.workers.config.ts가 겪는 환경 충돌과 무관하다.
export default getViteConfig({
  // **이 optimizeDeps 블록을 지우지 말 것** — 실행 도중 의존성 사전번들이 다시 만들어지면서
  // 그때 import 중이던 테스트 파일이 무작위로 깨지는 유령 실패를 막는다(AGENTS.md "알려진 이슈").
  // noDiscovery: true(+비어 있지 않은 include)면 Vite가 기본 createDepsOptimizer 대신
  // createExplicitDepsOptimizer를 쓰는데, 그 init()은 번들과 commit()까지 await한다. 이 init()은
  // EnvironmentInstance.listen()이 await하고 @vitest/browser는 await vite.listen() 뒤에야 브라우저를
  // 띄우므로, 사전번들이 끝난 뒤에 테스트 import가 시작된다 — 경합 구간 자체가 사라진다.
  // (기본 optimizer의 init()은 스캔 프라미스만 걸고 바로 반환해서 listen 이후에도 번들이 계속 돈다.)
  // 대신 여기 빠진 의존성은 사전번들 없이 소스로 로드되므로(느려질 뿐 실패는 아님), 새 런타임
  // 의존성을 쓰는 테스트를 추가하면 여기에도 추가할 것. 반대로 해석되지 않는 이름을 적으면
  // "Failed to resolve dependency: <name>, present in client 'optimizeDeps.include'"가 뜬다 —
  // 프로젝트의 직접 의존성만 적을 것(예: expect-type은 vitest의 전이 의존성이라 여기 쓰면 안 된다).
  //
  // astro(@astrojs/react/client.js·dev-toolbar)와 vitest(chai·magic-string·expect-type)가
  // 각자 include를 덧붙이므로 여기에는 앱이 실제로 쓰는 것만 적는다.
  optimizeDeps: {
    noDiscovery: true,
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/collapsible",
      "@base-ui/react/input",
      "@base-ui/react/merge-props",
      "@base-ui/react/popover",
      "@base-ui/react/separator",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
      "@base-ui/react/use-render",
      "@phosphor-icons/react",
      "class-variance-authority",
      "clsx",
      "lightweight-charts",
      "tailwind-merge",
      "vitest-browser-react",
    ],
  },

  test: {
    name: "browser",
    include: ["tests/components/**/*.test.tsx", "tests/hooks/**/*.test.ts"],
    setupFiles: ["./tests/setup-browser.ts"],
    browser: {
      enabled: true,
      headless: true, // pre-push(pnpm test --run)에서 브라우저 창이 뜨지 않도록 명시.
      provider: playwright(),
      // https://vitest.dev/config/browser/playwright
      instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
    },
  },
});
