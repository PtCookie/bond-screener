/**
 * `vitest.workers.config.ts`가 `TEST_MIGRATIONS` 바인딩에 실어 둔 D1 마이그레이션을
 * 각 테스트 파일(격리된 workerd 인스턴스)마다 적용한다. `migrations/` 전체를 읽으므로
 * `0002_indexes.sql`까지 반영된다 — `idx_bond_srtn_cd`(partial UNIQUE) 위반이 새로
 * 드러나면 fidelity가 올라간 것이지 결함이 아니다.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
