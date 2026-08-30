import { describe, expect, test } from "vitest";
import { BOND_COLUMNS } from "@/lib/bond/columns";
import { ALL_BOND_FIELD_SPECS, CURATED_BOND_KEYS, DETAIL_SECTIONS, formatDetailField } from "@/lib/bond/detail-view";

/** `bond` 컬럼(snake_case) → 응답 필드명(camelCase). `src/lib/bond/detail.ts`의 변환 규칙과 동일. */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

describe("ALL_BOND_FIELD_SPECS", () => {
  test("BOND_COLUMNS에서 isin_cd/fp를 뺀 나머지와 정확히 1:1 대응한다", () => {
    const expectedKeys = new Set(BOND_COLUMNS.filter((c) => c !== "isin_cd" && c !== "fp").map(snakeToCamel));
    expect(new Set(Object.keys(ALL_BOND_FIELD_SPECS))).toEqual(expectedKeys);
  });

  test("각 spec의 key는 자기 자신의 맵 키와 같다", () => {
    for (const [key, spec] of Object.entries(ALL_BOND_FIELD_SPECS)) {
      expect(spec.key).toBe(key);
      expect(spec.source).toBe("bond");
    }
  });
});

describe("CURATED_BOND_KEYS", () => {
  test("큐레이션된 bond 키는 전부 ALL_BOND_FIELD_SPECS에 실재한다", () => {
    for (const key of CURATED_BOND_KEYS) {
      expect(ALL_BOND_FIELD_SPECS).toHaveProperty(key);
    }
  });

  test("DETAIL_SECTIONS의 bond 소스 필드 키 집합과 정확히 같다", () => {
    const fromSections = new Set(
      DETAIL_SECTIONS.flatMap((s) => s.fields)
        .filter((f) => f.source === "bond")
        .map((f) => f.key),
    );
    expect(CURATED_BOND_KEYS).toEqual(fromSections);
  });
});

describe("DETAIL_SECTIONS", () => {
  test("state 소스 필드는 신용등급 4종 + 잔액 + 차기/직전 이표일 7개뿐이다", () => {
    const stateKeys = DETAIL_SECTIONS.flatMap((s) => s.fields)
      .filter((f) => f.source === "state")
      .map((f) => f.key)
      .sort();
    expect(stateKeys).toEqual(
      ["bondBal", "fnGrade", "kbpGrade", "kisGrade", "niceGrade", "nxtmCopnDt", "rbfCopnDt"].sort(),
    );
  });
});

describe("formatDetailField", () => {
  test("null/undefined는 대시", () => {
    expect(formatDetailField(null, "text")).toBe("—");
    expect(formatDetailField(undefined, "amount")).toBe("—");
  });

  test("ymd/rate/amount는 기존 포매터에 위임한다", () => {
    expect(formatDetailField(20260828, "ymd")).toBe("2026-08-28");
    expect(formatDetailField(3.25, "rate")).toBe("3.250%");
    expect(formatDetailField(1e12, "amount")).toBe("1.0조");
  });

  test("bool은 예/아니오로 표시한다", () => {
    expect(formatDetailField(true, "bool")).toBe("예");
    expect(formatDetailField(false, "bool")).toBe("아니오");
  });

  test("codeLabel은 label이 있으면 label, code_label 사전에 없으면 코드 원문으로 폴백한다", () => {
    expect(formatDetailField({ code: "1", label: "무보증" }, "codeLabel")).toBe("무보증");
    expect(formatDetailField({ code: "9", label: null }, "codeLabel")).toBe("9");
  });

  test("text는 문자열로 그대로", () => {
    expect(formatDetailField("한국전력공사", "text")).toBe("한국전력공사");
  });
});
