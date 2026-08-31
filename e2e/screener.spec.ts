import { expect, test } from "@playwright/test";
import { makeBonds, mockSnapshot } from "./fixtures/snapshot";

// 데스크톱 표 레이아웃(종목당 <tr> 1개, 고정 컬럼 인덱스)을 가정한다 — 모바일은 종목당
// 2행(ScreenerTable.tsx)이라 행 개수·td 인덱스 단언이 깨진다. 모바일 레이아웃 자체는
// responsive.spec.ts가 Mobile Chrome 프로젝트에서 별도로 검증한다.
test.skip(({ isMobile }) => isMobile, "데스크톱 표 레이아웃을 가정 — 모바일은 responsive.spec.ts에서 검증");

test.beforeEach(async ({ page }) => {
  await mockSnapshot(page, makeBonds());
  await page.goto("/");
});

test("초기 로드 — 행이 표시되고 헤더에 기준일자가 뜬다", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "채권 스크리너" })).toBeVisible();
  await expect(page.getByText(/기준일자 \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expect(page.getByText("총 30건")).toBeVisible();
  // 기본 pageSize 25 — 1페이지에 25행.
  await expect(page.locator("tbody tr")).toHaveCount(25);
});

test("검색어 입력 시 결과 수 배지와 행이 함께 줄어든다", async ({ page }) => {
  await page.getByPlaceholder("종목명·발행인·ISIN 검색").fill("유일채권5");
  // "유일채권15"/"유일채권25"는 "권" 다음이 "1"/"2"라 "유일채권5"의 부분일치가 아니다 —
  // "유일채권5"(index 5) 1건만 매치한다.
  await expect(page.getByText("1건 / 전체 30건").first()).toBeVisible();
});

test("신용등급 다중선택 필터 — 팝오버를 열고 체크하면 결과가 좁혀진다", async ({ page }) => {
  await page.getByRole("button", { name: "신용등급 전체" }).click();
  // 팝오버는 Portal로 렌더돼 body 직속이고, 필터 결과 행에도 같은 "BBB" 텍스트(등급
  // Badge)가 남아있어 전역 쿼리는 모호하다 — 팝오버 콘텐츠로 범위를 좁힌다.
  const popover = page.locator('[data-slot="popover-content"]');
  await popover.getByText("BBB", { exact: true }).click();
  // BBB는 10건(index 20~29)이다.
  await expect(page.getByText("10건 / 전체 30건").first()).toBeVisible();
});

test("만기일 범위 필터 — 최소값을 입력하면 결과가 좁혀진다", async ({ page }) => {
  // ScreenerFilterBar의 "만기일" 트리거와 표 헤더의 "만기일" 정렬 버튼이 접근성 이름이
  // 같다 — 필터 바가 표보다 DOM에서 먼저 나오므로 .first()로 필터 트리거를 특정한다.
  await page.getByRole("button", { name: "만기일", exact: true }).first().click();
  // bondExprDt = 20270101 + i(0~29) → 20270115 이상이면 index 14~29(16건).
  await page.getByLabel("만기일 최소").fill("2027-01-15");
  await expect(page.getByText("16건 / 전체 30건").first()).toBeVisible();
});

test("헤더 클릭 정렬이 3-state로 순환한다", async ({ page }) => {
  // 필터 바의 "표면이율(%)" 트리거는 부분일치로도 "표면이율"에 매치하므로 exact로 구분한다.
  const header = page.getByRole("button", { name: "표면이율", exact: true });
  const firstRowCell = page.locator("tbody tr").first().locator("td").nth(5); // 표면이율 컬럼

  await header.click();
  const afterFirstClick = await firstRowCell.textContent();

  await header.click();
  const afterSecondClick = await firstRowCell.textContent();
  expect(afterSecondClick).not.toBe(afterFirstClick);
});

test("페이지네이션 — 다음 페이지 이동과 pageSize 변경", async ({ page }) => {
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.getByText("26–30 / 전체 30건")).toBeVisible();

  await page.getByRole("button", { name: "처음 페이지" }).click();
  await page.getByRole("button", { name: "50" }).click();
  await expect(page.getByText("1–30 / 전체 30건")).toBeVisible();
});

test("초기화 버튼 — 전체 목록으로 복귀하고 URL 쿼리가 사라진다", async ({ page }) => {
  await page.getByPlaceholder("종목명·발행인·ISIN 검색").fill("유일채권5");
  await expect(page).toHaveURL(/q=/);

  await page.getByRole("button", { name: "초기화" }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expect(page.getByText("총 30건")).toBeVisible();
});

test("상태 지속성 — 필터·정렬·페이지를 바꾼 뒤 리로드해도 URL 쿼리로 복원된다", async ({ page }) => {
  await page.getByPlaceholder("종목명·발행인·ISIN 검색").fill("유일채권");
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/q=/);

  const urlBeforeReload = page.url();
  await page.reload();

  await expect(page).toHaveURL(urlBeforeReload);
  await expect(page.getByPlaceholder("종목명·발행인·ISIN 검색")).toHaveValue("유일채권");
  await expect(page.getByText("26–30 / 전체 30건")).toBeVisible();
});

test("상태 지속성 — 쿼리 없이 재진입해도 sessionStorage로 복원되고 URL에 반영된다", async ({ page }) => {
  await page.getByPlaceholder("종목명·발행인·ISIN 검색").fill("유일채권7");
  await expect(page).toHaveURL(/q=/);

  // 쿼리를 지운 새 진입(같은 세션 — sessionStorage는 유지된다).
  await page.goto("/");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByPlaceholder("종목명·발행인·ISIN 검색")).toHaveValue("유일채권7");
});
