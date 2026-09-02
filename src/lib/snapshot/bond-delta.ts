/**
 * 일일 bond 델타 생성 — 그날(`basDt`) 변경된 종목만 골라 R2에 올리고 `index.json`을
 * 갱신한다. `src/lib/r2/price-delta.ts`의 `writePriceDelta`와 같은 base+delta 패턴을
 * bond 축에 적용한 것이다: base(주 1회 전량 재빌드, `immutable` 캐시)는 그대로 두고,
 * 그 사이 평일에는 변경분만 담은 작은 오브젝트를 추가한다.
 *
 * 델타 소스는 D1 재조회(`readChangedBondRows`)다 — `writeBondPage`가 페이지마다 들고
 * 있는 변경분을 tick 경계 너머로 누적할 방법이 없고(한 basDt 수집이 여러 tick에 걸칠 수
 * 있다), `last_chg_bas_dt = basDt`(bond 정적 필드 변경) OR `bond_state.valid_from = basDt`
 * (신용등급·잔액 변경)라는 조건이 그날의 변경분 전체를 정확히 덮기 때문이다.
 */
import { SNAPSHOT_BOND_COLUMNS, ymdToEpochDay, type SnapshotCell } from "./format";
import { readChangedBondRows, readSnapshotCodeLabels, type SnapshotBondRow } from "@/lib/d1/snapshot-repo";
import { readIndex } from "@/lib/r2/price-delta";
import { snapshotBondDeltaKey, SNAPSHOT_INDEX_KEY } from "@/lib/r2/keys";
import { BOND_DELTA_MAX_ROWS } from "@/lib/sync/config";
import type { SnapshotIndex } from "./index-file";

/**
 * base(`SnapshotPayload`)와 달리 컬럼 지향이 아니라 행 지향(row-major)이다 —
 * `src/lib/r2/price-delta.ts`의 `PriceDeltaPayload`와 같은 관례(작은 델타는 컬럼
 * 지향으로 나눠봐야 이점이 없고, 병합 로직이 행 단위로 순회하기 편하다).
 *
 * `bond_isur_nm`은 base처럼 `issuers` 사전 인덱스가 아니라 **원문 문자열**이다 — 델타는
 * base의 사전을 모르므로 인덱스를 만들 수 없고, 병합 시(`mergeBondDeltas`) base의
 * `issuers` 배열에 그때 인턴한다. `codeLabels`는 그날 변경분에 등장한 코드만이 아니라
 * `code_label` 전량(57행, ~2KB)을 싣는다 — 신규 코드가 델타에만 등장할 수 있고, 전량이면
 * 병합이 "최신 델타 것으로 교체"로 단순해진다.
 */
export interface BondDeltaPayload {
  basDt: number;
  columns: typeof SNAPSHOT_BOND_COLUMNS;
  rows: SnapshotCell[][];
  codeLabels: Record<string, Record<string, string>>;
}

export type BondDeltaResult = { tooLarge: true } | { tooLarge: false; basDt: number; count: number; bytes: number };

function buildDeltaRow(row: SnapshotBondRow): SnapshotCell[] {
  return [
    row.isin_cd,
    row.isin_cd_nm,
    row.bond_isur_nm,
    row.scrs_itms_kcd,
    ymdToEpochDay(row.bond_issu_dt),
    ymdToEpochDay(row.bond_expr_dt),
    row.bond_srfc_inrt,
    row.bond_int_tcd,
    row.bond_bal,
    row.kis_grade,
  ];
}

function codeLabelsRecord(
  rows: readonly { domain: string; code: string; label: string }[],
): Record<string, Record<string, string>> {
  const next: Record<string, Record<string, string>> = {};
  for (const { domain, code, label } of rows) {
    (next[domain] ??= {})[code] = label;
  }
  return next;
}

/**
 * `basDt`의 변경분을 델타로 올린다. 변경 행이 `BOND_DELTA_MAX_ROWS` 이상이면(비정상적으로
 * 큰 갱신 — 안전밸브) 델타를 쓰지 않고 `{ tooLarge: true }`를 반환한다. 호출부
 * (`src/lib/sync/tick.ts`의 `runBondDeltaAction`)는 이 경우 `buildAndPutSnapshot`으로
 * 전량 재빌드에 폴백한다.
 */
export async function buildAndPutBondDelta(
  env: { DB: D1Database; ARCHIVE: R2Bucket },
  basDt: number,
): Promise<BondDeltaResult> {
  const changedRows = await readChangedBondRows(env.DB, basDt, BOND_DELTA_MAX_ROWS + 1);
  if (changedRows.length > BOND_DELTA_MAX_ROWS) {
    return { tooLarge: true };
  }
  if (changedRows.length === 0) {
    // 변경분 없음 — 빈 델타를 굳이 올리지 않는다(index를 건드릴 이유도 없다).
    return { tooLarge: false, basDt, count: 0, bytes: 0 };
  }

  const codeLabelRows = await readSnapshotCodeLabels(env.DB);
  const payload: BondDeltaPayload = {
    basDt,
    columns: SNAPSHOT_BOND_COLUMNS,
    rows: changedRows.map(buildDeltaRow),
    codeLabels: codeLabelsRecord(codeLabelRows),
  };
  const json = JSON.stringify(payload);
  const key = snapshotBondDeltaKey(basDt);
  await env.ARCHIVE.put(key, json, { httpMetadata: { contentType: "application/json" } });

  const index = await readIndex(env.ARCHIVE);
  const baseBasDt = index.bond?.basDt ?? 0;
  // base에 이미 포함된 날짜(이하)는 정리한다 — writePriceDelta와 동일한 규칙
  // (src/lib/r2/price-delta.ts 참고).
  const bondDeltas =
    basDt > baseBasDt
      ? [
          ...index.bondDeltas.filter((d) => d.basDt > baseBasDt && d.basDt !== basDt),
          { key, basDt, count: changedRows.length },
        ].sort((a, b) => a.basDt - b.basDt)
      : index.bondDeltas.filter((d) => d.basDt > baseBasDt);

  const newIndex: SnapshotIndex = {
    generatedAt: new Date().toISOString(),
    bond: index.bond,
    bondDeltas,
    priceDeltas: index.priceDeltas,
  };
  await env.ARCHIVE.put(SNAPSHOT_INDEX_KEY, JSON.stringify(newIndex), {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=0, must-revalidate" },
  });

  return { tooLarge: false, basDt, count: changedRows.length, bytes: json.length };
}
