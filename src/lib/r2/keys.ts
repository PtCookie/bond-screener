/** R2 오브젝트 키 네이밍. 전부 순수 함수 — 날짜를 `YYYY/MM/DD` 계층으로 쪼개 `wrangler r2 object list --prefix`로 월 단위 탐색이 되게 한다. */

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function splitYmd(basDt: number): { y: string; m: string; d: string } {
  const s = String(basDt);
  return { y: s.slice(0, 4), m: s.slice(4, 6), d: s.slice(6, 8) };
}

/** 원본 응답 아카이브 키. gzip 미적용 — Worker CPU를 아끼려고 원문 그대로 저장한다. */
export function rawArchiveKey(kind: "issu" | "price", basDt: number, pageNo: number): string {
  const { y, m, d } = splitYmd(basDt);
  return `raw/${kind}/${y}/${m}/${d}/p${pad4(pageNo)}.json`;
}

/** 스크리너 기준 스냅샷(주 1회, `scripts/build-snapshot.mjs`가 gzip해서 올림). */
export function snapshotBondKey(basDt: number): string {
  return `snapshot/bond/${basDt}.json.gz`;
}

/** 일일 시세 델타(매일, Worker cron이 올림). */
export function snapshotPriceDeltaKey(basDt: number): string {
  return `snapshot/price/${basDt}.json`;
}

/** 클라이언트가 가장 먼저 받는 포인터 파일. */
export const SNAPSHOT_INDEX_KEY = "snapshot/index.json";
