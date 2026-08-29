/**
 * D1에서 뽑은 평범한 행 배열(`wrangler d1 execute --json` 출력과 동일한 컬럼명·타입)을
 * `SnapshotPayload`(v2)로 인코딩한다. `scripts/build-snapshot.mjs`가 상대 경로로 직접
 * import하므로 `format.ts`처럼 `@/` 별칭을 쓰지 않는다(이유는 `format.ts` 상단 주석 참고).
 */
import {
  SNAPSHOT_BOND_COLUMNS,
  SNAPSHOT_PRICE_COLUMNS,
  SNAPSHOT_VERSION,
  ymdToEpochDay,
  type SnapshotCell,
  type SnapshotPayload,
} from "./format.ts";

export interface SnapshotBondSourceRow {
  isin_cd: string;
  isin_cd_nm: string;
  bond_isur_nm: string;
  scrs_itms_kcd: string | null;
  bond_issu_dt: number | null;
  bond_expr_dt: number | null;
  bond_srfc_inrt: number | null;
  bond_int_tcd: string | null;
  last_chg_bas_dt: number;
}

export interface SnapshotBondStateSourceRow {
  isin_cd: string;
  bond_bal: number | null;
  kis_grade: string | null;
}

export interface SnapshotCodeLabelSourceRow {
  domain: string;
  code: string;
  label: string;
}

export interface SnapshotPriceSourceRow {
  isin_cd: string;
  bas_dt: number;
  mrkt_ctg: number;
  clpr_prc: number | null;
  clpr_vs: number | null;
  clpr_bnf_rt: number | null;
  trqu: number | null;
}

export interface EncodeSnapshotInput {
  bondRows: readonly SnapshotBondSourceRow[];
  /** `bond_state WHERE valid_to IS NULL` 조회 결과 — 종목당 최대 1행. */
  stateRows: readonly SnapshotBondStateSourceRow[];
  codeLabelRows: readonly SnapshotCodeLabelSourceRow[];
  /** 종목별 "최신" 시세 1행씩(호출부가 `MAX(bas_dt)` 조인으로 이미 좁혀서 넘긴다). */
  latestPriceRows: readonly SnapshotPriceSourceRow[];
}

function toCell(v: string | number | null | undefined): SnapshotCell {
  return v === undefined ? null : v;
}

export function encodeSnapshot(input: EncodeSnapshotInput): SnapshotPayload {
  const { bondRows, stateRows, codeLabelRows, latestPriceRows } = input;

  const stateByIsin = new Map(stateRows.map((r) => [r.isin_cd, r]));

  const sortedBonds = [...bondRows].sort((a, b) => (a.isin_cd < b.isin_cd ? -1 : a.isin_cd > b.isin_cd ? 1 : 0));

  // 발행인 사전 — 정렬된 행을 순서대로 훑으며 처음 등장한 순서로 채운다(빌드마다 결정적).
  const issuers: string[] = [];
  const issuerIndex = new Map<string, number>();
  function internIssuer(name: string): number {
    const existing = issuerIndex.get(name);
    if (existing !== undefined) return existing;
    const idx = issuers.length;
    issuers.push(name);
    issuerIndex.set(name, idx);
    return idx;
  }

  const cols: SnapshotCell[][] = SNAPSHOT_BOND_COLUMNS.map(() => []);
  let basDt = 0;
  for (const row of sortedBonds) {
    const state = stateByIsin.get(row.isin_cd);
    const values: Record<(typeof SNAPSHOT_BOND_COLUMNS)[number], SnapshotCell> = {
      isin_cd: row.isin_cd,
      isin_cd_nm: row.isin_cd_nm,
      bond_isur_nm: internIssuer(row.bond_isur_nm),
      scrs_itms_kcd: toCell(row.scrs_itms_kcd),
      bond_issu_dt: ymdToEpochDay(row.bond_issu_dt),
      bond_expr_dt: ymdToEpochDay(row.bond_expr_dt),
      bond_srfc_inrt: toCell(row.bond_srfc_inrt),
      bond_int_tcd: toCell(row.bond_int_tcd),
      bond_bal: toCell(state?.bond_bal ?? null),
      kis_grade: toCell(state?.kis_grade ?? null),
    };
    SNAPSHOT_BOND_COLUMNS.forEach((col, i) => cols[i].push(values[col]));
    if (row.last_chg_bas_dt > basDt) basDt = row.last_chg_bas_dt;
  }

  const codeLabels: Record<string, Record<string, string>> = {};
  for (const { domain, code, label } of codeLabelRows) {
    (codeLabels[domain] ??= {})[code] = label;
  }

  const sortedPrices = [...latestPriceRows].sort((a, b) =>
    a.isin_cd < b.isin_cd ? -1 : a.isin_cd > b.isin_cd ? 1 : 0,
  );
  const priceIsinCds: string[] = [];
  const priceCols: SnapshotCell[][] = SNAPSHOT_PRICE_COLUMNS.map(() => []);
  let priceBasDt: number | null = null;
  for (const row of sortedPrices) {
    priceIsinCds.push(row.isin_cd);
    const values: Record<(typeof SNAPSHOT_PRICE_COLUMNS)[number], SnapshotCell> = {
      bas_dt: ymdToEpochDay(row.bas_dt),
      mrkt_ctg: row.mrkt_ctg,
      clpr_prc: toCell(row.clpr_prc),
      clpr_vs: toCell(row.clpr_vs),
      clpr_bnf_rt: toCell(row.clpr_bnf_rt),
      trqu: toCell(row.trqu),
    };
    SNAPSHOT_PRICE_COLUMNS.forEach((col, i) => priceCols[i].push(values[col]));
    if (priceBasDt === null || row.bas_dt > priceBasDt) priceBasDt = row.bas_dt;
  }

  return {
    v: SNAPSHOT_VERSION,
    basDt,
    priceBasDt,
    columns: SNAPSHOT_BOND_COLUMNS,
    issuers,
    codeLabels,
    cols,
    priceColumns: SNAPSHOT_PRICE_COLUMNS,
    priceIsinCds,
    priceCols,
  };
}
