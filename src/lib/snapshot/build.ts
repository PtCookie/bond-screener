/**
 * cron이 호출하는 스크리너 목록 스냅샷 빌드. `scripts/build-snapshot.mjs`(로컬/수동)와
 * 같은 산출물을 내야 하므로 인코더(`createSnapshotBuilder`)·index 갱신
 * (`applyBondSnapshotToIndex`) 정본을 그대로 재사용하고, 이 파일은 D1 청크 조회 →
 * 빌더 투입 → R2 업로드 순서만 오케스트레이션한다.
 *
 * Workers Paid로 CPU 예산(10ms → 30초)은 넉넉해졌지만 **isolate 메모리 128MB는 그대로다**
 * (Free/Paid 공통 제약, `AGENTS.md` 참고). `bond`/`bond_state`/`bond_price` 전체를 한 번에
 * `all()`하지 않고 `src/lib/d1/snapshot-repo.ts`의 키셋 페이지네이션으로 청크 단위로 읽어
 * 빌더에 흘려 넣는다 — 로컬 실측(29,079행 전량 객체화)이 peak heap ~85MB였던 것에 비춰,
 * 청크 크기를 좁게 유지하면 이 경로의 메모리 사용량은 청크 1개 + 누적 컬럼 배열 수준으로
 * 줄어든다.
 */
import { createSnapshotBuilder } from "./encode";
import { applyBondSnapshotToIndex } from "./index-file";
import { readSnapshotBondPage, readSnapshotCodeLabels, readSnapshotLatestPricePage } from "@/lib/d1/snapshot-repo";
import { readIndex } from "@/lib/r2/price-delta";
import { SNAPSHOT_INDEX_KEY, snapshotBondKey } from "@/lib/r2/keys";

/** 청크당 행 수. bond/latest-price 각각 이 크기로 D1 왕복 — 29,079행 기준 6쿼리씩. */
export const SNAPSHOT_CHUNK_SIZE = 5000;

export interface SnapshotBuildEnv {
  DB: D1Database;
  ARCHIVE: R2Bucket;
}

export interface SnapshotBuildResult {
  basDt: number;
  bondCount: number;
  priceCount: number;
  bytes: number;
}

/**
 * 전체 스냅샷을 빌드해 R2(`snapshot/bond/{basDt}.json`)에 올리고 `index.json`의 base
 * 포인터를 갱신한다. `bond` 행이 하나도 없으면(운영에서는 나타나지 않아야 하는 상태)
 * `basDt=0`짜리 스냅샷을 만들지 않도록 에러를 던진다.
 *
 * @param targetBasDt 스냅샷의 basDt로 못박을 "수집 대상" basDt(호출자의 issu run이 그 날
 *   조회한 basDt). `builder.finish()`가 기본으로 계산하는 `MAX(bond.last_chg_bas_dt)`를
 *   쓰지 않는 이유: 그날 bond 정적 필드가 하나도 안 바뀌었으면(흔함 — 신용등급/잔액 같은
 *   `bond_state`만 바뀐 날도 있다) 두 값이 어긋나 R2 키·`app_meta.snapshot_bas_dt`·
 *   `planTick`의 basDt 비교가 서로 다른 날짜를 가리키게 된다. 그러면 (a) planTick이 매
 *   tick마다 "아직 이 basDt로 스냅샷 안 만듦"으로 오판해 cron 창 내내 재빌드하거나,
 *   (b) `bond_state`만 바뀐 날은 그 전날과 같은 R2 키에 다른 내용을 쓰게 되는데 그 키는
 *   `immutable` 캐시라 클라이언트가 새 내용을 영영 못 받는다.
 */
export async function buildAndPutSnapshot(env: SnapshotBuildEnv, targetBasDt: number): Promise<SnapshotBuildResult> {
  const builder = createSnapshotBuilder();

  let bondCount = 0;
  let cursor = "";
  for (;;) {
    const page = await readSnapshotBondPage(env.DB, cursor, SNAPSHOT_CHUNK_SIZE);
    if (page.length === 0) break;
    for (const row of page) builder.addBondRow(row);
    bondCount += page.length;
    cursor = page[page.length - 1].isin_cd;
    if (page.length < SNAPSHOT_CHUNK_SIZE) break;
  }

  if (bondCount === 0) {
    throw new Error("스냅샷 빌드 중단: bond 테이블에 행이 없습니다");
  }

  let priceCount = 0;
  cursor = "";
  for (;;) {
    const page = await readSnapshotLatestPricePage(env.DB, cursor, SNAPSHOT_CHUNK_SIZE);
    if (page.length === 0) break;
    for (const row of page) builder.addPriceRow(row);
    priceCount += page.length;
    // 페이지 크기가 청크 미만이면 마지막 페이지지만, 한 isin_cd가 KTS·일반채권 두 행으로
    // 나올 수 있어(0001_init.sql의 bond_price PK 주석) 행 수만으로는 "청크가 꽉 찼는지"를
    // 못 가른다 — 커서는 항상 이 페이지의 마지막 isin_cd로 전진시키고, 종료 판단은 서브쿼리가
    // 반환한 고유 isin_cd 수(=페이지 내 서로 다른 isin_cd 개수)로 한다.
    const distinctIsinCds = new Set(page.map((r) => r.isin_cd)).size;
    cursor = page[page.length - 1].isin_cd;
    if (distinctIsinCds < SNAPSHOT_CHUNK_SIZE) break;
  }

  const codeLabelRows = await readSnapshotCodeLabels(env.DB);
  builder.setCodeLabels(codeLabelRows);

  const payload = builder.finish(targetBasDt);
  const json = JSON.stringify(payload);
  const key = snapshotBondKey(payload.basDt);

  await env.ARCHIVE.put(key, json, { httpMetadata: { contentType: "application/json" } });

  const index = await readIndex(env.ARCHIVE);
  const newIndex = applyBondSnapshotToIndex(index, { key, basDt: payload.basDt, count: bondCount });
  await env.ARCHIVE.put(SNAPSHOT_INDEX_KEY, JSON.stringify(newIndex), {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=0, must-revalidate" },
  });

  return { basDt: payload.basDt, bondCount, priceCount, bytes: json.length };
}
