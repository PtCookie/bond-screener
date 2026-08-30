/**
 * `/api/bond/[id]/prices`의 컬럼 지향 응답을 lightweight-charts가 먹는 시리즈로 바꾸는
 * 순수 함수 계층. `src/lib/snapshot/decode.ts`가 스냅샷에서 하는 일과 같은 역할.
 *
 * 시장별로 그룹핑해서 반환하는 것이 핵심 — 같은 `basDt`에 KTS·일반채권이 동시에 존재할
 * 수 있는데, lightweight-charts는 한 시리즈 안에서 `time`이 유일·오름차순이어야 한다
 * (중복은 조용히 덮어써지고, 역행하면 무시되거나 throw한다). 섞어 넣으면 안 된다.
 */
import type { BondMarketCategory } from "@/api";
import { epochDayToYmd, ymdToEpochDay } from "@/lib/snapshot/format";

export interface PriceSeriesResponsePayload {
  isinCd: string;
  from: number;
  to: number;
  columns: readonly string[];
  rows: (string | number | null)[][];
  truncated: boolean;
}

/** `time`은 lightweight-charts의 `BusinessDay` 문자열(`"YYYY-MM-DD"`) 형태로 둔다. */
export interface PricePoint {
  time: string;
  basDt: number;
  clprPrc: number | null;
  clprBnfRt: number | null;
}

/**
 * YYYYMMDD 정수를 `"YYYY-MM-DD"`로 바꾼다. `Date`를 거치지 않는다 —
 * `src/lib/screener/format.ts`의 `fmtYmd`와 같은 이유(타임존 경계에서 하루가 밀릴 수 있음).
 */
function ymdToBusinessDay(ymd: number): string {
  const s = String(ymd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * 컬럼 지향 응답을 시장별 `PricePoint[]`(basDt 오름차순)로 분해한다.
 * `clprPrc`/`clprBnfRt`가 둘 다 null인 행은 그릴 값이 없으므로 제외한다.
 * 컬럼 인덱스는 응답의 `columns` 배열에서 찾는다 — `PRICE_SERIES_COLUMNS`
 * (`src/lib/bond/detail.ts`)를 하드코딩 복제하지 않는다.
 */
export function decodePriceSeries(
  payload: Pick<PriceSeriesResponsePayload, "columns" | "rows">,
): Map<BondMarketCategory, PricePoint[]> {
  const { columns, rows } = payload;
  const basDtIdx = columns.indexOf("basDt");
  const mrktCtgIdx = columns.indexOf("mrktCtg");
  const clprPrcIdx = columns.indexOf("clprPrc");
  const clprBnfRtIdx = columns.indexOf("clprBnfRt");
  if (basDtIdx === -1 || mrktCtgIdx === -1 || clprPrcIdx === -1 || clprBnfRtIdx === -1) {
    throw new Error("가격 시계열 응답에 필요한 컬럼(basDt/mrktCtg/clprPrc/clprBnfRt)이 없습니다.");
  }

  const byMarket = new Map<BondMarketCategory, PricePoint[]>();
  for (const row of rows) {
    const basDt = row[basDtIdx] as number;
    const mrktCtg = row[mrktCtgIdx] as BondMarketCategory | null;
    const clprPrc = row[clprPrcIdx] as number | null;
    const clprBnfRt = row[clprBnfRtIdx] as number | null;
    if (mrktCtg === null) continue;
    if (clprPrc === null && clprBnfRt === null) continue;

    const point: PricePoint = { time: ymdToBusinessDay(basDt), basDt, clprPrc, clprBnfRt };
    const existing = byMarket.get(mrktCtg);
    if (existing) existing.push(point);
    else byMarket.set(mrktCtg, [point]);
  }

  // 소스 SQL이 `bas_dt ASC, mrkt_ctg ASC`로 정렬해 내려주지만(`src/lib/d1/price-repo.ts`),
  // 이 함수 자체의 계약으로 오름차순을 보장한다 — 호출부가 정렬 가정을 믿을 수 있게.
  for (const points of byMarket.values()) points.sort((a, b) => a.basDt - b.basDt);

  return byMarket;
}

/** 상세 페이지 기간 필터 프리셋. */
export const RANGE_PRESETS = ["1M", "3M", "6M", "1Y", "3Y"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const RANGE_PRESET_DAYS: Readonly<Record<RangePreset, number>> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "3Y": 1095,
};

/**
 * 프리셋을 `{from, to}`(YYYYMMDD)로 변환한다. `to`는 항상 오늘, `from`은 `to`에서
 * 프리셋 일수만큼 뺀 날짜 — epoch day 산술만 쓴다(`Date` 직접 연산 금지,
 * `src/lib/api/params.ts`의 `parseDateRange`와 같은 이유).
 */
export function presetToRange(preset: RangePreset, todayYmd: number): { from: number; to: number } {
  const toEpochDay = ymdToEpochDay(todayYmd) as number;
  const from = epochDayToYmd(toEpochDay - RANGE_PRESET_DAYS[preset]) as number;
  return { from, to: todayYmd };
}
