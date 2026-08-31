/**
 * `scripts/lib/wrangler-config.mjs` — JSONC(주석·trailing comma 허용) 파서. 파일 경로가
 * `PROJECT_ROOT`에 고정돼 있어(파라미터화되지 않음) 실제 저장소의 `wrangler.jsonc`를
 * 대상으로 검증한다 — 이 파일 자체가 라인 주석과 trailing comma를 실제로 포함하고 있어
 * (실측 확인) 목(mock) 없이도 파서의 두 핵심 동작을 그대로 검증할 수 있다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROJECT_ROOT } from "../../scripts/lib/env.mjs";
import {
  readDatabaseName,
  readBucketName,
  readWranglerConfig,
  WRANGLER_ENV,
} from "../../scripts/lib/wrangler-config.mjs";

describe("readWranglerConfig", () => {
  test("실제 wrangler.jsonc가 라인 주석/trailing comma를 포함하는데도 파싱된다", () => {
    const raw = readFileSync(`${PROJECT_ROOT}/wrangler.jsonc`, "utf8");
    // 이 전제가 깨지면(파일에서 주석/trailing comma가 사라지면) 이 테스트가 실제로
    // 무엇을 검증하는지 불분명해지므로 먼저 확인한다.
    expect(raw).toMatch(/\/\//);
    expect(() => readWranglerConfig()).not.toThrow();
  });

  test("파싱 결과에 name 필드가 있다", () => {
    const config = readWranglerConfig() as { name?: string };
    expect(typeof config.name).toBe("string");
  });
});

describe("readDatabaseName / readBucketName", () => {
  test("d1_databases[0].database_name을 읽는다", () => {
    expect(readDatabaseName()).toBe("bond-screener");
  });

  test("r2_buckets[0].bucket_name을 읽는다", () => {
    expect(readBucketName()).toBe("bond-screener-archive");
  });
});

describe("WRANGLER_ENV", () => {
  test("WRANGLER_SEND_METRICS를 false로 강제한다(샌드박스 텔레메트리 회피)", () => {
    expect(WRANGLER_ENV.WRANGLER_SEND_METRICS).toBe("false");
  });

  test("나머지는 process.env를 그대로 물려받는다", () => {
    // worker-configuration.d.ts가 NodeJS.ProcessEnv를 BOND_API_SERVICE_KEY 하나로 좁혀
    // 둬서(Cloudflare 타입 생성물) 임의 키(PATH 등)에 타입 안전하게 접근할 수 없다 —
    // Record로 캐스팅해 런타임 값만 비교한다.
    const env = WRANGLER_ENV as Record<string, string | undefined>;
    expect(env.PATH).toBe(process.env.PATH);
  });
});
