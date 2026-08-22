/**
 * `bond`/`bond_state`/`code_label` D1 바인딩 호출. SQL 문자열은 `./sql.ts`의 정본을 쓴다.
 *
 * 변경분 감지 흐름: (1) 지문 조회로 `bond` 변경분을 가르고 (2) 현재 상태 조회로
 * `bond_state` 변경분을 가른 뒤 (3) 변경된 것만 upsert한다 — 정상 운영에서는 대부분의
 * 페이지가 변경 0건이라 실제 write가 거의 발생하지 않는다.
 */
import type { BondBasiInfoItem } from "@/api";
import { buildBondRow, buildBondStateRow, mapBondCodeLabels, mapBondStateValues } from "@/lib/bond/mappers";
import { BOND_STATE_VALUE_COLUMNS, type BondRow, type BondStateRow, type CodeLabelRow } from "@/lib/bond/columns";
import {
  BOND_FINGERPRINT_SELECT_SQL,
  BOND_STATE_CLOSE_SQL,
  BOND_STATE_CURRENT_SELECT_SQL,
  BOND_STATE_INSERT_SQL,
  BOND_UPSERT_SQL,
  CODE_LABEL_INSERT_SQL,
} from "./sql";

export interface BondPageWriteResult {
  /** 변경 없이 넘어간 종목 수 (지문 일치) */
  unchanged: number;
  /** upsert된 종목 수 */
  upserted: number;
  /** 실행된 D1 쿼리 수 (invocation당 50개 예산 추적용) */
  queriesUsed: number;
}

/**
 * 기본정보 1페이지(`items`)를 지문 비교 → 변경분만 upsert 순서로 반영한다.
 *
 * @param basDt 이 페이지 응답의 기준일자
 */
export async function writeBondPage(
  db: D1Database,
  items: readonly BondBasiInfoItem[],
  basDt: number,
): Promise<BondPageWriteResult> {
  if (items.length === 0) return { unchanged: 0, upserted: 0, queriesUsed: 0 };

  const isinCds = items.map((item) => item.isinCd);
  let queriesUsed = 0;

  // 1. 지문 조회 — 파라미터 1개(json_each)로 다건 조회, bound parameter 100개 제한 우회.
  const fpRows = await db
    .prepare(BOND_FINGERPRINT_SELECT_SQL)
    .bind(JSON.stringify(isinCds))
    .all<{ isin_cd: string; fp: number }>();
  queriesUsed += 1;
  const existingFp = new Map(fpRows.results.map((r) => [r.isin_cd, r.fp]));

  // 2. 현재 bond_state 조회 — 값 비교로 변경분을 가른다.
  const stateRows = await db
    .prepare(BOND_STATE_CURRENT_SELECT_SQL)
    .bind(JSON.stringify(isinCds))
    .all<Record<string, string | number | null>>();
  queriesUsed += 1;
  const existingState = new Map(stateRows.results.map((r) => [r.isin_cd as string, r]));

  const changedBondRows: BondRow[] = [];
  const closeStateIsinCds: string[] = [];
  const newStateRows: BondStateRow[] = [];
  const codeLabelRows: CodeLabelRow[] = [];
  let unchanged = 0;

  for (const item of items) {
    // first_seen_bas_dt: 신규 종목이면 이 페이지의 basDt를 최초값으로 채운다. 기존 종목이면
    // 임의의 값을 넣어도 무방하다 — BOND_UPSERT_SQL의 ON CONFLICT DO UPDATE SET 절이
    // first_seen_bas_dt를 갱신 대상에서 제외해 뒀으므로(sql.ts 참고), 원래 저장된 최초값이
    // 그대로 보존된다.
    const isNew = !existingFp.has(item.isinCd);
    const fp = existingFp.get(item.isinCd);
    const row = buildBondRow(item, basDt, isNew ? null : basDt);
    const newFp = row[row.length - 1] as number;

    if (!isNew && fp === newFp) {
      unchanged += 1;
    } else {
      changedBondRows.push(row);
      codeLabelRows.push(...mapBondCodeLabels(item));
    }

    const currentState = existingState.get(item.isinCd);
    const newStateValues = mapBondStateValues(item);
    const stateChanged =
      !currentState || BOND_STATE_VALUE_COLUMNS.some((col, i) => currentState[col] !== newStateValues[i]);
    if (stateChanged) {
      if (currentState) closeStateIsinCds.push(item.isinCd);
      newStateRows.push(buildBondStateRow(item, item.isinCd, basDt));
    }
  }

  // bond와 bond_state는 독립적으로 변경될 수 있다 — 예를 들어 bondBal만 바뀌면 bond의
  // 지문(fp)은 그대로라 changedBondRows에는 안 들어가지만 bond_state는 갱신돼야 한다.
  // 따라서 둘을 하나의 조건으로 묶지 않고, 각자 필요할 때만 statement를 만들어 한 batch로 보낸다.
  const statements = [];
  if (changedBondRows.length > 0) {
    statements.push(db.prepare(BOND_UPSERT_SQL).bind(JSON.stringify(changedBondRows)));
  }
  if (closeStateIsinCds.length > 0) {
    statements.push(db.prepare(BOND_STATE_CLOSE_SQL).bind(JSON.stringify(closeStateIsinCds), basDt));
  }
  if (newStateRows.length > 0) {
    statements.push(db.prepare(BOND_STATE_INSERT_SQL).bind(JSON.stringify(newStateRows)));
  }
  if (statements.length > 0) {
    await db.batch(statements);
    queriesUsed += statements.length;
  }

  if (codeLabelRows.length > 0) {
    await db.prepare(CODE_LABEL_INSERT_SQL).bind(JSON.stringify(codeLabelRows)).run();
    queriesUsed += 1;
  }

  return { unchanged, upserted: changedBondRows.length, queriesUsed };
}
