/**
 * `src/lib/snapshot/build.ts`(cron 스냅샷 빌드, D1 청크 페이지네이션) 회귀 테스트.
 *
 * 핵심 검증은 "청크로 나눠 읽어 `createSnapshotBuilder()`에 흘려 넣은 결과"와 "한 번에
 * 다 읽어 `encodeSnapshot()`(같은 빌더를 감싼 예전 API)에 넘긴 결과"가 바이트 동일한지다
 * — 두 경로가 어긋나면 스크리너 화면과 `pnpm snapshot`(로컬/수동 폴백) 산출물이 갈린다.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { writeBondPricePage } from "@/lib/d1/price-repo";
import { buildAndPutSnapshot } from "@/lib/snapshot/build";
import { encodeSnapshot } from "@/lib/snapshot/encode";
import { readSnapshotBondPage, readSnapshotCodeLabels, readSnapshotLatestPricePage } from "@/lib/d1/snapshot-repo";
import { snapshotBondKey, SNAPSHOT_INDEX_KEY } from "@/lib/r2/keys";
import { writePriceDelta, type SnapshotIndex } from "@/lib/r2/price-delta";
import type { SnapshotPayload } from "@/lib/snapshot/format";
import { buildIssuItems, buildPriceItems } from "./helpers/envelope";
import { resetD1 } from "./helpers/reset-d1";
import { notNull } from "./helpers/assert";

beforeEach(resetD1);

const BAS_DT = 20260828;

describe("buildAndPutSnapshot", () => {
  test("청크 페이지네이션 경로가 encodeSnapshot() 전량 경로와 바이트 동일한 산출물을 낸다", async () => {
    const issuItems = buildIssuItems(12, String(BAS_DT));
    await writeBondPage(env.DB, issuItems, BAS_DT);

    // 최신 시세는 종목 절반에만 존재하는 상태를 재현(priceIsinCds가 bond 전체의 부분집합인
    // 정상 케이스) — issuItems의 isin_cd를 그대로 재사용해 조인이 맞물리게 한다.
    const priceItems = buildPriceItems(6, String(BAS_DT)).map((item, i) => ({
      ...item,
      isinCd: issuItems[i].isinCd,
      srtnCd: `S${String(i).padStart(8, "0")}`,
    }));
    await writeBondPricePage(env.DB, priceItems);

    const result = await buildAndPutSnapshot(env);
    expect(result.bondCount).toBe(12);
    expect(result.priceCount).toBe(6);

    const bondObj = await env.ARCHIVE.get(snapshotBondKey(result.basDt));
    const workerPayload = await notNull(bondObj).json<SnapshotPayload>();

    // 같은 D1 상태를 전량 조회해 encodeSnapshot()으로 직접 인코딩한 것과 비교한다.
    const bondRows = await readSnapshotBondPage(env.DB, "", 1000);
    const priceRows = await readSnapshotLatestPricePage(env.DB, "", 1000);
    const codeLabelRows = await readSnapshotCodeLabels(env.DB);
    const expected = encodeSnapshot({
      bondRows,
      stateRows: bondRows.map((r) => ({ isin_cd: r.isin_cd, bond_bal: r.bond_bal, kis_grade: r.kis_grade })),
      codeLabelRows,
      latestPriceRows: priceRows,
    });

    expect(JSON.stringify(workerPayload)).toBe(JSON.stringify(expected));
  });

  test("index.json의 base 포인터를 갱신하고, base basDt 이하의 기존 델타는 정리한다", async () => {
    await writeBondPage(env.DB, buildIssuItems(3, String(BAS_DT)), BAS_DT);

    // base(오늘)보다 이전 델타 하나(정리 대상), 이후 델타 하나(유지 대상)를 미리 심어 둔다.
    await writePriceDelta(env.ARCHIVE, BAS_DT - 1, buildPriceItems(1, String(BAS_DT - 1)));
    await writePriceDelta(env.ARCHIVE, BAS_DT + 1, buildPriceItems(1, String(BAS_DT + 1)));

    const result = await buildAndPutSnapshot(env);

    const indexObj = await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY);
    const index = await notNull(indexObj).json<SnapshotIndex>();

    expect(index.bond).toMatchObject({ key: snapshotBondKey(result.basDt), basDt: result.basDt, count: 3 });
    expect(index.priceDeltas.map((d) => d.basDt)).toEqual([BAS_DT + 1]);
  });

  test("bond 테이블이 비어 있으면 basDt=0 스냅샷을 만들지 않고 에러를 던진다", async () => {
    await expect(buildAndPutSnapshot(env)).rejects.toThrow(/bond/);
    expect(await env.ARCHIVE.get(snapshotBondKey(0))).toBeNull();
  });
});

describe("readSnapshotBondPage / readSnapshotLatestPricePage — 키셋 페이지네이션", () => {
  test("bond 키셋 페이지가 isin_cd 오름차순으로 빠짐없이·중복 없이 이어진다", async () => {
    const items = buildIssuItems(5, String(BAS_DT));
    await writeBondPage(env.DB, items, BAS_DT);

    const seen: string[] = [];
    let cursor = "";
    for (;;) {
      const page = await readSnapshotBondPage(env.DB, cursor, 2);
      if (page.length === 0) break;
      seen.push(...page.map((r) => r.isin_cd));
      cursor = page[page.length - 1].isin_cd;
      if (page.length < 2) break;
    }

    const expectedOrder = [...items.map((i) => i.isinCd)].sort();
    expect(seen).toEqual(expectedOrder);
  });

  test("한 isin_cd가 KTS·일반채권 두 시장에 동시 존재해도 페이지 경계에서 다른 종목을 건너뛰지 않는다", async () => {
    // 종목 A: 두 시장 동시 존재. 종목 B/C: 한 시장만. limit=1로 걸어 매 페이지가
    // "고유 isin_cd 1개"만 반환하도록 강제한다 — A의 2행이 한 페이지에 몰려도(고유 개수는
    // 여전히 1이라 limit을 만족) 다음 페이지로 넘어갈 때 B가 누락되면 안 된다.
    const a = buildPriceItems(1, String(BAS_DT))[0];
    a.isinCd = "KR0000000AAA";
    const aKts = { ...a, mrktCtg: "KTS" as const };
    const aGen = { ...a, mrktCtg: "일반채권" as const };
    const b = buildPriceItems(1, String(BAS_DT))[0];
    b.isinCd = "KR0000000BBB";
    const c = buildPriceItems(1, String(BAS_DT))[0];
    c.isinCd = "KR0000000CCC";

    await writeBondPricePage(env.DB, [aKts, aGen, b, c]);

    const seenIsinCds: string[] = [];
    let cursor = "";
    let rowCount = 0;
    // build.ts의 종료 조건과 동일: 이 페이지의 고유 isin_cd 수가 limit 미만이면 마지막 페이지.
    // 안전장치로 반복 횟수 상한(10)을 둬, 로직이 잘못돼도 테스트가 무한루프에 빠지지 않게 한다.
    for (let i = 0; i < 10; i++) {
      const page = await readSnapshotLatestPricePage(env.DB, cursor, 1);
      if (page.length === 0) break;
      rowCount += page.length;
      const distinct = new Set(page.map((r) => r.isin_cd));
      seenIsinCds.push(...distinct);
      cursor = page[page.length - 1].isin_cd;
      if (distinct.size < 1) break;
    }

    expect(seenIsinCds).toEqual(["KR0000000AAA", "KR0000000BBB", "KR0000000CCC"]);
    expect(rowCount).toBe(4); // A 2행 + B 1행 + C 1행
  });
});
