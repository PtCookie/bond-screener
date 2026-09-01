/**
 * `snapshot/index.json` 스키마 + base(bond) 포인터 갱신 로직.
 *
 * `scripts/build-snapshot.mjs`가 상대 경로로 직접 import하므로(Node 24.18.0의 type
 * stripping으로 `.ts`를 그대로 실행) `format.ts`/`encode.ts`와 같은 이유로 `@/` 경로
 * 별칭을 쓰지 않는다. Worker cron 경로(`src/lib/snapshot/build.ts`)와 스크립트가 이
 * 파일 한 벌을 공유해, base 갱신 시 "이 basDt 이하 델타는 정리한다" 규칙이 두 경로에서
 * 어긋나지 않게 한다.
 */

/** `src/lib/snapshot/client.ts`가 클라이언트에서 fetch할 때도 그대로 쓰는 index.json 스키마. */
export interface SnapshotIndex {
  generatedAt: string;
  bond: { key: string; basDt: number; count: number } | null;
  priceDeltas: { key: string; basDt: number; count: number }[];
}

/** index.json 오브젝트가 아직 없을 때(최초 실행)의 초기값. */
export function emptySnapshotIndex(): SnapshotIndex {
  return { generatedAt: new Date(0).toISOString(), bond: null, priceDeltas: [] };
}

/**
 * 새 base(bond) 스냅샷을 index에 반영한다. base가 이미 그 시점을 반영하므로, base
 * basDt 이하의 기존 델타는 더 이상 병합할 필요가 없어 정리한다 — `writePriceDelta`가
 * 델타를 추가할 때 적용하는 것과 동일한 규칙을 base 쪽에서 적용하는 것이다
 * (`src/lib/r2/price-delta.ts` 참고).
 */
export function applyBondSnapshotToIndex(
  index: SnapshotIndex,
  bond: { key: string; basDt: number; count: number },
): SnapshotIndex {
  return {
    generatedAt: new Date().toISOString(),
    bond,
    priceDeltas: index.priceDeltas.filter((d) => d.basDt > bond.basDt),
  };
}
