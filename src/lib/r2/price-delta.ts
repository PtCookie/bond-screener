/**
 * 일일 시세 델타 스냅샷 생성 + `snapshot/index.json` 갱신.
 *
 * base(주 1회, `scripts/build-snapshot.mjs`가 올림) + delta(매일, 여기서 올림) 구조 —
 * base는 날짜가 박힌 불변 키라 영구 캐시되고, 매일 무효화되는 건 델타(50KB 안팎)뿐이다.
 * 클라이언트는 index → base + base 이후의 델타들을 병합해 최신 화면을 구성한다.
 */
import type { BondPriceInfoItem } from "@/api";
import { normReal, normText } from "@/lib/openapi/normalize";
import { snapshotPriceDeltaKey, SNAPSHOT_INDEX_KEY, snapshotBondKey } from "./keys";

/** 스냅샷 소비자가 필요한 최소 필드만 배열 포맷으로 담는다(키 반복 제거로 페이로드 절감). */
const DELTA_COLUMNS = ["isinCd", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt", "trqu"] as const;

interface SnapshotIndex {
  generatedAt: string;
  bond: { key: string; basDt: number; count: number } | null;
  priceDeltas: { key: string; basDt: number; count: number }[];
}

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

async function readIndex(bucket: R2Bucket): Promise<SnapshotIndex> {
  const obj = await bucket.get(SNAPSHOT_INDEX_KEY);
  if (!obj) return { generatedAt: new Date(0).toISOString(), bond: null, priceDeltas: [] };
  try {
    return await obj.json<SnapshotIndex>();
  } catch {
    return { generatedAt: new Date(0).toISOString(), bond: null, priceDeltas: [] };
  }
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
  const deltas = [
    ...index.priceDeltas.filter((d) => d.basDt > baseBasDt && d.basDt !== basDt),
    { key, basDt, count: items.length },
  ].sort((a, b) => a.basDt - b.basDt);

  const newIndex: SnapshotIndex = { generatedAt: new Date().toISOString(), bond: index.bond, priceDeltas: deltas };
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
