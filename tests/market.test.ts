import { describe, expect, test } from "vitest";
import { codeToMarketCategory, marketCategoryToCode } from "@/lib/bond/market";

describe("marketCategoryToCode / codeToMarketCategory", () => {
  test("3종 시장구분이 1/2/3으로 매핑된다", () => {
    expect(marketCategoryToCode("KTS")).toBe(1);
    expect(marketCategoryToCode("일반채권")).toBe(2);
    expect(marketCategoryToCode("소액채권")).toBe(3);
  });

  test("역매핑도 성립한다", () => {
    expect(codeToMarketCategory(1)).toBe("KTS");
    expect(codeToMarketCategory(2)).toBe("일반채권");
    expect(codeToMarketCategory(3)).toBe("소액채권");
  });

  test("알 수 없는 코드는 null", () => {
    expect(codeToMarketCategory(99)).toBeNull();
  });
});
