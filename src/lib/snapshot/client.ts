/**
 * 브라우저에서 `/api/snapshot/*`를 순서대로 호출해 화면용 `ScreenerRow[]`를 만든다.
 * index → base(1회, 불변 캐시) + index가 가리키는 델타들(매일 갱신) → 병합 → 디코드.
 *
 * 압축은 신경 쓸 필요가 없다 — R2에는 평문 JSON을 저장하고 Cloudflare 엣지가 응답이
 * 나갈 때 실제 클라이언트 `Accept-Encoding`에 맞춰 gzip/brotli를 자동 적용한다
 * (`src/lib/r2/keys.ts`의 `snapshotBondKey` 주석 참고). `fetch()`가 그걸 표준 동작으로
 * 알아서 풀어주므로 여기서는 그냥 `res.json()`하면 된다.
 */
import type { SnapshotIndex } from "@/lib/r2/price-delta";
import type { PriceDeltaPayload } from "./merge";
import { mergeBondDeltas, mergePriceDeltas } from "./merge";
import { decodeSnapshot } from "./decode";
import type { SnapshotPayload } from "./format";
import type { BondDeltaPayload } from "./bond-delta";
import type { ScreenerRow } from "@/lib/screener/types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`요청 실패: ${url} (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}

export interface ScreenerSnapshot {
  rows: ScreenerRow[];
  /** bond 정적 필드 기준일. */
  basDt: number;
  /** 시세 컬럼의 기준일(델타 병합 후 최신값). */
  priceBasDt: number | null;
}

export async function fetchScreenerSnapshot(): Promise<ScreenerSnapshot> {
  const index = await fetchJson<SnapshotIndex>("/api/snapshot/index");
  if (!index.bond) throw new Error("스냅샷 index에 base(bond)가 없습니다 — pnpm snapshot 실행 필요");

  const [base, bondDeltas, priceDeltas] = await Promise.all([
    fetchJson<SnapshotPayload>(`/api/snapshot/bond/${index.bond.basDt}`),
    Promise.all(
      (index.bondDeltas ?? []).map((d) => fetchJson<BondDeltaPayload>(`/api/snapshot/bond-delta/${d.basDt}`)),
    ),
    Promise.all(index.priceDeltas.map((d) => fetchJson<PriceDeltaPayload>(`/api/snapshot/price/${d.basDt}`))),
  ]);

  // bond를 먼저 병합해야, 그날 신규 상장된 종목이 있으면 이어지는 price 병합이 그 종목에
  // 시세를 붙일 대상(rowByIsin)을 이미 갖고 있다.
  const merged = mergePriceDeltas(mergeBondDeltas(base, bondDeltas), priceDeltas);
  return { rows: decodeSnapshot(merged), basDt: merged.basDt, priceBasDt: merged.priceBasDt };
}
