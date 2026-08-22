import { describe, expect, test } from "vitest";
import { rawArchiveKey, snapshotBondKey, snapshotPriceDeltaKey, SNAPSHOT_INDEX_KEY } from "@/lib/r2/keys";

describe("R2 키 네이밍", () => {
  test("원본 아카이브 키는 YYYY/MM/DD 계층 + 4자리 zero-pad 페이지 번호", () => {
    expect(rawArchiveKey("issu", 20260820, 1)).toBe("raw/issu/2026/08/20/p0001.json");
    expect(rawArchiveKey("price", 20260820, 12)).toBe("raw/price/2026/08/20/p0012.json");
  });

  test("기준 스냅샷 키", () => {
    expect(snapshotBondKey(20260820)).toBe("snapshot/bond/20260820.json.gz");
  });

  test("일일 델타 키", () => {
    expect(snapshotPriceDeltaKey(20260820)).toBe("snapshot/price/20260820.json");
  });

  test("인덱스 키는 고정", () => {
    expect(SNAPSHOT_INDEX_KEY).toBe("snapshot/index.json");
  });
});
