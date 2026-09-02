/**
 * base 스냅샷의 종목별 최신 시세에 일일 델타(`src/lib/r2/price-delta.ts`가 매일 올리는
 * `snapshot/price/{basDt}.json`)를 basDt 오름차순으로 덮어써 병합한다. base 이후 여러
 * 영업일의 델타가 쌓여 있어도(스냅샷 빌드를 며칠 걸렀을 때) 최신 델타가 항상 이긴다.
 *
 * 델타의 `mrktCtg`는 `BondMarketCategory` 문자열("KTS" 등, 오픈API 원문 그대로)이라
 * base가 쓰는 정수 코드(`src/lib/bond/market.ts`)로 변환해서 합친다 — 두 소스의 시장구분
 * 표현이 원래 다르다(base는 D1 저장 포맷, 델타는 API 응답 포맷 그대로).
 */
import type { BondMarketCategory } from "@/api";
import { marketCategoryToCode } from "@/lib/bond/market";
import { DELTA_COLUMNS } from "@/lib/r2/price-delta";
import {
  SNAPSHOT_BOND_COLUMNS,
  SNAPSHOT_PRICE_COLUMNS,
  ymdToEpochDay,
  type SnapshotCell,
  type SnapshotPayload,
} from "./format";
import type { BondDeltaPayload } from "./bond-delta";

/** `src/lib/r2/price-delta.ts`의 `writePriceDelta`가 쓰는 것과 정확히 같은 모양(`DELTA_COLUMNS` 정본 재사용). */
export interface PriceDeltaPayload {
  basDt: number;
  columns: typeof DELTA_COLUMNS;
  rows: readonly (string | number | null)[][];
}

export function mergePriceDeltas(base: SnapshotPayload, deltas: readonly PriceDeltaPayload[]): SnapshotPayload {
  if (deltas.length === 0) return base;

  const rowByIsin = new Map<string, number>();
  base.priceIsinCds.forEach((isinCd, i) => rowByIsin.set(isinCd, i));
  const basDtCol = SNAPSHOT_PRICE_COLUMNS.indexOf("bas_dt");

  // base 배열은 얕은 복사로 새로 만든다 — 호출부가 캐시해 둔 base 객체를 변형하지 않는다.
  const priceIsinCds = [...base.priceIsinCds];
  const priceCols: SnapshotCell[][] = base.priceCols.map((col) => [...col]);
  let priceBasDt = base.priceBasDt;

  for (const delta of [...deltas].sort((a, b) => a.basDt - b.basDt)) {
    const deltaIndex = Object.fromEntries(delta.columns.map((c, i) => [c, i]));
    const deltaBasDtEpoch = ymdToEpochDay(delta.basDt);
    let anyRowApplied = false;

    for (const dRow of delta.rows) {
      const isinCd = dRow[deltaIndex.isinCd] as string;
      const mrktCtgLabel = dRow[deltaIndex.mrktCtg] as BondMarketCategory;

      const existingRow = rowByIsin.get(isinCd);
      if (existingRow !== undefined) {
        // 이미 그 종목에 더 최신(또는 같은) bas_dt 값이 들어있으면 건너뛴다 — base가 이미
        // 델타보다 최신인 경우(스냅샷 빌드 직후 지연 도착한 옛 델타)나, 같은 델타 세트 안에
        // basDt가 뒤섞여 들어온 경우를 방어한다.
        const currentBasDt = priceCols[basDtCol][existingRow];
        if (typeof currentBasDt === "number" && currentBasDt >= (deltaBasDtEpoch ?? -Infinity)) continue;
      }

      const values = SNAPSHOT_PRICE_COLUMNS.map((col): SnapshotCell => {
        switch (col) {
          case "bas_dt":
            return deltaBasDtEpoch;
          case "mrkt_ctg":
            return marketCategoryToCode(mrktCtgLabel);
          case "clpr_prc":
            return dRow[deltaIndex.clprPrc] as number | null;
          case "clpr_vs":
            return dRow[deltaIndex.clprVs] as number | null;
          case "clpr_bnf_rt":
            return dRow[deltaIndex.clprBnfRt] as number | null;
          case "trqu":
            return dRow[deltaIndex.trqu] as number | null;
        }
      });

      if (existingRow === undefined) {
        const newRow = priceIsinCds.length;
        priceIsinCds.push(isinCd);
        rowByIsin.set(isinCd, newRow);
        values.forEach((v, i) => priceCols[i].push(v));
      } else {
        values.forEach((v, i) => (priceCols[i][existingRow] = v));
      }
      anyRowApplied = true;
    }

    // 이 델타의 행이 전부 건너뛰어졌으면(오래된 델타) priceBasDt를 갱신하지 않는다 —
    // 메타데이터가 실제 반영된 데이터보다 앞서가는 것을 막는다.
    if (anyRowApplied && (priceBasDt === null || delta.basDt > priceBasDt)) priceBasDt = delta.basDt;
  }

  return { ...base, priceIsinCds, priceCols, priceBasDt };
}

