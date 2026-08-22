// wrangler.jsonc(JSONC — 주석·trailing comma 허용) 파싱. backfill.mjs/build-snapshot.mjs가 공유.
import { readFileSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./env.mjs";

const WRANGLER_CONFIG = path.join(PROJECT_ROOT, "wrangler.jsonc");

export function readWranglerConfig() {
  const raw = readFileSync(WRANGLER_CONFIG, "utf8")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "")) // 라인 주석 제거(문자열 안 "//"는 이 설정에 없음)
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1"); // trailing comma 제거
  return JSON.parse(raw);
}

export function readDatabaseName() {
  const config = readWranglerConfig();
  return config.d1_databases?.[0]?.database_name ?? config.name;
}

export function readBucketName() {
  return readWranglerConfig().r2_buckets?.[0]?.bucket_name;
}
