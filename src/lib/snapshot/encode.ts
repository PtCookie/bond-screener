/**
 * D1에서 뽑은 평범한 행 배열(`wrangler d1 execute --json` 출력과 동일한 컬럼명·타입)을
 * `SnapshotPayload`(v2)로 인코딩한다. `scripts/build-snapshot.mjs`가 상대 경로로 직접
 * import하므로 `format.ts`처럼 `@/` 별칭을 쓰지 않는다(이유는 `format.ts` 상단 주석 참고).
 *
 * `createSnapshotBuilder()`가 정본 구현이다 — 행을 한 번에 배열로 받는 대신 하나씩
 * 밀어 넣는 스트리밍 API라, 호출자가 D1 전체 결과를 메모리에 한 번에 들고 있을 필요가
 * 없다(Worker의 `src/lib/snapshot/build.ts`가 키셋 페이지네이션 청크로 이걸 쓴다 — isolate
 * 메모리 128MB는 Workers Paid에서도 그대로인 제약이라, CPU 예산이 늘었다고 전량 `all()`을
 * 써도 되는 건 아니다). `encodeSnapshot()`은 이 빌더를 감싼 예전 "행 배열 한 방에" API로,
 * `scripts/build-snapshot.mjs`와 `tests/snapshot-roundtrip.test.ts`가 그대로 계속 쓴다.
 *
 * 두 경로(Worker 청크 vs 스크립트 전량 조회)가 바이트 동일한 스냅샷을 내려면 행이
 * **`isin_cd` 오름차순으로 도착**해야 한다 — `bond_isur_nm` 발행인 사전 인덱스가 등장
 * 순서로 결정되기 때문이다. D1의 `ORDER BY isin_cd`(BINARY collation)와 JS `<` 비교는
 * ASCII 문자로만 이뤄진 ISIN에서 같은 순서를 낸다.
 */
import {
  SNAPSHOT_BOND_COLUMNS,
  SNAPSHOT_PRICE_COLUMNS,
  SNAPSHOT_VERSION,
  ymdToEpochDay,
  type SnapshotCell,
  type SnapshotPayload,
} from "./format.ts";

/** `addBondRow`가 받는 행 — `bond` 정적 필드 + `bond_state`(현재값)를 이미 조인한 형태. */
export interface SnapshotBuilderBondRow {
  isin_cd: string;
  isin_cd_nm: string;
  bond_isur_nm: string;
  scrs_itms_kcd: string | null;
  bond_issu_dt: number | null;
  bond_expr_dt: number | null;
  bond_srfc_inrt: number | null;
  bond_int_tcd: string | null;
  last_chg_bas_dt: number;
  bond_bal: number | null;
  kis_grade: string | null;
}

export interface SnapshotBuilderPriceRow {
  isin_cd: string;
  bas_dt: number;
  mrkt_ctg: number;
  clpr_prc: number | null;
  clpr_vs: number | null;
  clpr_bnf_rt: number | null;
  trqu: number | null;
}

export interface SnapshotBuilderCodeLabelRow {
  domain: string;
  code: string;
  label: string;
}

function toCell(v: string | number | null | undefined): SnapshotCell {
  return v === undefined ? null : v;
}

/**
 * 스트리밍 스냅샷 빌더. `addBondRow`/`addPriceRow`를 isin_cd 오름차순으로 호출하고,
 * `setCodeLabels`를 아무 때나(순서 무관) 호출한 뒤 `finish()`로 `SnapshotPayload`를 얻는다.
 */
export function createSnapshotBuilder() {
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

  const priceIsinCds: string[] = [];
  const priceCols: SnapshotCell[][] = SNAPSHOT_PRICE_COLUMNS.map(() => []);
  let priceBasDt: number | null = null;

  let codeLabels: Record<string, Record<string, string>> = {};

  return {
    addBondRow(row: SnapshotBuilderBondRow): void {
      const values: Record<(typeof SNAPSHOT_BOND_COLUMNS)[number], SnapshotCell> = {
        isin_cd: row.isin_cd,
        isin_cd_nm: row.isin_cd_nm,
        bond_isur_nm: internIssuer(row.bond_isur_nm),
        scrs_itms_kcd: toCell(row.scrs_itms_kcd),
        bond_issu_dt: ymdToEpochDay(row.bond_issu_dt),
        bond_expr_dt: ymdToEpochDay(row.bond_expr_dt),
        bond_srfc_inrt: toCell(row.bond_srfc_inrt),
        bond_int_tcd: toCell(row.bond_int_tcd),
        bond_bal: toCell(row.bond_bal),
        kis_grade: toCell(row.kis_grade),
      };
      SNAPSHOT_BOND_COLUMNS.forEach((col, i) => cols[i].push(values[col]));
      if (row.last_chg_bas_dt > basDt) basDt = row.last_chg_bas_dt;
    },

    addPriceRow(row: SnapshotBuilderPriceRow): void {
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
    },

    setCodeLabels(rows: readonly SnapshotBuilderCodeLabelRow[]): void {
      const next: Record<string, Record<string, string>> = {};
      for (const { domain, code, label } of rows) {
        (next[domain] ??= {})[code] = label;
      }
      codeLabels = next;
    },

    finish(): SnapshotPayload {
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
    },
  };
}

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

/**
 * 예전 "행 배열을 한 방에" API. 내부적으로 `createSnapshotBuilder()`를 감싼다 —
 * `bondRows`를 `isin_cd` 오름차순으로 정렬하고, `bond_state` 현재값을 Map으로 조인해
 * 순서대로 빌더에 밀어 넣는다.
 */
export function encodeSnapshot(input: EncodeSnapshotInput): SnapshotPayload {
  const { bondRows, stateRows, codeLabelRows, latestPriceRows } = input;

  const stateByIsin = new Map(stateRows.map((r) => [r.isin_cd, r]));
  const sortedBonds = [...bondRows].sort((a, b) => (a.isin_cd < b.isin_cd ? -1 : a.isin_cd > b.isin_cd ? 1 : 0));
  const sortedPrices = [...latestPriceRows].sort((a, b) =>
    a.isin_cd < b.isin_cd ? -1 : a.isin_cd > b.isin_cd ? 1 : 0,
  );

  const builder = createSnapshotBuilder();
  for (const row of sortedBonds) {
    const state = stateByIsin.get(row.isin_cd);
    builder.addBondRow({ ...row, bond_bal: state?.bond_bal ?? null, kis_grade: state?.kis_grade ?? null });
  }
  builder.setCodeLabels(codeLabelRows);
  for (const row of sortedPrices) builder.addPriceRow(row);

  return builder.finish();
}
