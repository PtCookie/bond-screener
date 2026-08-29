/**
 * 종목 상세 조회용 읽기 전용 D1 리포지토리. `bond-repo.ts`는 cron 쓰기 경로 전용이라
 * 섞지 않는다.
 */
import {
  CODE_LABEL_DOMAINS,
  type BondColumn,
  type BondPriceRowRecord,
  type BondRowRecord,
  type BondStateRowRecord,
} from "@/lib/bond/columns";
import {
  BOND_BY_ISIN_SQL,
  BOND_ISIN_BY_SRTN_SQL,
  BOND_LATEST_PRICE_SQL,
  BOND_STATE_HISTORY_SQL,
  CODE_LABEL_BY_PAIRS_SQL,
} from "./sql";

/** URL 경로 세그먼트가 12자리 ISIN인지 9자리 단축코드인지를 표현한다 (`src/lib/api/params.ts`의 `parseBondRef`가 만든다). */
export type BondRef = { kind: "isin"; value: string } | { kind: "srtn"; value: string };

export interface BondDetailSource {
  bond: BondRowRecord;
  /** `valid_from` 내림차순 — `[0]`이 현재 유효 행(있다면). */
  stateHistory: BondStateRowRecord[];
  /** 최신 `bas_dt` 하루치. 같은 날 KTS·일반채권 두 시장에 동시 존재하면 여러 행. */
  latestPrices: BondPriceRowRecord[];
  /** `${domain}:${code}` → label. `bond`에 실제 등장한 코드만 담는다. */
  codeLabels: Map<string, string>;
}

/** `BondRef`를 실제 `isin_cd`로 해석한다. ISIN이면 조회 없이 그대로 반환. */
export async function resolveIsinCd(db: D1Database, ref: BondRef): Promise<string | null> {
  if (ref.kind === "isin") return ref.value;
  const row = await db.prepare(BOND_ISIN_BY_SRTN_SQL).bind(ref.value).first<{ isin_cd: string }>();
  return row?.isin_cd ?? null;
}

/**
 * 종목 상세 전체를 모은다. `bond`/`bond_state` 이력/최신시세를 `db.batch`로 묶어
 * 라운드트립 1회로 받고, 그 결과에 실제 등장한 코드만 골라 `code_label`을 조회 1회 더
 * 날린다 — isinCd 해석까지 포함해 요청당 D1 쿼리 3~4개 / 라운드트립 2~3회.
 */
export async function fetchBondDetail(db: D1Database, isinCd: string): Promise<BondDetailSource | null> {
  const [bondResult, stateResult, priceResult] = await db.batch<Record<string, string | number | null>>([
    db.prepare(BOND_BY_ISIN_SQL).bind(isinCd),
    db.prepare(BOND_STATE_HISTORY_SQL).bind(isinCd),
    db.prepare(BOND_LATEST_PRICE_SQL).bind(isinCd),
  ]);

  const bond = bondResult.results[0] as BondRowRecord | undefined;
  if (!bond) return null;

  const stateHistory = stateResult.results as BondStateRowRecord[];
  const latestPrices = priceResult.results as BondPriceRowRecord[];

  const codePairs: [string, string][] = [];
  for (const [column, domain] of Object.entries(CODE_LABEL_DOMAINS) as [BondColumn, string][]) {
    const code = bond[column] as string | null;
    if (code !== null) codePairs.push([domain, code]);
  }

  const codeLabels = new Map<string, string>();
  if (codePairs.length > 0) {
    const rows = await db
      .prepare(CODE_LABEL_BY_PAIRS_SQL)
      .bind(JSON.stringify(codePairs))
      .all<{ domain: string; code: string; label: string }>();
    for (const r of rows.results) codeLabels.set(`${r.domain}:${r.code}`, r.label);
  }

  return { bond, stateHistory, latestPrices, codeLabels };
}
