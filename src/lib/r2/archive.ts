/** 원본 응답 아카이브 키 헬퍼. `env.ARCHIVE.put()`은 호출부(issu-sync.ts/price-sync.ts)에서 직접 한다. */
import { rawArchiveKey } from "./keys";

export function archiveRawResponse(kind: "issu" | "price", basDt: number, pageNo: number): string {
  return rawArchiveKey(kind, basDt, pageNo);
}
