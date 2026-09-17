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
  // Astro dev 툴바가 아일랜드 props를 JSON으로 그대로 담은 <code> 블록을 <main> 밖에
  // 심어 두는데, ISIN 같은 값이 그 안에도 그대로 나타나 페이지 전체 검색과 부분일치한다
  // (strict mode 위반) — 그래서 아래 검색은 전부 <main>으로 스코프한다.
  const main = page.locator("main");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(FIXTURE.isinCdNm);
  // 발행인·단축코드는 헤더에서 빠지고(ui-audit ⑱) 발행 개요 카드로 옮겼다 — 헤더에는
  // 라벨과 함께 ISIN만 남는다.
  await expect(main.getByText(FIXTURE.isinCd, { exact: true })).toBeVisible();
  await expect(main.getByText("ISIN", { exact: true })).toBeVisible();
  // 픽스처(`e2e/fixtures/detail.sql`)가 최신 bas_dt에 KTS·일반채권 두 시장을 함께 갖고
  // 있으므로, 시장 토글과 종가/수익률이 실제 화면에서 어떻게 보이는지까지 확인한다
  // (⑥⑱은 소스만 읽고 올린 항목이라 화면 확인이 안 됐었다 — ui-audit ⚠️). "종가"/"수익률"은
  // 아래 가격 추이 카드의 지표 토글에도 같은 문구가 있어(strict mode 위반), 대신 헤더에만
  // 뜨는 값(기본 선택 시장 KTS의 20260828 종가)으로 확인한다.
  const marketToggle = main.getByRole("group", { name: "시장" });
  await expect(marketToggle).toBeVisible();
  await expect(marketToggle.getByRole("button", { name: "KTS" })).toBeVisible();
  await expect(main.getByText("10,150", { exact: true })).toBeVisible();
}

test.describe("목록 → 상세 이동", () => {
  test.beforeEach(async ({ page }) => {
    await mockSnapshot(page, makeBonds(3));
    await page.goto("/");
  });

  test("행 클릭 시 상세 페이지로 이동한다", async ({ page }) => {
    // 실제 행이 뜬 뒤에 클릭한다. 로딩 중 <tbody>에는 스켈레톤 <tr>이 들어 있는데,
    // 그것도 보이고 안정적이라 Playwright의 actionability를 통과해 버린다 — onClick이
    // 없어 클릭이 허공에 떨어지고 아래 waitForURL이 타임아웃된다(간헐적 flake).
    await expect(page.getByText(FIXTURE.isinCdNm)).toBeVisible();
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

// ui-audit ㉖ — 가격 추이 차트의 시장·기간·지표 상태가 URL에 동기화되는지.
test.describe("가격 추이 차트 상태 URL 동기화", () => {
  test("기간 토글 클릭 시 URL에 반영되고, 새로고침 후에도 유지된다", async ({ page }) => {
    await page.goto(`/bond/${FIXTURE.isinCd}`);
    // `BondDetail`은 client:load라 SSR HTML이 먼저 뜨고 하이드레이션은 뒤따른다 — 토글이
    // 눈에 보인다고 리스너가 붙었다는 보장은 없다(행 클릭을 "실제 데이터가 뜬 뒤"에야
    // 하는 위 테스트들과 같은 이유). 차트 canvas는 fetch 완료 후에야 마운트되는
    // `PriceChart`가 그려야 나타나므로, 이게 뜬 시점엔 하이드레이션도 반드시 끝나 있다.
    await expect(page.locator("canvas").first()).toBeVisible();

    const periodToggle = page.getByRole("group", { name: "기간" });
    await periodToggle.getByRole("button", { name: "3M" }).click();
    await expect(page).toHaveURL(/range=3M/);

    await page.reload();
    await expect(page.getByRole("group", { name: "기간" }).getByRole("button", { name: "3M" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
