import { describe, expect, test } from "vitest";
import { mergePriceDeltas, type PriceDeltaPayload } from "@/lib/snapshot/merge";
import { ymdToEpochDay, type SnapshotPayload } from "@/lib/snapshot/format";

function makeBase(): SnapshotPayload {
  return {
    v: 2,
    basDt: 20260825,
    priceBasDt: 20260820,
    columns: [],
    issuers: [],
    codeLabels: {},
    cols: [],
    priceColumns: ["bas_dt", "mrkt_ctg", "clpr_prc", "clpr_vs", "clpr_bnf_rt", "trqu"],
    // KR_A는 이미 base에 시세가 있는 종목, KR_B는 base 시점엔 없다가 델타로 처음 등장.
    priceIsinCds: ["KR_A"],
    priceCols: [
      [ymdToEpochDay(20260820)], // bas_dt
      [2], // mrkt_ctg = 일반채권
      [10000], // clpr_prc
      [0], // clpr_vs
      [3.5], // clpr_bnf_rt
      [1000], // trqu
    ],
  };
}

function delta(basDt: number, rows: PriceDeltaPayload["rows"]): PriceDeltaPayload {
  return { basDt, columns: ["isinCd", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt", "trqu"], rows };
}

describe("mergePriceDeltas", () => {
  test("델타가 없으면 base를 그대로 반환한다", () => {
    const base = makeBase();
    expect(mergePriceDeltas(base, [])).toBe(base);
  });

  test("기존 종목의 시세를 델타 값으로 덮어쓴다", () => {
    const base = makeBase();
    const merged = mergePriceDeltas(base, [delta(20260821, [["KR_A", "일반채권", 10100, 100, 3.4, 2000]])]);
    const idx = merged.priceIsinCds.indexOf("KR_A");
    expect(merged.priceCols[merged.priceColumns.indexOf("clpr_prc")][idx]).toBe(10100);
    expect(merged.priceCols[merged.priceColumns.indexOf("bas_dt")][idx]).toBe(ymdToEpochDay(20260821));
  });

  test("델타에만 있는 신규 거래 종목이 추가된다", () => {
    const base = makeBase();
    const merged = mergePriceDeltas(base, [delta(20260821, [["KR_B", "KTS", 8000, -10, 4.1, 500]])]);
    expect(merged.priceIsinCds).toContain("KR_B");
    const idx = merged.priceIsinCds.indexOf("KR_B");
    expect(merged.priceCols[merged.priceColumns.indexOf("clpr_prc")][idx]).toBe(8000);
    expect(merged.priceCols[merged.priceColumns.indexOf("mrkt_ctg")][idx]).toBe(1); // KTS -> 1
  });

  test("여러 날짜 델타를 뒤섞어 넣어도 basDt 오름차순으로 적용돼 최신 값이 남는다", () => {
    const base = makeBase();
    const merged = mergePriceDeltas(base, [
      delta(20260823, [["KR_A", "일반채권", 30000, 3, 3.0, 300]]), // 가장 최신
      delta(20260821, [["KR_A", "일반채권", 10100, 1, 3.4, 100]]),
      delta(20260822, [["KR_A", "일반채권", 20000, 2, 3.2, 200]]),
    ]);
    const idx = merged.priceIsinCds.indexOf("KR_A");
    expect(merged.priceCols[merged.priceColumns.indexOf("clpr_prc")][idx]).toBe(30000);
    expect(merged.priceBasDt).toBe(20260823);
  });

  test("이미 반영된 것보다 오래된 델타는 무시되고 priceBasDt도 갱신되지 않는다", () => {
    const base = makeBase();
    // base의 KR_A는 이미 20260820 시세를 갖고 있다 — 그보다 오래된 델타(20260819)는 무시돼야 한다.
    const merged = mergePriceDeltas(base, [delta(20260819, [["KR_A", "일반채권", 999, 999, 9.9, 9]])]);
    const idx = merged.priceIsinCds.indexOf("KR_A");
    expect(merged.priceCols[merged.priceColumns.indexOf("clpr_prc")][idx]).toBe(10000); // 원래 base 값 그대로
    expect(merged.priceBasDt).toBe(20260820); // base 그대로, 오래된 델타로 앞당겨지지 않음
  });

  test("base 배열을 변형하지 않는다(얕은 복사)", () => {
    const base = makeBase();
    const originalCols = base.priceCols.map((c) => [...c]);
    mergePriceDeltas(base, [delta(20260821, [["KR_A", "일반채권", 10100, 100, 3.4, 2000]])]);
    expect(base.priceCols).toEqual(originalCols);
  });

  test("전일대비 0(보합)은 델타에서도 null과 구분된다", () => {
    const base = makeBase();
    const merged = mergePriceDeltas(base, [delta(20260821, [["KR_B", "소액채권", 9500, 0, 5.0, 10]])]);
    const idx = merged.priceIsinCds.indexOf("KR_B");
    expect(merged.priceCols[merged.priceColumns.indexOf("clpr_vs")][idx]).toBe(0);
  });
});
