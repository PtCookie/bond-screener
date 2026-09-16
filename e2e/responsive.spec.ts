/**
 * `Mobile Chrome` 프로젝트에서만 의미가 있다(playwright.config.ts) — 데스크톱 프로젝트에서
 * 돌아도 뷰포트가 넓어 이 분기는 트리거되지 않는다. 실제 페이지 폭·좌우 padding과 함께
 * sticky 종목명 열이 유지되는지는 Vitest Browser Mode의 격리된 컴포넌트 렌더로는 재현할
 * 수 없어(`tests/components/screener/ScreenerTable.test.tsx` 참고) 여기서 확인한다.
 */
import { expect, test } from "@playwright/test";
import { makeBonds, mockSnapshot } from "./fixtures/snapshot";

// chromium 등 데스크톱 프로젝트로 돌리면 뷰포트가 넓어 이 분기가 트리거되지 않으므로
// 명시적으로 skip한다 — devices["Pixel 5"](Mobile Chrome 프로젝트)만 isMobile: true.
test.skip(({ isMobile }) => !isMobile, "Mobile Chrome 프로젝트에서만 의미가 있다");

test("모바일 뷰포트에서는 종목당 2행 레이아웃이 뜬다", async ({ page }) => {
  await mockSnapshot(page, makeBonds(3));
  await page.goto("/");

  await expect(page.getByText("유일채권0")).toBeVisible();
  // 데스크톱은 종목당 <tr> 1개, 모바일은 이름 행 + 데이터 행 2개 — 3종목이면 6행.
  await expect(page.locator("tbody tr")).toHaveCount(6);
});

test("종목명 열이 가로 스크롤 중에도 sticky로 남는다", async ({ page }) => {
  await mockSnapshot(page, makeBonds(3));
  await page.goto("/");

  const nameCell = page.getByText("유일채권0").locator("..");
  await expect(nameCell).toHaveCSS("position", "sticky");
});

// ui-audit ⑧ — 375px에서 필터 칩 전부를 펼쳐두면 4줄(~340px)이 sticky로 화면을 영구
// 점유한다. 접힌 패널로 감싸 검색창·토글·건수만 담은 한 줄만 보이는지 확인한다.
test("필터 칩은 기본적으로 접혀 있고, 토글을 누르면 펼쳐진다", async ({ page }) => {
  await mockSnapshot(page, makeBonds(3));
  await page.goto("/");

  await expect(page.getByRole("button", { name: "신용등급 전체" })).not.toBeVisible();
  await page.getByRole("button", { name: "필터", exact: true }).click();
  await expect(page.getByRole("button", { name: "신용등급 전체" })).toBeVisible();
});

// ui-audit ⑨ — 데스크톱 컬럼 순서(종류·발행일·표면이율…) 그대로 두면 375px에서 시세 값이
// 가로 스크롤 너머로 밀려난다. 모바일 데이터 헤더의 첫 컬럼이 만기일인지 확인한다.
test("모바일 데이터 헤더의 첫 컬럼은 만기일이다", async ({ page }) => {
  await mockSnapshot(page, makeBonds(3));
  await page.goto("/");

  const firstDataHeader = page.locator("thead tr").nth(1).locator("th").first();
  await expect(firstDataHeader).toContainText("만기일");
});
