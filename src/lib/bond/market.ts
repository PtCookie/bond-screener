/**
 * 채권시세정보 `mrktCtg` ↔ D1 `INTEGER` 코드 변환.
 *
 * `bond_price`가 `WITHOUT ROWID`라 PK에 포함된 컬럼이 모든 보조 인덱스에 복제되므로,
 * `'일반채권'`(UTF-8 12바이트) 대신 정수 코드로 PK 폭을 줄인다.
 */
import { BOND_MARKET_CATEGORIES, type BondMarketCategory } from "@/api";

/** `BOND_MARKET_CATEGORIES`(`["KTS", "일반채권", "소액채권"]`)의 선언 순서를 그대로 코드값으로 쓴다. */
export const MARKET_CATEGORY_CODE: Readonly<Record<BondMarketCategory, number>> = {
  KTS: 1,
  일반채권: 2,
  소액채권: 3,
};

const CODE_TO_CATEGORY = new Map<number, BondMarketCategory>(
  BOND_MARKET_CATEGORIES.map((category) => [MARKET_CATEGORY_CODE[category], category]),
);

export function marketCategoryToCode(category: BondMarketCategory): number {
  return MARKET_CATEGORY_CODE[category];
}

/** 알 수 없는 코드가 들어오면(방어적) `null`을 반환한다. */
export function codeToMarketCategory(code: number): BondMarketCategory | null {
  return CODE_TO_CATEGORY.get(code) ?? null;
}
