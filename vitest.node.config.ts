import { getViteConfig } from "astro/config";
import { defaultExclude } from "vitest/config";

// 바인딩(D1/R2)이 필요 없는 순수 로직 테스트. `node:sqlite`/`node:fs`를 그대로 쓰는
// 기존 tests/*.test.ts가 여기서 돈다. 바인딩이 필요한 테스트는 vitest.workers.config.ts
// (실제 workerd 런타임, tests/workers/**)로, DOM이 필요한 컴포넌트·훅 테스트는
// vitest.browser.config.ts(Browser Mode, tests/components/**·tests/hooks/**)로 분리했다
// — AGENTS.md "테스트" 절 참고.
//
// e2e/**는 반드시 제외해야 한다 — 기본 include가 "**/*.{test,spec}.*"라 제외하지 않으면
// Playwright 전용 e2e/*.spec.ts까지 여기서 수집돼 "Playwright Test did not expect test()
// to be called here"로 전체가 실패한다(실제로 겪은 문제).
export default getViteConfig({
  test: {
    name: "node",
    exclude: [
      ...defaultExclude,
      "tests/workers/**",
      "tests/components/**",
      "tests/hooks/**",
      "e2e/**",
      // .claude/worktrees/<name>/ 는 프로젝트 루트 **안에** 만들어지는 git worktree(저장소 전체
      // 사본)다. .git/info/exclude로 git-ignore돼 있지만 vitest는 그 파일을 읽지 않으므로,
      // 제외하지 않으면 이 프로젝트의 기본 include(**/*.{test,spec}.*)가 worktree 사본의
      // tests/**까지 통째로 수집한다 — browser 전용 테스트가 forks 풀로 끌려 들어가
      // "vitest/browser can be imported only inside the Browser Mode"로 무더기 실패한다.
      ".claude/**",
    ],
  },
});
