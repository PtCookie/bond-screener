# workers 프로젝트 (D1/R2 바인딩)

`vitest.workers.config.ts`, 대상은 `tests/workers/**`. `@cloudflare/vitest-plugin`의 `cloudflareTest()`로 **실제 workerd 런타임** 위에서 돈다.

## 패키지 API (옛 문서를 따라 하지 말 것)

- 패키지명이 `@cloudflare/vitest-pool-workers` → **`@cloudflare/vitest-plugin`**으로 개명됐다(v1, 2026-08-19).
- `defineWorkersConfig`/`defineWorkersProject`도 **제거**됐다 — `cloudflareTest()` Vite 플러그인을 일반 `defineConfig`에 넣는 방식이다.
- `readD1Migrations`/`cloudflareTest`는 설치된 버전(1.1.x) 기준 **메인 엔트리에서 바로 export**되며 `/config` 서브패스는 없다(공식 문서가 이 서브패스를 언급하지만 실제 `package.json`의 `exports`에는 없음 — 실측 확인).

## 스토리지 격리는 테스트 파일 단위다

같은 파일의 여러 `test()`는 상태를 공유한다. `test()` 단위 격리가 필요하면 `tests/workers/helpers/reset-d1.ts`의 `resetD1()`(`cloudflare:test`의 `reset()` + `applyD1Migrations` 재적용)을 `beforeEach`에 둘 것.

## 바인딩을 고장내는 스파이

`vi.spyOn(env.DB, ...)`/`vi.spyOn(env.ARCHIVE, ...)`로 실패 경로를 테스트할 때:

1. **`startSyncRun` 같은 준비 호출이 끝난 뒤에 스파이를 걸 것.** 먼저 걸면 준비 단계 자체의 D1 호출까지 스텁 카운트를 먹어 정작 의도한 호출에서 안 터진다.
2. **`afterEach`에 `vi.restoreAllMocks()`를 둘 것.** 테스트 안의 개별 `mockRestore()`는 그 앞 assert가 실패하면 실행되지 않아 스파이가 다음 테스트로 샌다.

## legacy

`tests/helpers/fake-d1.ts`(`node:sqlite` 기반)는 legacy다 — `tests/d1-integration.test.ts`가 아직 쓰고 있어 당장 지우지는 않지만, **새 D1 테스트는 workers 프로젝트에 실제 바인딩으로 작성할 것.**