/**
 * base 스냅샷의 `bond` 정적 컬럼에 일일 bond 델타(`src/lib/snapshot/bond-delta.ts`가 매일
 * 올리는 `snapshot/bond-delta/{basDt}.json`)를 basDt 오름차순으로 덮어써 병합한다.
 *
 * 델타 한 행은(시세 델타와 달리) 변경된 필드만이 아니라 그 종목의 **그날 현재 전체
 * 상태**를 담는다(`readChangedBondRows`가 D1에서 그대로 재조회한 값) — 그래서 같은
 * 종목에 여러 날짜의 델타가 있어도 basDt 오름차순으로 그냥 덮어쓰기만 하면 항상
 * 최신 상태가 남는다(시세 병합처럼 "이미 더 최신 값인지" 필드 단위로 비교할 필요가 없다).
 *
 * `bond_isur_nm`은 델타에 원문 문자열로 실려 있다(base처럼 사전 인덱스가 아님, 델타는
 * base의 `issuers` 사전을 모르므로) — 여기서 `issuers` 배열에 인턴한다.
 */
export function mergeBondDeltas(base: SnapshotPayload, deltas: readonly BondDeltaPayload[]): SnapshotPayload {
  if (deltas.length === 0) return base;

  const isinColIdx = SNAPSHOT_BOND_COLUMNS.indexOf("isin_cd");
  const issuerColIdx = SNAPSHOT_BOND_COLUMNS.indexOf("bond_isur_nm");

  const rowByIsin = new Map<string, number>();
  base.cols[isinColIdx].forEach((isinCd, i) => rowByIsin.set(isinCd as string, i));

  // 얕은 복사 — 호출부가 캐시해 둔 base 객체를 변형하지 않는다(mergePriceDeltas와 동일 규약).
  const cols: SnapshotCell[][] = base.cols.map((col) => [...col]);
  const issuers = [...base.issuers];
  const issuerIndex = new Map<string, number>(issuers.map((name, i) => [name, i]));
  function internIssuer(name: string): number {
    const existing = issuerIndex.get(name);
    if (existing !== undefined) return existing;
    const idx = issuers.length;
    issuers.push(name);
    issuerIndex.set(name, idx);
    return idx;
  }

  let basDt = base.basDt;
  let codeLabels = base.codeLabels;

  for (const delta of [...deltas].sort((a, b) => a.basDt - b.basDt)) {
    const deltaColIndex = Object.fromEntries(delta.columns.map((c, i) => [c, i]));

    for (const dRow of delta.rows) {
      const isinCd = dRow[deltaColIndex.isin_cd] as string;

      const values = SNAPSHOT_BOND_COLUMNS.map((col, i): SnapshotCell => {
        if (i === issuerColIdx) return internIssuer(dRow[deltaColIndex.bond_isur_nm] as string);
        return dRow[deltaColIndex[col]];
      });

      const existingRow = rowByIsin.get(isinCd);
      if (existingRow === undefined) {
        const newRow = cols[isinColIdx].length;
        rowByIsin.set(isinCd, newRow);
        values.forEach((v, i) => cols[i].push(v));
      } else {
        values.forEach((v, i) => (cols[i][existingRow] = v));
      }
    }

    // 델타는 항상 code_label 전량을 싣는다 — 최신 델타 것으로 통째로 교체한다.
    codeLabels = delta.codeLabels;
    if (delta.basDt > basDt) basDt = delta.basDt;
  }

  return { ...base, cols, issuers, codeLabels, basDt };
}
