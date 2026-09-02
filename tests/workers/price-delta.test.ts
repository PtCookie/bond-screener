import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { DELTA_COLUMNS, readIndex as readIndexViaSrc, writePriceDelta, type SnapshotIndex } from "@/lib/r2/price-delta";
import { snapshotBondKey, snapshotPriceDeltaKey, SNAPSHOT_INDEX_KEY } from "@/lib/r2/keys";
import { resetD1 } from "./helpers/reset-d1";
import { buildPriceItems } from "./helpers/envelope";
import { notNull } from "./helpers/assert";

beforeEach(resetD1); // reset()이 R2도 함께 비운다 — 이름은 D1이지만 두 바인딩 다 초기화.

async function readIndex(): Promise<SnapshotIndex | null> {
  const obj = await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY);
  return obj ? await obj.json<SnapshotIndex>() : null;
}

describe("writePriceDelta", () => {
  test("index 부재 시 최초 델타를 생성한다", async () => {
    const items = buildPriceItems(2, "20260821");
    await writePriceDelta(env.ARCHIVE, 20260821, items);

    const deltaObj = await env.ARCHIVE.get(snapshotPriceDeltaKey(20260821));
    expect(deltaObj).not.toBeNull();
    const delta = await notNull(deltaObj).json<{ basDt: number; columns: string[]; rows: unknown[][] }>();
    expect(delta.basDt).toBe(20260821);
    expect(delta.columns).toEqual(DELTA_COLUMNS);
    expect(delta.rows).toHaveLength(2);

    const index = await readIndex();
    expect(index?.bond).toBeNull();
    expect(index?.priceDeltas).toEqual([{ key: snapshotPriceDeltaKey(20260821), basDt: 20260821, count: 2 }]);
  });

  test("DELTA_COLUMNS 순서대로 행을 인코딩한다 (normReal/normText 적용, trqu는 숫자)", async () => {
    const item = buildPriceItems(1, "20260821")[0];
    await writePriceDelta(env.ARCHIVE, 20260821, [item]);

    const deltaObj = await env.ARCHIVE.get(snapshotPriceDeltaKey(20260821));
    const delta = await notNull(deltaObj).json<{ rows: unknown[][] }>();
    const [isinCd, mrktCtg, clprPrc, clprVs, clprBnfRt, trqu] = delta.rows[0];

    expect(isinCd).toBe(item.isinCd);
    expect(mrktCtg).toBe(item.mrktCtg);
    expect(clprPrc).toBe(Number(item.clprPrc));
    expect(clprVs).toBe(Number(item.clprVs));
    expect(clprBnfRt).toBe(Number(item.clprBnfRt));
    expect(trqu).toBe(Number(item.trqu));
    expect(typeof trqu).toBe("number");
  });

  test("같은 basDt로 재기록하면 중복 없이 교체되고 basDt 오름차순으로 정렬된다", async () => {
    await writePriceDelta(env.ARCHIVE, 20260819, buildPriceItems(1, "20260819"));
    await writePriceDelta(env.ARCHIVE, 20260821, buildPriceItems(1, "20260821"));
    await writePriceDelta(env.ARCHIVE, 20260820, buildPriceItems(1, "20260820"));
    // 20260821을 다시 쓰면(예: 재시도) 새 항목으로 교체되고 중복이 생기지 않는다.
    await writePriceDelta(env.ARCHIVE, 20260821, buildPriceItems(3, "20260821"));

    const index = await readIndex();
    expect(index?.priceDeltas.map((d) => d.basDt)).toEqual([20260819, 20260820, 20260821]);
    expect(index?.priceDeltas.find((d) => d.basDt === 20260821)?.count).toBe(3);
  });

  test("base보다 오래된 기존 델타는 제거된다", async () => {
    await writePriceDelta(env.ARCHIVE, 20260819, buildPriceItems(1, "20260819"));
    await writePriceDelta(env.ARCHIVE, 20260820, buildPriceItems(1, "20260820"));

    // 주간 base 스냅샷이 20260820까지 반영됐다고 가정 (scripts/build-snapshot.mjs 시뮬레이션).
    const index = notNull(await readIndex());
    await env.ARCHIVE.put(
      SNAPSHOT_INDEX_KEY,
      JSON.stringify({ ...index, bond: { key: snapshotBondKey(20260820), basDt: 20260820, count: 29087 } }),
    );

    await writePriceDelta(env.ARCHIVE, 20260821, buildPriceItems(1, "20260821"));

    const after = await readIndex();
    // 20260819/20260820은 base(20260820)에 이미 포함됐으니 제거되고 20260821만 남아야 한다.
    expect(after?.priceDeltas.map((d) => d.basDt)).toEqual([20260821]);
  });

  test("base보다 오래되거나 같은 날짜의 델타는 새로 추가될 때도 index에 들어가지 않는다 (버그 C 회귀)", async () => {
    const index0 = (await readIndex()) ?? {
      generatedAt: new Date(0).toISOString(),
      bond: null,
      bondDeltas: [],
      priceDeltas: [],
    };
    await env.ARCHIVE.put(
      SNAPSHOT_INDEX_KEY,
      JSON.stringify({ ...index0, bond: { key: snapshotBondKey(20260820), basDt: 20260820, count: 29087 } }),
    );

    // base(20260820)보다 과거인 basDt로 델타를 쓴다 — 백필이나 재처리 시나리오.
    await writePriceDelta(env.ARCHIVE, 20260815, buildPriceItems(1, "20260815"));
    // base와 같은 날짜도 마찬가지로 제외돼야 한다.
    await writePriceDelta(env.ARCHIVE, 20260820, buildPriceItems(1, "20260820"));

    const after = await readIndex();
    expect(after?.priceDeltas).toEqual([]);
  });

  test("손상된 index.json이 있어도 base 포인터가 보존된다 (버그 B 회귀)", async () => {
    // 정상 index를 만든 뒤, R2에 직접 파손된 JSON을 덮어써 손상 상황을 재현한다.
    await writePriceDelta(env.ARCHIVE, 20260820, buildPriceItems(1, "20260820"));
    const goodIndex = notNull(await readIndex());
    await env.ARCHIVE.put(
      SNAPSHOT_INDEX_KEY,
      JSON.stringify({ ...goodIndex, bond: { key: snapshotBondKey(20260820), basDt: 20260820, count: 29087 } }),
    );
    await env.ARCHIVE.put(SNAPSHOT_INDEX_KEY, "{ 이건 유효한 JSON이 아님");

    // 손상된 index를 만난 다음 tick에서 writePriceDelta가 호출된다.
    await expect(writePriceDelta(env.ARCHIVE, 20260821, buildPriceItems(1, "20260821"))).rejects.toThrow();

    // index.json은 파싱 실패 이전 값 그대로 남아있어야 한다 — 빈 인덱스로 덮어써지면 안 된다.
    const afterObj = await env.ARCHIVE.get(SNAPSHOT_INDEX_KEY);
    const afterText = await notNull(afterObj).text();
    expect(afterText).toBe("{ 이건 유효한 JSON이 아님");
  });

  test("bondDeltas 필드를 보존한다 — price 델타를 쓸 때 기존 bondDeltas를 날리지 않는다", async () => {
    // bondDeltas 필드가 이미 채워진 index를 시뮬레이션(bondDelta 도입 이후 상태).
    const bondDeltaEntry = { key: "snapshot/bond-delta/20260820.json", basDt: 20260820, count: 5 };
    await env.ARCHIVE.put(
      SNAPSHOT_INDEX_KEY,
      JSON.stringify({
        generatedAt: new Date(0).toISOString(),
        bond: null,
        bondDeltas: [bondDeltaEntry],
        priceDeltas: [],
      }),
    );

    await writePriceDelta(env.ARCHIVE, 20260821, buildPriceItems(1, "20260821"));

    const after = await readIndex();
    expect(after?.bondDeltas).toEqual([bondDeltaEntry]);
    expect(after?.priceDeltas.map((d) => d.basDt)).toEqual([20260821]);
  });

  test("readIndex()는 bondDeltas 필드가 없는 구형 index.json도 빈 배열로 보정한다", async () => {
    // bondDelta 도입 이전(구형) index.json — bondDeltas 필드 자체가 없다.
    await env.ARCHIVE.put(
      SNAPSHOT_INDEX_KEY,
      JSON.stringify({ generatedAt: new Date(0).toISOString(), bond: null, priceDeltas: [] }),
    );

    const index = await readIndexViaSrc(env.ARCHIVE);
    expect(index.bondDeltas).toEqual([]);
  });
});
