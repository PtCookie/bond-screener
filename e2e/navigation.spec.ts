/**
 * 목록 → 상세 라우팅과 상세 페이지(`/bond/[id]`) SSR 검증.
 *
 * 상세 페이지는 SSR이 D1을 직접 타므로 `page.route()` 모킹이 닿지 않는다 — 대신
 * `scripts/seed-e2e.mjs`가 E2E 전용 D1(`.wrangler/e2e-state`)에 심는 픽스처 종목
 * (`e2e/fixtures/detail.sql`)으로 검증한다. 그 픽스처는 목록 목킹(`fixtures/snapshot.ts`의
 * `makeBonds()`) 첫 종목과 같은 정체성을 갖도록 맞춰져 있고, 아래 단언들이 `makeBonds()`
 * 쪽 값을 그대로 쓰므로 둘이 어긋나면 여기서 바로 깨진다.
 *
 * **응답 상태를 명시적으로 본다.** `waitForURL`은 상태 코드를 검사하지 않아, 상세 페이지가
 * 500(예: CI에 D1 스키마가 없던 시절의 `no such table: bond`)이어도 URL만 바뀌면 통과했다.
 */
import { expect, test, type Page } from "@playwright/test";
import { makeBonds, mockSnapshot } from "./fixtures/snapshot";

const FIXTURE = makeBonds(1)[0];
/** `e2e/fixtures/detail.sql`의 `bond.srtn_cd` — 단축코드 경로(`resolveIsinCd`) 검증용. */
const FIXTURE_SRTN_CD = "E2E000001";

async function expectDetailOf(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(FIXTURE.isinCdNm);
  await expect(page.getByText(`${FIXTURE.bondIsurNm} · ${FIXTURE.isinCd}`)).toBeVisible();
}

test.describe("목록 → 상세 이동", () => {
  test.beforeEach(async ({ page }) => {
    await mockSnapshot(page, makeBonds(3));
    await page.goto("/");
  });

  test("행 클릭 시 상세 페이지로 이동한다", async ({ page }) => {
    await page.locator("tbody tr").first().click();
    await page.waitForURL(`**/bond/${FIXTURE.isinCd}`);
    await expectDetailOf(page);
  });

  test("행 안의 종목명 링크를 클릭해도 같은 상세 페이지로 이동한다", async ({ page }) => {
    await page.getByRole("link", { name: FIXTURE.isinCdNm }).click();
    await page.waitForURL(`**/bond/${FIXTURE.isinCd}`);
    await expectDetailOf(page);
  });
});

test.describe("상세 페이지 직접 접근", () => {
  test("ISIN으로 열면 200으로 렌더된다", async ({ page }) => {
    const response = await page.goto(`/bond/${FIXTURE.isinCd}`);
    expect(response?.status()).toBe(200);
    await expectDetailOf(page);
  });

  test("단축코드로 열어도 같은 종목이 나온다", async ({ page }) => {
    const response = await page.goto(`/bond/${FIXTURE_SRTN_CD}`);
    expect(response?.status()).toBe(200);
    await expectDetailOf(page);
  });

  // 형식은 맞지만 D1에 없는 ISIN — 조회 실패가 500(테이블·쿼리 오류)이 아니라 404여야 한다.
  test("존재하지 않는 종목은 404다", async ({ page }) => {
    const response = await page.goto("/bond/KR9999999999");
    expect(response?.status()).toBe(404);
  });
});
