/**
 * 일일 시세 델타 스냅샷 생성 + `snapshot/index.json` 갱신.
 *
 * base(주 1회, `scripts/build-snapshot.mjs`가 올림) + delta(매일, 여기서 올림) 구조 —
 * base는 날짜가 박힌 불변 키라 영구 캐시되고, 매일 무효화되는 건 델타(50KB 안팎)뿐이다.
 * 클라이언트는 index → base + base 이후의 델타들을 병합해 최신 화면을 구성한다.
 */
import type { BondPriceInfoItem } from "@/api";
import { normReal, normText } from "@/lib/openapi/normalize";
import { emptySnapshotIndex, type SnapshotIndex } from "@/lib/snapshot/index-file";
import { snapshotPriceDeltaKey, SNAPSHOT_INDEX_KEY, snapshotBondKey } from "./keys";

/** `src/lib/snapshot/client.ts`가 기존 import 경로(`@/lib/r2/price-delta`)로 계속 쓸 수 있도록 재export. 정본은 `src/lib/snapshot/index-file.ts`. */
export type { SnapshotIndex };

/**
 * 스냅샷 소비자가 필요한 최소 필드만 배열 포맷으로 담는다(키 반복 제거로 페이로드 절감).
 * `src/lib/snapshot/merge.ts`의 `PriceDeltaPayload`가 이 정본을 그대로 참조한다.
 */
export const DELTA_COLUMNS = ["isinCd", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt", "trqu"] as const;

function buildDeltaRow(item: BondPriceInfoItem): (string | number | null)[] {
  return [
    normText(item.isinCd),
    item.mrktCtg,
    normReal(item.clprPrc),
    normReal(item.clprVs),
    normReal(item.clprBnfRt),
    item.trqu === undefined ? null : Number(item.trqu),
  ];
}

/**
 * index.json이 **없을 때만** 빈 인덱스로 취급한다. 파싱 실패(손상된/부분 기록된 JSON)는
 * 그대로 rethrow한다 — 여기서 삼켜서 빈 인덱스를 반환하면 호출부가 그 값을 그대로
 * 덮어써 base 포인터와 누적 델타 목록이 영구 소실된다. 델타 쓰기가 시끄럽게 실패하는
 * 편이 인덱스를 조용히 날리는 것보다 낫다 — 다음 tick에서 재시도된다.
 */
/**
 * `src/lib/snapshot/build.ts`(cron 스냅샷 빌드)도 base 포인터를 갱신할 때 이 함수를
 * 재사용한다 — "파싱 실패는 rethrow" 규약을 두 호출부가 어긋나지 않게 하기 위함.
 *
 * `bondDeltas` 필드는 `bondDeltas` 도입(2026-09) 이후에 생겼다 — 그 전에 올라간 index.json은
 * 이 필드가 아예 없으므로, 존재하지 않으면 빈 배열로 보정한다(구형 오브젝트를 읽고 바로
 * 다시 쓰는 호출부가 그 필드를 날리지 않도록).
 */
export async function readIndex(bucket: R2Bucket): Promise<SnapshotIndex> {
  const obj = await bucket.get(SNAPSHOT_INDEX_KEY);
  if (!obj) return emptySnapshotIndex();
  const parsed = await obj.json<SnapshotIndex>();
  return { ...parsed, bondDeltas: parsed.bondDeltas ?? [] };
}

export async function writePriceDelta(
  bucket: R2Bucket,
  basDt: number,
  items: readonly BondPriceInfoItem[],
): Promise<void> {
  const payload = JSON.stringify({ basDt, columns: DELTA_COLUMNS, rows: items.map(buildDeltaRow) });
  const key = snapshotPriceDeltaKey(basDt);
  await bucket.put(key, payload, { httpMetadata: { contentType: "application/json" } });

  const index = await readIndex(bucket);
  const baseBasDt = index.bond?.basDt ?? 0;
  // base에 이미 포함된 날짜(이하)는 기존 델타뿐 아니라 지금 막 쓴 델타에도 똑같이
  // 적용해야 한다 — 그렇지 않으면 백필/재처리로 basDt <= baseBasDt인 델타를 쓸 때
  // index가 오염된다.
  const deltas =
    basDt > baseBasDt
      ? [
          ...index.priceDeltas.filter((d) => d.basDt > baseBasDt && d.basDt !== basDt),
          { key, basDt, count: items.length },
        ].sort((a, b) => a.basDt - b.basDt)
      : index.priceDeltas.filter((d) => d.basDt > baseBasDt);

  const newIndex: SnapshotIndex = {
    generatedAt: new Date().toISOString(),
    bond: index.bond,
    bondDeltas: index.bondDeltas,
    priceDeltas: deltas,
  };
  await bucket.put(SNAPSHOT_INDEX_KEY, JSON.stringify(newIndex), {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=0, must-revalidate" },
  });
}

/**
 * `scripts/build-snapshot.mjs`(주 1회 로컬 실행)가 새 기준 스냅샷을 올린 뒤 index를
 * 갱신할 때 쓴다. Worker 코드에서는 호출하지 않지만, 키 조립 로직을 한 곳에 두기 위해
 * 여기 함께 둔다.
 */
export function bondSnapshotKeyFor(basDt: number): string {
  return snapshotBondKey(basDt);
}
