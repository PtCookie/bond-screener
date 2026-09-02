/**
 * `src/lib/snapshot/bond-delta.ts`(일일 bond 델타 빌드) 회귀 테스트. 실제 D1(workerd)에
 * `writeBondPage`로 상태를 만들고, `SNAPSHOT_BOND_CHANGED_SQL`의 두 갈래 조건
 * (`b.last_chg_bas_dt = ?1 OR s.valid_from = ?1`)이 각각 정적 필드 변경/상태(등급·잔액)
 * 변경을 잡아내는지 확인한다.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { buildAndPutBondDelta, type BondDeltaPayload } from "@/lib/snapshot/bond-delta";
import { snapshotBondDeltaKey, SNAPSHOT_INDEX_KEY } from "@/lib/r2/keys";
import type { SnapshotIndex } from "@/lib/r2/price-delta";
import { BOND_DELTA_MAX_ROWS } from "@/lib/sync/config";
import { buildIssuItem, buildIssuItems } from "./helpers/envelope";
import { resetD1 } from "./helpers/reset-d1";
import { notNull } from "./helpers/assert";

beforeEach(resetD1);

const BAS1 = 20260818;
const BAS2 = 20260819;
const BAS3 = 20260820;

describe("buildAndPutBondDelta", () => {
  test("bond 정적 필드가 바뀐 종목만 잡는다(last_chg_bas_dt 경로)", async () => {
    const isinCd = "KR_STATIC_CHANGE01";
    await writeBondPage(env.DB, [buildIssuItem({ isinCd, basDt: String(BAS1), bondSrfcInrt: "3.5" })], BAS1);
    // 다른 종목 — BAS2에는 손대지 않는다(델타에 섞이면 안 됨).
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: "KR_UNTOUCHED01", basDt: String(BAS1) })], BAS1);

    // 표면이율만 바꿔 bond 정적 필드 변경(지문 변경)을 일으킨다 — bond_state 값은 그대로다.
    await writeBondPage(env.DB, [buildIssuItem({ isinCd, basDt: String(BAS2), bondSrfcInrt: "4.0" })], BAS2);

    const result = await buildAndPutBondDelta(env, BAS2);
    expect(result.tooLarge).toBe(false);
    if (result.tooLarge) throw new Error("unreachable");
    expect(result.count).toBe(1);

    const obj = await env.ARCHIVE.get(snapshotBondDeltaKey(BAS2));
    const payload = await notNull(obj).json<BondDeltaPayload>();
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0][payload.columns.indexOf("isin_cd")]).toBe(isinCd);
    expect(payload.rows[0][payload.columns.indexOf("bond_srfc_inrt")]).toBe(4.0);
  });

  test("bond_state(등급·잔액)만 바뀐 종목도 잡는다(valid_from 경로, bond 정적 필드는 그대로)", async () => {
    const isinCd = "KR_STATE_CHANGE01";
    await writeBondPage(env.DB, [buildIssuItem({ isinCd, basDt: String(BAS1), bondBal: "1000000000" })], BAS1);

    // bond 정적 필드는 그대로 두고 bondBal(bond_state)만 바꾼다 — bond의 fp는 그대로라
    // last_chg_bas_dt는 BAS1에 머물지만, bond_state는 새 valid_from=BAS3 행이 생긴다.
    await writeBondPage(env.DB, [buildIssuItem({ isinCd, basDt: String(BAS3), bondBal: "2000000000" })], BAS3);

    const result = await buildAndPutBondDelta(env, BAS3);
    expect(result.tooLarge).toBe(false);
    if (result.tooLarge) throw new Error("unreachable");
    expect(result.count).toBe(1);

    const obj = await env.ARCHIVE.get(snapshotBondDeltaKey(BAS3));
    const payload = await notNull(obj).json<BondDeltaPayload>();
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0][payload.columns.indexOf("isin_cd")]).toBe(isinCd);
    expect(payload.rows[0][payload.columns.indexOf("bond_bal")]).toBe(2_000_000_000);
  });

  test("변경분이 없으면 델타를 쓰지 않는다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: "KR_NOOP01", basDt: String(BAS1) })], BAS1);

    const result = await buildAndPutBondDelta(env, BAS2); // BAS2엔 아무 변경도 없음
    expect(result).toEqual({ tooLarge: false, basDt: BAS2, count: 0, bytes: 0 });
    expect(await env.ARCHIVE.get(snapshotBondDeltaKey(BAS2))).toBeNull();
  });

  test("index.json의 bondDeltas에 항목을 추가한다", async () => {
    await writeBondPage(env.DB, [buildIssuItem({ isinCd: "KR_IDX01", basDt: String(BAS1) })], BAS1);

    const result = await buildAndPutBondDelta(env, BAS1);
    expect(result.tooLarge).toBe(false);

    const indexObj = await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY);
    const index = await notNull(indexObj).json<SnapshotIndex>();
    expect(index.bondDeltas).toEqual([{ key: snapshotBondDeltaKey(BAS1), basDt: BAS1, count: 1 }]);
  });

  test(`변경 행이 BOND_DELTA_MAX_ROWS(${BOND_DELTA_MAX_ROWS})를 넘으면 델타를 쓰지 않고 tooLarge를 반환한다`, async () => {
    const items = buildIssuItems(BOND_DELTA_MAX_ROWS + 1, String(BAS1));
    await writeBondPage(env.DB, items, BAS1);

    const result = await buildAndPutBondDelta(env, BAS1);
    expect(result).toEqual({ tooLarge: true });
    expect(await env.ARCHIVE.get(snapshotBondDeltaKey(BAS1))).toBeNull();
    expect(await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY)).toBeNull();
  });
});
