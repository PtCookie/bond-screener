/**
 * `src/lib/bond/columns.ts` ↔ `scripts/lib/columns.mjs` 교차검증. 순서까지 정확히 같아야
 * 한다 — 어긋나면 `json_each` 기반 벌크 INSERT(cron 쪽)와 다중 VALUES INSERT(백필 쪽)가
 * 서로 다른 위치에 값을 채워 넣는다.
 */
import { describe, expect, test } from "vitest";
import {
  BOND_COLUMNS as BOND_COLUMNS_TS,
  BOND_FINGERPRINT_COLUMNS as BOND_FINGERPRINT_COLUMNS_TS,
  BOND_PRICE_COLUMNS as BOND_PRICE_COLUMNS_TS,
  BOND_STATE_COLUMNS as BOND_STATE_COLUMNS_TS,
  CODE_LABEL_COLUMNS as CODE_LABEL_COLUMNS_TS,
  CODE_LABEL_DOMAINS as CODE_LABEL_DOMAINS_TS,
} from "@/lib/bond/columns";
import {
  BOND_COLUMNS as BOND_COLUMNS_JS,
  BOND_FINGERPRINT_COLUMNS as BOND_FINGERPRINT_COLUMNS_JS,
  BOND_PRICE_COLUMNS as BOND_PRICE_COLUMNS_JS,
  BOND_STATE_COLUMNS as BOND_STATE_COLUMNS_JS,
  CODE_LABEL_COLUMNS as CODE_LABEL_COLUMNS_JS,
  CODE_LABEL_DOMAINS as CODE_LABEL_DOMAINS_JS,
} from "../../scripts/lib/columns.mjs";

describe("컬럼 순서 교차검증 (TS ↔ JS)", () => {
  test("BOND_COLUMNS", () => {
    expect(BOND_COLUMNS_JS).toEqual([...BOND_COLUMNS_TS]);
  });

  test("BOND_FINGERPRINT_COLUMNS", () => {
    expect(BOND_FINGERPRINT_COLUMNS_JS).toEqual([...BOND_FINGERPRINT_COLUMNS_TS]);
  });

  test("BOND_STATE_COLUMNS", () => {
    expect(BOND_STATE_COLUMNS_JS).toEqual([...BOND_STATE_COLUMNS_TS]);
  });

  test("BOND_PRICE_COLUMNS", () => {
    expect(BOND_PRICE_COLUMNS_JS).toEqual([...BOND_PRICE_COLUMNS_TS]);
  });

  test("CODE_LABEL_COLUMNS", () => {
    expect(CODE_LABEL_COLUMNS_JS).toEqual([...CODE_LABEL_COLUMNS_TS]);
  });

  test("CODE_LABEL_DOMAINS — 키 순서(Object.values 순회에 영향)까지 동일", () => {
    expect(Object.entries(CODE_LABEL_DOMAINS_JS)).toEqual(Object.entries(CODE_LABEL_DOMAINS_TS));
  });
});
