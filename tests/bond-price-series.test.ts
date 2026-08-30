import { describe, expect, test } from "vitest";
import { decodePriceSeries, presetToRange, type PricePoint } from "@/lib/bond/price-series";

const COLUMNS = ["basDt", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt"] as const;

function row(basDt: number, mrktCtg: string | null, clprPrc: number | null, clprBnfRt: number | null) {
  return [basDt, mrktCtg, clprPrc, null, clprBnfRt];
}

describe("decodePriceSeries", () => {
  test("시장별로 그룹핑하고 basDt를 YYYY-MM-DD 문자열로 변환한다", () => {
    const result = decodePriceSeries({
      columns: COLUMNS,
      rows: [row(20260828, "일반채권", 10250, 2.5)],
    });
    expect(result.get("일반채권")).toEqual<PricePoint[]>([
      { time: "2026-08-28", basDt: 20260828, clprPrc: 10250, clprBnfRt: 2.5 },
    ]);
  });

  test("같은 basDt에 KTS·일반채권이 섞여 와도 각 시리즈의 time이 유일·오름차순이다", () => {
    const result = decodePriceSeries({
      columns: COLUMNS,
      rows: [row(20260828, "KTS", 10100, 2.1), row(20260828, "일반채권", 10250, 2.5), row(20260827, "KTS", 10050, 2.0)],
    });
    const kts = result.get("KTS") ?? [];
    expect(kts.map((p) => p.time)).toEqual(["2026-08-27", "2026-08-28"]);
    expect(new Set(kts.map((p) => p.time)).size).toBe(kts.length);
    expect(result.get("일반채권")).toHaveLength(1);
  });

  test("clprPrc/clprBnfRt가 둘 다 null인 행은 제외한다", () => {
    const result = decodePriceSeries({
      columns: COLUMNS,
      rows: [row(20260828, "일반채권", null, null), row(20260829, "일반채권", 10300, null)],
    });
    expect(result.get("일반채권")).toHaveLength(1);
    expect((result.get("일반채권") ?? [])[0]?.basDt).toBe(20260829);
  });

  test("한쪽 값만 null이어도 포인트는 유지된다", () => {
    const result = decodePriceSeries({ columns: COLUMNS, rows: [row(20260828, "일반채권", 10300, null)] });
    expect((result.get("일반채권") ?? [])[0]).toEqual({
      time: "2026-08-28",
      basDt: 20260828,
      clprPrc: 10300,
      clprBnfRt: null,
    });
  });

  test("mrktCtg가 null인 행은 제외한다", () => {
    const result = decodePriceSeries({ columns: COLUMNS, rows: [row(20260828, null, 10300, 2.5)] });
    expect(result.size).toBe(0);
  });

  test("필요한 컬럼이 없으면 던진다", () => {
    expect(() => decodePriceSeries({ columns: ["basDt"], rows: [] })).toThrow();
  });
});

describe("presetToRange", () => {
  test("1Y는 오늘에서 365일 전", () => {
    expect(presetToRange("1Y", 20260828)).toEqual({ from: 20250828, to: 20260828 });
  });

  test("연말/연초 경계", () => {
    expect(presetToRange("1M", 20260105)).toEqual({ from: 20251206, to: 20260105 });
  });

  test("윤년 2월 경계(2024는 윤년)", () => {
    expect(presetToRange("1M", 20240315)).toEqual({ from: 20240214, to: 20240315 });
  });
});
