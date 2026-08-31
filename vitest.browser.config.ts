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
