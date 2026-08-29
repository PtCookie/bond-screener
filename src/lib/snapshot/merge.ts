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
import { SNAPSHOT_PRICE_COLUMNS, ymdToEpochDay, type SnapshotCell, type SnapshotPayload } from "./format";

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
