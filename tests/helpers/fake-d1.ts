/**
 * `node:sqlite`(Node 24.18.0 내장) 위에 `D1Database`를 흉내내는 최소 어댑터.
 *
 * vitest는 `astro.config.mjs`의 `isVitest` 분기 때문에 Cloudflare 런타임(workerd)이 없어
 * D1 바인딩을 직접 테스트할 수 없다(AGENTS.md "알려진 이슈" 참고). 이 어댑터로
 * `src/lib/d1/*-repo.ts`를 수정 없이 실제 SQLite 위에서 검증한다.
 *
 * 한계: node:sqlite와 D1의 SQLite 버전이 다를 수 있다. 표준 SQL/JSON1 함수만 쓰므로
 * 실무상 문제없지만, D1 고유 동작(rows_written 계측, 자동 read 재시도, 쿼리 크기 상한)은
 * 여기서 검증되지 않는다 — 그런 것은 배포 후 `wrangler tail`로 실측해야 한다.
 */
import { DatabaseSync } from "node:sqlite";

class FakeD1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly boundValues: unknown[] = [],
  ) {}

  bind(...values: unknown[]): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this.db, this.sql, values);
  }

  async run<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true }> {
    const stmt = this.db.prepare(this.sql);
    stmt.run(...(this.boundValues as never[]));
    return { results: [], success: true };
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true }> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.boundValues as never[])) as T[];
    return { results: rows, success: true };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.boundValues as never[])) as T | undefined;
    return row ?? null;
  }
}

export interface FakeD1 {
  prepare(sql: string): FakeD1PreparedStatement;
  batch(statements: FakeD1PreparedStatement[]): Promise<{ results: unknown[]; success: true }[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  raw(): never;
  /** 테스트에서 직접 조회할 때 쓰는 탈출구. */
  readonly _sqlite: DatabaseSync;
}

export function createFakeD1(ddlSql: string): FakeD1 {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(ddlSql);

  return {
    prepare(sql: string) {
      return new FakeD1PreparedStatement(sqlite, sql);
    },
    async batch(statements: FakeD1PreparedStatement[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    raw() {
      throw new Error("not implemented");
    },
    _sqlite: sqlite,
  };
}
