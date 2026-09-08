---
name: test-suite
description: 이 저장소의 테스트(Vitest node/browser/workers 3-프로젝트 + Playwright E2E)를 작성·수정하거나, 테스트가 원인이 불분명하게 실패할 때의 규약과 함정. 테스트 파일을 새로 만들기 전에, 또는 실패 원인이 소스 코드가 아닌 것 같을 때 사용.
---

# test-suite

테스트 파일은 항상 `tests/`(또는 E2E는 `e2e/`)에 둔다 — `src/` 안에 두지 않는다.

## 어느 프로젝트에 둘 것인가

vitest는 `test.projects`로 **세 프로젝트**를 돈다(`vitest.config.ts`가 오케스트레이터, 실제 설정은 `vitest.node.config.ts`/`vitest.browser.config.ts`/`vitest.workers.config.ts`).

| 대상 | 프로젝트 | 위치 | 비고 |
|---|---|---|---|
| 바인딩 불필요한 순수 로직 | **node** | `tests/*.test.ts`, `tests/scripts/**` | astro `getViteConfig()` 경유 |
| React 컴포넌트·훅(DOM 필요) | **browser** | `tests/components/**`, `tests/hooks/**` | Vitest Browser Mode(실제 브라우저, jsdom 아님) → [references/browser-mode.md](references/browser-mode.md) |
| D1/R2 바인딩 필요 | **workers** | `tests/workers/**` | 실제 workerd 런타임 → [references/workers.md](references/workers.md) |
| 사용자 플로우 | Playwright E2E | `e2e/**` | → [references/e2e.md](references/e2e.md) |

`astro.config.mjs`의 `isVitest` 분기(AGENTS.md "알려진 이슈" 참고) 때문에 astro 어댑터 경유로는 Cloudflare 런타임을 못 쓰지만, `@cloudflare/vitest-plugin`은 이 충돌과 무관하게 독립적으로 workerd를 띄우므로 실제 D1/R2 바인딩 테스트가 가능하다.

## 실행

```
pnpm test --run                      # 전체 1회 (CI/pre-push 훅과 동일)
pnpm test --project=browser --run    # Browser Mode만
pnpm test <file>                     # 특정 파일
pnpm test:e2e                        # Playwright (webServer가 pnpm dev를 자동으로 띄움)
```

**이 세션(Claude Code)에서는 반드시 `pnpm test ...` 형태로 호출할 것.** `.claude/settings.json`의 `sandbox.excludedCommands`가 `"pnpm test *"` 문자열 그대로만 매칭해 샌드박스를 벗어나는데, `pnpm exec vitest ...`는 매칭되지 않아 샌드박스 안에서 크로미움이 `bootstrap_check_in ... Permission denied`로 죽는다(실측 확인). 또한 `pnpm test -- --project=browser`처럼 pnpm 자체의 `--`를 끼워 넣으면 그 `--`가 vitest에 그대로 전달돼 옵션 파싱이 깨진다(전체 프로젝트가 도는 것처럼 보임) — `--` 없이 직접 붙일 것.

## 설정에서 지우면 안 되는 것

- **`vitest.node.config.ts`의 `exclude`에서 `e2e/**`를 빼지 말 것.** node 프로젝트의 기본 include(`**/*.{test,spec}.*`)가 제외 없이는 `e2e/*.spec.ts`(Playwright 전용 `test()`)까지 수집해 `Error: Playwright Test did not expect test() to be called here`로 전체가 실패한다(Playwright 도입 시 실제로 겪음).
- **`.claude/**`를 Vite/Vitest 감시·수집 대상에서 빼는 설정을 지우지 말 것** — 다른 세션이 만드는 worktree 사본이 테스트를 무작위로 깨뜨린다. 상세는 AGENTS.md "알려진 이슈".

## 실패가 소스 코드 탓이 아닐 때

재실행하면 사라지는 무작위 구문 오류(`Failed to import test file ... SyntaxError`)는 `.claude/worktrees/` 관련 유령 실패다(AGENTS.md "알려진 이슈"). 그 외에는 위 표의 참고 파일에서 해당 프로젝트의 함정 목록을 먼저 확인한다.
