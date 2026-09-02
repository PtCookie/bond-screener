import { describe, expect, test } from "vitest";
import { mergeBondDeltas, mergePriceDeltas, type PriceDeltaPayload } from "@/lib/snapshot/merge";
import { SNAPSHOT_BOND_COLUMNS, ymdToEpochDay, type SnapshotPayload } from "@/lib/snapshot/format";
import type { BondDeltaPayload } from "@/lib/snapshot/bond-delta";

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

function makeBondBase(): SnapshotPayload {
  return {
    v: 2,
    basDt: 20260818,
    priceBasDt: null,
    columns: SNAPSHOT_BOND_COLUMNS,
    // 인덱스 0=KIS은행, 1=한국전력공사. KR_A는 0을 참조.
    issuers: ["KIS은행", "한국전력공사"],
    codeLabels: { scrsItmsKcd: { "10": "AAA" } },
    cols: [
      ["KR_A", "KR_B"], // isin_cd
      ["KR_A_이름", "KR_B_이름"], // isin_cd_nm
      [0, 1], // bond_isur_nm (사전 인덱스)
      ["10", "20"], // scrs_itms_kcd
      [ymdToEpochDay(20250101), ymdToEpochDay(20240101)], // bond_issu_dt
      [ymdToEpochDay(20300101), ymdToEpochDay(20290101)], // bond_expr_dt
      [3.5, 4.0], // bond_srfc_inrt
      ["1", "2"], // bond_int_tcd
      [1_000_000, 2_000_000], // bond_bal
      ["AAA", "AA+"], // kis_grade
    ],
    priceColumns: ["bas_dt", "mrkt_ctg", "clpr_prc", "clpr_vs", "clpr_bnf_rt", "trqu"],
    priceIsinCds: [],
    priceCols: [[], [], [], [], [], []],
  };
}

function bondDelta(
  basDt: number,
  rows: BondDeltaPayload["rows"],
  codeLabels: BondDeltaPayload["codeLabels"] = {},
): BondDeltaPayload {
  return { basDt, columns: SNAPSHOT_BOND_COLUMNS, rows, codeLabels };
}

describe("mergeBondDeltas", () => {
  test("델타가 없으면 base를 그대로 반환한다", () => {
    const base = makeBondBase();
    expect(mergeBondDeltas(base, [])).toBe(base);
  });

  test("기존 종목의 정적 필드를 델타 값으로 덮어쓴다(등급 변경)", () => {
    const base = makeBondBase();
    const merged = mergeBondDeltas(base, [
      bondDelta(20260819, [
        [
          "KR_A",
          "KR_A_이름",
          "KIS은행",
          "10",
          ymdToEpochDay(20250101),
          ymdToEpochDay(20300101),
          3.5,
          "1",
          1_000_000,
          "AA+",
        ],
      ]),
    ]);
    const idx = merged.cols[SNAPSHOT_BOND_COLUMNS.indexOf("isin_cd")].indexOf("KR_A");
    expect(merged.cols[SNAPSHOT_BOND_COLUMNS.indexOf("kis_grade")][idx]).toBe("AA+");
    expect(merged.basDt).toBe(20260819);
  });

  test("델타에만 있는 신규 상장 종목이 추가되고, 신규 발행인이 issuers 사전에 인턴된다", () => {
    const base = makeBondBase();
    const merged = mergeBondDeltas(base, [
      bondDelta(20260819, [
        [
          "KR_C",
          "KR_C_이름",
          "신규발행인",
          "30",
          ymdToEpochDay(20260819),
          ymdToEpochDay(20310101),
          5.0,
          "1",
          500_000,
          "A",
        ],
      ]),
    ]);
    const isinCol = merged.cols[SNAPSHOT_BOND_COLUMNS.indexOf("isin_cd")];
    expect(isinCol).toContain("KR_C");
    const idx = isinCol.indexOf("KR_C");
    const issuerRef = merged.cols[SNAPSHOT_BOND_COLUMNS.indexOf("bond_isur_nm")][idx] as number;
    expect(merged.issuers[issuerRef]).toBe("신규발행인");
    // 기존 발행인 사전은 그대로 유지된 채 새 항목만 append됐다.
    expect(merged.issuers.slice(0, 2)).toEqual(["KIS은행", "한국전력공사"]);
  });

  test("codeLabels는 가장 최신 델타 것으로 통째로 교체된다", () => {
    const base = makeBondBase();
    const merged = mergeBondDeltas(base, [bondDelta(20260819, [], { scrsItmsKcd: { "10": "AAA", "99": "신규코드" } })]);
    expect(merged.codeLabels).toEqual({ scrsItmsKcd: { "10": "AAA", "99": "신규코드" } });
  });

  test("base 배열을 변형하지 않는다(얕은 복사)", () => {
    const base = makeBondBase();
    const originalCols = base.cols.map((c) => [...c]);
    const originalIssuers = [...base.issuers];
    mergeBondDeltas(base, [
      bondDelta(20260819, [
        [
          "KR_A",
          "KR_A_이름",
          "KIS은행",
          "10",
          ymdToEpochDay(20250101),
          ymdToEpochDay(20300101),
          3.5,
          "1",
          1_000_000,
          "AA+",
        ],
      ]),
    ]);
    expect(base.cols).toEqual(originalCols);
    expect(base.issuers).toEqual(originalIssuers);
  });

  test("bond 델타를 price 델타보다 먼저 병합하면, 그날 신규 상장된 종목에 같은 날 시세가 붙는다", () => {
    const base = makeBondBase();
    const bondMerged = mergeBondDeltas(base, [
      bondDelta(20260819, [
        [
          "KR_C",
          "KR_C_이름",
          "신규발행인",
          "30",
          ymdToEpochDay(20260819),
          ymdToEpochDay(20310101),
          5.0,
          "1",
          500_000,
          "A",
        ],
      ]),
    ]);
    const priceMerged = mergePriceDeltas(bondMerged, [
      {
        basDt: 20260819,
        columns: ["isinCd", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt", "trqu"],
        rows: [["KR_C", "일반채권", 9800, 5, 4.2, 100]],
      },
    ]);
    expect(priceMerged.priceIsinCds).toContain("KR_C");
    const idx = priceMerged.priceIsinCds.indexOf("KR_C");
    expect(priceMerged.priceCols[priceMerged.priceColumns.indexOf("clpr_prc")][idx]).toBe(9800);
  });
});
