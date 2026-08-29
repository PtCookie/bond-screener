/**
 * 스크리너 목록 스냅샷(v2) 포맷 정본.
 *
 * `scripts/build-snapshot.mjs`가 이 파일과 `encode.ts`를 상대 경로로 직접 import한다
 * (Node 24.18.0의 type stripping으로 `.ts`를 그대로 실행 — `node --version`, 별도 빌드
 * 불필요). 따라서 이 두 파일은 **`@/` 경로 별칭을 쓰지 않는다** — 별칭은 tsconfig의
 * path mapping이라 Node ESM 로더가 직접 실행할 때는 풀리지 않는다. `scripts/lib/*.mjs`가
 * `src/lib/bond/`의 정규화·매핑 로직을 plain JS로 중복 구현해야 했던 것(AGENTS.md의
 * fingerprint 이중 구현 경고 참고)과 같은 함정을 피하기 위해, 스냅샷 포맷은 이 파일
 * 한 벌만 정본으로 두고 스크립트와 클라이언트(`decode.ts`)가 함께 참조한다.
 *
 * `decode.ts`/`merge.ts`는 클라이언트 번들(Vite)에서만 쓰이므로 `@/` 별칭을 써도 된다.
 */

export const SNAPSHOT_VERSION = 2;

/**
 * bond 스냅샷 컬럼. 순서가 `encode.ts`/`decode.ts` 양쪽의 `cols` 배열 인덱스를 구동한다 —
 * 바꾸려면 양쪽을 함께 고칠 것.
 *
 * `bond_isur_nm`은 원문 문자열이 아니라 `issuers` 사전의 인덱스(정수)로 인코딩된다.
 * `bond_issu_dt`/`bond_expr_dt`는 YYYYMMDD 정수가 아니라 epoch day(`ymdToEpochDay`)로
 * 인코딩된다 — 둘 다 gzip/brotli 압축률을 위한 것(실측: 컬럼 지향 + 사전화 + epoch day로
 * 17컬럼 645KB → 10컬럼 351KB(brotli), 종목명·전종목 최신시세를 포함하고도 더 작다).
 */
export const SNAPSHOT_BOND_COLUMNS = [
  "isin_cd",
  "isin_cd_nm",
  "bond_isur_nm",
  "scrs_itms_kcd",
  "bond_issu_dt",
  "bond_expr_dt",
  "bond_srfc_inrt",
  "bond_int_tcd",
  "bond_bal",
  "kis_grade",
] as const;

/** 종목별 "최신" 시세 1건. `bas_dt`도 epoch day로 인코딩된다. */
export const SNAPSHOT_PRICE_COLUMNS = ["bas_dt", "mrkt_ctg", "clpr_prc", "clpr_vs", "clpr_bnf_rt", "trqu"] as const;

export type SnapshotBondColumn = (typeof SNAPSHOT_BOND_COLUMNS)[number];
export type SnapshotPriceColumn = (typeof SNAPSHOT_PRICE_COLUMNS)[number];

export type SnapshotCell = string | number | null;

/**
 * 스크리너 목록 스냅샷 전체 페이로드. `cols`/`priceCols`는 컬럼 지향(column-major) —
 * `cols[i][r]`이 `columns[i]` 컬럼의 `r`번째 행 값이다. 행 순서는 `isin_cd` 오름차순으로
 * 고정하지만(압축률용), 디코더는 이 순서에 의존하지 않는다 — 화면 정렬은 TanStack Table이 한다.
 */
export interface SnapshotPayload {
  v: typeof SNAPSHOT_VERSION;
  /** bond 스냅샷 기준일(YYYYMMDD) — `bond.last_chg_bas_dt`의 최댓값. */
  basDt: number;
  /** 시세 컬럼의 기준일(YYYYMMDD) — 종목마다 다른 날짜의 "최신"이 섞여 있어 참고용. */
  priceBasDt: number | null;
  columns: readonly SnapshotBondColumn[];
  /** `bond_isur_nm` 사전. `cols`의 해당 컬럼 값은 이 배열의 인덱스다. */
  issuers: readonly string[];
  /** domain(camelCase 원본 필드명) → { code: label }. `code_label` 테이블 그대로. */
  codeLabels: Record<string, Record<string, string>>;
  cols: SnapshotCell[][];
  priceColumns: readonly SnapshotPriceColumn[];
  /** `priceCols`와 같은 행 순서로 대응하는 isin_cd. bond의 `cols`와는 별도 정렬(종목 부분집합이라 인덱스가 다름). */
  priceIsinCds: string[];
  priceCols: SnapshotCell[][];
}

const EPOCH_DAY_MS = 86_400_000;

/**
 * YYYYMMDD 정수를 1970-01-01 기준 epoch day로 변환한다. `Date`의 로컬 타임존을 거치지
 * 않도록 `Date.UTC`로 고정한다 — `src/lib/screener/format.ts`의 `fmtYmd`가 문자열
 * 슬라이싱으로 타임존 문제를 피하는 것과 같은 이유.
 */
export function ymdToEpochDay(ymd: number | null): number | null {
  if (ymd === null) return null;
  const year = Math.floor(ymd / 10000);
  const month = Math.floor(ymd / 100) % 100;
  const day = ymd % 100;
  return Math.floor(Date.UTC(year, month - 1, day) / EPOCH_DAY_MS);
}

/** `ymdToEpochDay`의 역변환. */
export function epochDayToYmd(epochDay: number | null): number | null {
  if (epochDay === null) return null;
  const d = new Date(epochDay * EPOCH_DAY_MS);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
