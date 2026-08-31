/**
 * 상세 페이지(/bond/[id])는 SSR이 D1을 직접 타므로 모킹 대상이 아니다 — 여기서는
 * 목록 → 상세로의 URL 전이까지만 검증하고 응답 내용(상세 페이지 본문)은 단언하지 않는다.
 */
import { test } from "@playwright/test";
import { makeBonds, mockSnapshot } from "./fixtures/snapshot";

test.beforeEach(async ({ page }) => {
  await mockSnapshot(page, makeBonds(3));
  await page.goto("/");
});

test("행 클릭 시 상세 페이지 URL로 이동한다", async ({ page }) => {
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/\/bond\/KR0000000000/);
});

test("행 안의 종목명 링크를 클릭해도 같은 상세 페이지로 이동한다", async ({ page }) => {
  await page.getByRole("link", { name: "유일채권0" }).click();
  await page.waitForURL(/\/bond\/KR0000000000/);
});
