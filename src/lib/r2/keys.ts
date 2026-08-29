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

/**
 * 스크리너 기준 스냅샷(주 1회, `scripts/build-snapshot.mjs`가 올림). 압축 없이 평문
 * JSON으로 저장한다 — Cloudflare 엣지가 `application/json` 같은 압축 가능한 컨텐츠는
 * 응답이 나갈 때 실제 클라이언트 `Accept-Encoding` 기준으로 gzip/brotli를 자동
 * 적용하므로(Worker CPU와 무관한 네트워크 계층 기능), Worker가 직접 압축 변형을
 * 들고 있다가 골라 서빙할 이유가 없다.
 *
 * 처음에는 R2에 `.json.gz`/`.json.br` 두 벌을 올려두고 `/api/snapshot/*` 라우트가
 * `Accept-Encoding`을 보고 골라 서빙하도록 만들었으나, 로컬 dev(Miniflare 기반
 * Workers 런타임)에서 실측한 결과 (1) `request.headers.get("accept-encoding")`은
 * Cloudflare가 항상 정규화한 값("br, gzip")만 보여줘 실제 클라이언트 능력과 무관했고
 * (2) `R2Object.writeHttpMetadata()`로 넘긴 `Content-Encoding` 헤더도 응답에서
 * 사라졌다 — 즉 그 설계는 애초에 동작하지 않았다. 실제 클라이언트 능력은
 * `request.cf.clientAcceptEncoding`에 들어있지만, 이걸 굳이 읽어 처리하는 것보다
 * 엣지의 기본 자동 압축에 맡기는 편이 코드도 적고 더 안전하다.
 */
export function snapshotBondKey(basDt: number): string {
  return `snapshot/bond/${basDt}.json`;
}

/** 일일 시세 델타(매일, Worker cron이 올림). */
export function snapshotPriceDeltaKey(basDt: number): string {
  return `snapshot/price/${basDt}.json`;
}

/** 클라이언트가 가장 먼저 받는 포인터 파일. */
export const SNAPSHOT_INDEX_KEY = "snapshot/index.json";
