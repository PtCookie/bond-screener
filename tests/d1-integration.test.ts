import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import type { BondBasiInfoItem, BondPriceInfoItem, OpenApiEnvelope } from "@/api";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { writeBondPricePage } from "@/lib/d1/price-repo";
import { createFakeD1, type FakeD1 } from "./helpers/fake-d1";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}
function projectPath(rel: string): string {
  return new URL(`../${rel}`, import.meta.url).pathname;
}

const issuFixture = loadFixture<OpenApiEnvelope<BondBasiInfoItem>>("issu-page.json");
const priceFixture = loadFixture<OpenApiEnvelope<BondPriceInfoItem>>("price-page.json");

function issuItems(): BondBasiInfoItem[] {
  const items = issuFixture.response.body.items;
  if (items === "") throw new Error("fixture가 비어있음");
  return items.item;
}
function priceItems(): BondPriceInfoItem[] {
  const items = priceFixture.response.body.items;
  if (items === "") throw new Error("fixture가 비어있음");
  return items.item;
}

let db: FakeD1;

beforeEach(() => {
  const ddl = readFileSync(projectPath("migrations/0001_init.sql"), "utf8");
  db = createFakeD1(ddl);
});

describe("writeBondPage (json_each upsert 실동작)", () => {
  test("마이그레이션이 실제로 파싱·실행된다", () => {
    const tables = db._sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(["app_meta", "bond", "bond_price", "bond_state", "code_label", "sync_run"]);
  });

  test("페이지를 1회 적재하면 신규 종목만큼 upsert된다", async () => {
    const items = issuItems();
    const result = await writeBondPage(db as never, items, 20260820);
    expect(result.upserted).toBe(items.length);
    expect(result.unchanged).toBe(0);

    const count = db._sqlite.prepare("SELECT COUNT(*) c FROM bond").get() as { c: number };
    expect(count.c).toBe(items.length);
  });

  test("같은 데이터를 두 번째로 적재하면 전부 unchanged (지문 일치)", async () => {
    const items = issuItems();
    await writeBondPage(db as never, items, 20260820);
    const second = await writeBondPage(db as never, items, 20260821);
    expect(second.unchanged).toBe(items.length);
    expect(second.upserted).toBe(0);
  });

  test("한 종목의 값이 바뀌면 그 종목만 재적재된다", async () => {
    const items = issuItems();
    await writeBondPage(db as never, items, 20260820);

    const changed = items.map((item, i) => (i === 0 ? { ...item, bondSrfcInrt: "9.999" } : item));
    const second = await writeBondPage(db as never, changed, 20260821);
    expect(second.upserted).toBe(1);
    expect(second.unchanged).toBe(items.length - 1);

    const row = db._sqlite.prepare("SELECT bond_srfc_inrt FROM bond WHERE isin_cd = ?1").get(items[0].isinCd) as {
      bond_srfc_inrt: number;
    };
    expect(row.bond_srfc_inrt).toBe(9.999);
  });

  test("crno가 빈 값인 실측 케이스도 NOT NULL 위반 없이 적재된다", async () => {
    const items = issuItems().map((item) => ({ ...item, crno: "" }));
    const result = await writeBondPage(db as never, items, 20260820);
    expect(result.upserted).toBe(items.length);
    const row = db._sqlite.prepare("SELECT crno FROM bond LIMIT 1").get() as { crno: null };
    expect(row.crno).toBeNull();
  });

  test("SCD Type 2: bondBal이 바뀌면 이전 행이 마감되고 새 행이 열린다", async () => {
    const items = [issuItems()[0]];
    await writeBondPage(db as never, items, 20260820);

    const changedBal = [{ ...items[0], bondBal: String(Number(items[0].bondBal) + 1000) }];
    await writeBondPage(db as never, changedBal, 20260821);

    const rows = db._sqlite
      .prepare("SELECT valid_from, valid_to, bond_bal FROM bond_state WHERE isin_cd = ?1 ORDER BY valid_from")
      .all(items[0].isinCd) as { valid_from: number; valid_to: number | null; bond_bal: number }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].valid_to).toBe(20260821);
    expect(rows[1].valid_to).toBeNull();
  });
});

describe("writeBondPricePage (json_each upsert + PK 중복 회귀)", () => {
  test("시세 페이지를 적재하면 전량 삽입된다", async () => {
    const items = priceItems();
    const result = await writeBondPricePage(db as never, items);
    expect(result.inserted).toBe(items.length);

    const count = db._sqlite.prepare("SELECT COUNT(*) c FROM bond_price").get() as { c: number };
    expect(count.c).toBe(items.length);
  });

  test("같은 시세를 두 번 적재해도 idempotent (ON CONFLICT DO NOTHING)", async () => {
    const items = priceItems();
    await writeBondPricePage(db as never, items);
    await writeBondPricePage(db as never, items);

    const count = db._sqlite.prepare("SELECT COUNT(*) c FROM bond_price").get() as { c: number };
    expect(count.c).toBe(items.length);
  });

  test("같은 basDt·isinCd가 KTS/일반채권 두 시장에 동시 존재해도 PK 충돌 없이 둘 다 저장된다", async () => {
    // 실측으로 확인된 케이스(KR103501GG39 등)를 픽스처 기반으로 재현: 같은 isinCd를
    // mrktCtg만 다르게 두 건 넣는다. mrkt_ctg가 PK에서 빠지면 이 테스트가 깨진다.
    const base = priceItems()[0];
    const dup: BondPriceInfoItem[] = [
      { ...base, isinCd: "KR_DUP_TEST", mrktCtg: "KTS" },
      { ...base, isinCd: "KR_DUP_TEST", mrktCtg: "일반채권" },
    ];
    const result = await writeBondPricePage(db as never, dup);
    expect(result.inserted).toBe(2);

    const rows = db._sqlite
      .prepare("SELECT mrkt_ctg FROM bond_price WHERE isin_cd = 'KR_DUP_TEST' ORDER BY mrkt_ctg")
      .all() as { mrkt_ctg: number }[];
    expect(rows).toEqual([{ mrkt_ctg: 1 }, { mrkt_ctg: 2 }]);
  });

  test("신규 상장 종목의 srtn_cd/itms_nm을 bond에 채운다 (NULL일 때만)", async () => {
    const issuItem = issuItems()[0];
    await writeBondPage(db as never, [issuItem], 20260820);

    const priceItem: BondPriceInfoItem = {
      ...priceItems()[0],
      isinCd: issuItem.isinCd,
      srtnCd: "C99999999",
      itmsNm: "테스트종목",
    };
    await writeBondPricePage(db as never, [priceItem]);

    const row = db._sqlite.prepare("SELECT srtn_cd, itms_nm FROM bond WHERE isin_cd = ?1").get(issuItem.isinCd) as {
      srtn_cd: string;
      itms_nm: string;
    };
    expect(row.srtn_cd).toBe("C99999999");
    expect(row.itms_nm).toBe("테스트종목");
  });
});
