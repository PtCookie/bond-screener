/**
 * `@cloudflare/vitest-plugin`의 스토리지 격리는 **테스트 파일 단위**다(같은 파일 안의
 * 여러 `test()`는 상태를 공유한다 — Cloudflare 공식 문서 "Known Issues"의 명시 사항).
 * `test()` 단위 격리가 필요한 파일은 `beforeEach(resetD1)`로 매번 초기화한다.
 *
 * `reset()`은 첨부된 모든 바인딩(D1 포함)의 데이터를 지우므로 `d1_migrations` 테이블도
 * 함께 사라진다 — 그래서 매번 마이그레이션을 재적용한다.
 */
import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";

export async function resetD1(): Promise<void> {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}
