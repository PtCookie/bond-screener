/**
 * D1 상세/시계열 조회 결과(snake_case 행)를 API 응답(camelCase)으로 변환하는 순수 함수
 * 계층. `src/pages/api/bond/`의 라우트는 이 파일과 `d1/detail-repo.ts`/`d1/price-repo.ts`만
 * 조합한다 — 로직을 라우트 밖에 두는 이유는 `vitest.workers.config.ts` 주석 참고
 * (workers vitest 프로젝트가 Astro 라우트 파일 자체를 실행할 수 없다).
 */
import type { BondDetailSource } from "@/lib/d1/detail-repo";
import {
  BOND_PRICE_COLUMNS,
  CODE_LABEL_DOMAINS,
  type BondColumn,
  type BondPriceColumn,
  type BondPriceRowRecord,
} from "./columns";
import { previousWeekdayYmd } from "@/lib/sync/dates";
import { codeToMarketCategory } from "./market";

/** `bond_*_yn` 0/1 INTEGER 컬럼 — 응답에서 boolean으로 바꾼다. */
const BOOLEAN_COLUMNS = new Set<BondColumn>([
  "strips_psbl_yn",
  "pris_lnkg_bond_yn",
  "crfnd_yn",
  "prmnc_bond_yn",
  "qib_trgt_scrt_yn",
  "elps_int_pay_yn",
]);

/** 운영 전용이라 응답에서 제외하는 컬럼(지문값 — 클라이언트가 쓸 이유가 없다). */
const OMIT_BOND_COLUMNS = new Set<BondColumn>(["fp"]);

/** `bond_isur_nm` → `bondIsurNm`처럼 snake_case 컬럼명을 원본 API 필드명(camelCase)으로 복원한다. */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_match, c: string) => c.toUpperCase());
}

export interface CodeLabelField {
  code: string;
  /** `code_label`에 없는 코드면 `null` — 사전 충전 지연/누락을 응답에서 구분 가능하게 한다. */
  label: string | null;
}

export type BondDetailField = string | number | boolean | CodeLabelField | null;

/** `bond` 행 1개를 응답 필드로 변환한다. `codeLabels`는 `fetchBondDetail`이 미리 조회해 둔 라벨 맵. */
export function toBondDetailFields(
  bond: BondDetailSource["bond"],
  codeLabels: BondDetailSource["codeLabels"],
): Record<string, BondDetailField> {
  const out: Record<string, BondDetailField> = {};
  for (const [column, value] of Object.entries(bond) as [BondColumn, string | number | null][]) {
    if (OMIT_BOND_COLUMNS.has(column)) continue;
    const field = snakeToCamel(column);
    const domain = CODE_LABEL_DOMAINS[column];
    if (domain && value !== null) {
      out[field] = { code: value as string, label: codeLabels.get(`${domain}:${value}`) ?? null };
    } else if (BOOLEAN_COLUMNS.has(column)) {
      out[field] = value === null ? null : value === 1;
    } else {
      out[field] = value;
    }
  }
  return out;
}

/** `bond_state` 행 1개를 camelCase로 변환한다(코드/라벨 변환 없음 — 등급은 이미 텍스트). */
function toStateFields(row: BondDetailSource["stateHistory"][number]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [column, value] of Object.entries(row)) out[snakeToCamel(column)] = value;
  return out;
}

export interface BondDetailResponse {
  bond: Record<string, BondDetailField>;
  /** 현재 유효한 `bond_state` 행(`stateHistory[0]`). 이력이 없으면 `null`. */
  state: Record<string, string | number | null> | null;
  /** `valid_from` 내림차순. 종목당 이력 행 수는 애초에 한 자릿수(`0001_init.sql` 주석). */
  stateHistory: Record<string, string | number | null>[];
  /**
   * 최신 `bas_dt` 하루치. 같은 날 두 시장에 동시 존재하면 여러 건. `bond_price` 컬럼 외에
   * 조회 시점에 계산한 `prevBasDt`/`clprBnfRtVs`가 붙는다(`pairPrevPrice` 참고).
   */
  latestPrices: Record<string, string | number | null>[];
}

function toPriceFields(row: BondPriceRowRecord): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [column, value] of Object.entries(row) as [BondPriceColumn, string | number | null][]) {
    const field = snakeToCamel(column);
    out[field] = column === "mrkt_ctg" ? (codeToMarketCategory(value as number) ?? null) : value;
  }
  return out;
}

/**
 * `GET /api/bond/[id]`이 실제로 응답하는 최상위 형태(`src/pages/api/bond/[id].ts`가
 * `{ isinCd, srtnCd, ...toBondDetailResponse(source) }`로 조립하는 것과 정확히 같다).
 * SSR 상세 페이지(`src/pages/bond/[id].astro`)가 같은 조합을 직접 만들어 React island에
 * 넘길 때 이 타입을 공유한다.
 */
export interface BondDetailApiResponse extends BondDetailResponse {
  isinCd: string;
  srtnCd: string | null;
}

