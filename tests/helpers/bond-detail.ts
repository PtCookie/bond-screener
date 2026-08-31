/**
 * 상세 페이지 컴포넌트 테스트용 `BondDetailApiResponse` 픽스처.
 *
 * `tests/bond-detail.test.ts`가 단위로 덮는 `toBondDetailResponse` 변환 파이프라인을
 * 그대로 통과시켜 만든다 — snake_case D1 행을 손으로 camelCase 흉내내지 않으므로
 * 필드 형태가 항상 실제 API 응답과 일치한다.
 */
import type { BondDetailSource } from "@/lib/d1/detail-repo";
import { BOND_COLUMNS, BOND_PRICE_COLUMNS, BOND_STATE_COLUMNS, type BondRowRecord } from "@/lib/bond/columns";
import { toBondDetailResponse, type BondDetailApiResponse } from "@/lib/bond/detail";

const DEFAULT_ISIN = "KR6000011D36";

type BondStateRecord = Record<(typeof BOND_STATE_COLUMNS)[number], string | number | null>;
type BondPriceRecord = Record<(typeof BOND_PRICE_COLUMNS)[number], string | number | null>;

export function buildBondRowRecord(overrides: Partial<BondRowRecord> = {}): BondRowRecord {
  const base = Object.fromEntries(BOND_COLUMNS.map((c) => [c, null])) as unknown as BondRowRecord;
  return { ...base, isin_cd: DEFAULT_ISIN, isin_cd_nm: "테스트채권", bond_isur_nm: "테스트발행사", ...overrides };
}

export function buildStateRow(overrides: Partial<BondStateRecord> = {}): BondStateRecord {
  const base = Object.fromEntries(BOND_STATE_COLUMNS.map((c) => [c, null])) as BondStateRecord;
  return { ...base, isin_cd: DEFAULT_ISIN, valid_from: 20260101, ...overrides };
}

export function buildPriceRow(overrides: Partial<BondPriceRecord> = {}): BondPriceRecord {
  const base = Object.fromEntries(BOND_PRICE_COLUMNS.map((c) => [c, null])) as BondPriceRecord;
  return { ...base, isin_cd: DEFAULT_ISIN, bas_dt: 20260828, mrkt_ctg: 2, ...overrides };
}

export interface BondDetailFixtureOptions {
  isinCd?: string;
  srtnCd?: string | null;
  bond?: Partial<BondRowRecord>;
  /** 기본값 1건(현재 유효 행). 빈 배열을 넘기면 이력 없음(state: null) 케이스가 된다. */
  stateHistory?: Partial<BondStateRecord>[];
  /** 기본값 1건(일반채권 시세). 빈 배열을 넘기면 시세 없음 케이스가 된다. */
  latestPrices?: Partial<BondPriceRecord>[];
  codeLabels?: Map<string, string>;
}

export function makeBondDetailResponse(options: BondDetailFixtureOptions = {}): BondDetailApiResponse {
  const isinCd = options.isinCd ?? DEFAULT_ISIN;
  const stateHistory = options.stateHistory ?? [{}];
  const latestPrices = options.latestPrices ?? [{}];

  const source: BondDetailSource = {
    bond: buildBondRowRecord({ isin_cd: isinCd, ...options.bond }),
    stateHistory: stateHistory.map((s) => buildStateRow({ isin_cd: isinCd, ...s })),
    latestPrices: latestPrices.map((p) => buildPriceRow({ isin_cd: isinCd, ...p })),
    codeLabels: options.codeLabels ?? new Map(),
  };

  return {
    isinCd,
    srtnCd: options.srtnCd ?? null,
    ...toBondDetailResponse(source),
  };
}