/** 가격 산식 일치 허용오차 — `clpr_prc`/`clpr_vs`는 소수 둘째 자리까지 온다. */
const PRICE_EPSILON = 0.005;

/**
 * `cur`(최신 행)와 같은 시장의 `prevRows` 행이 "전일대비"의 기준이 되는 직전 영업일 행인지
 * 판정해 그 행을 반환한다. 아니면 `null`.
 *
 * API의 `clpr_vs`는 직전 영업일 종가와의 차이이고, 종목이 직전 영업일에 거래되지 않았으면
 * 항상 0이다(로컬 D1 2026-08 실측: 직전 영업일 행이 있는 2692건은 전부
 * `clpr_prc(t) − clpr_prc(t−1)`과 일치, 없는 920건은 전부 `clpr_vs = 0`). 그래서 다음 중
 * 하나면 인정한다:
 * 1. `prev.bas_dt`가 `cur.bas_dt`의 직전 평일 — 평일 연속 거래.
 * 2. `clpr_vs ≠ 0`이고 `prev.clpr_prc + clpr_vs = cur.clpr_prc` — 공휴일(달력에 없다)을
 *    끼고도 API가 이 행을 기준으로 삼았다는 증거. 거래가 끊겼으면 `clpr_vs`가 0이라
 *    이 조건으로는 들어올 수 없다.
 *
 * 연휴 직후이면서 보합(`clpr_vs = 0`)이면 판정 불가로 떨어지지만, 틀린 값 대신 "—"를
 * 보여주는 쪽으로만 오판한다.
 */
export function pairPrevPrice(
  cur: BondPriceRowRecord,
  prevRows: readonly BondPriceRowRecord[],
): BondPriceRowRecord | null {
  const prev = prevRows.find((p) => p.mrkt_ctg === cur.mrkt_ctg);
  if (!prev) return null;
  const curBasDt = cur.bas_dt as number;
  if (prev.bas_dt === previousWeekdayYmd(curBasDt)) return prev;

  const { clpr_prc: curPrc, clpr_vs: vs } = cur as { clpr_prc: number | null; clpr_vs: number | null };
  const prevPrc = prev.clpr_prc as number | null;
  if (vs === null || vs === 0 || curPrc === null || prevPrc === null) return null;
  return Math.abs(prevPrc + vs - curPrc) < PRICE_EPSILON ? prev : null;
}

/** 수익률(%) 차이. 부동소수 오차(`4.044 - 4.056 = -0.01200000000000001`)를 0.0001%p 단위로 자른다. */
function yieldDelta(cur: BondPriceRowRecord, prev: BondPriceRowRecord | null): number | null {
  const a = cur.clpr_bnf_rt as number | null;
  const b = prev?.clpr_bnf_rt as number | null | undefined;
  if (a === null || b === null || b === undefined) return null;
  return Math.round((a - b) * 1e4) / 1e4;
}

export function toBondDetailResponse(source: BondDetailSource): BondDetailResponse {
  const { bond, stateHistory, latestPrices, prevPrices, codeLabels } = source;
  return {
    bond: toBondDetailFields(bond, codeLabels),
    state: stateHistory[0] ? toStateFields(stateHistory[0]) : null,
    stateHistory: stateHistory.map(toStateFields),
    latestPrices: latestPrices.map((row) => {
      const prev = pairPrevPrice(row, prevPrices);
      return {
        ...toPriceFields(row),
        // `null`이면 전일 비교 불가 — 이때는 API의 `clprVs`(=0)도 "보합"이 아니다.
        prevBasDt: (prev?.bas_dt as number | undefined) ?? null,
        clprBnfRtVs: yieldDelta(row, prev),
      };
    }),
  };
}

/**
 * 시계열 응답 컬럼 — `BOND_PRICE_COLUMNS`에서 `isin_cd`만 뺀 것(요청당 종목 1개라 중복).
 * 순서는 `BOND_PRICE_COLUMNS` 정본을 그대로 따르므로 손으로 다시 나열하지 않는다.
 */
const PRICE_SERIES_SOURCE_COLUMNS = BOND_PRICE_COLUMNS.filter(
  (c): c is Exclude<BondPriceColumn, "isin_cd"> => c !== "isin_cd",
);

export const PRICE_SERIES_COLUMNS = PRICE_SERIES_SOURCE_COLUMNS.map(snakeToCamel);

export interface PriceSeriesResponse {
  columns: readonly string[];
  /** 행 순서는 `PRICE_SERIES_COLUMNS`와 대응 — 스냅샷과 같은 컬럼 지향 포맷(`snapshot/format.ts` 참고). */
  rows: (string | number | null)[][];
}

export function toPriceSeriesResponse(rows: readonly BondPriceRowRecord[]): PriceSeriesResponse {
  return {
    columns: PRICE_SERIES_COLUMNS,
    rows: rows.map((row) =>
      PRICE_SERIES_SOURCE_COLUMNS.map((col) =>
        col === "mrkt_ctg" ? (codeToMarketCategory(row[col] as number) ?? null) : row[col],
      ),
    ),
  };
}
