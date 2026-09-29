/**
 * 북마크 플로우 — 목록에서 별로 추가 → "저장된 필터"의 고정 항목 "북마크 (N)"으로 모아 보기 →
 * 상세 페이지 별 상태 → 상세에서 해제하면 목록 개수에도 반영.
 *
 * 저장소는 localStorage라 두 페이지(두 아일랜드)가 같은 값을 보는지는 여기서만 확인된다.
 * 상세 페이지는 SSR이라 `e2e/fixtures/detail.sql`에 심긴 첫 픽스처 종목(`makeBonds()[0]`)을 쓴다
 * (`navigation.spec.ts` 참고).
 */
import { expect, test, type Page } from "@playwright/test";
import { makeBonds, mockSnapshot } from "./fixtures/snapshot";

const BONDS = makeBonds(3);
const FIXTURE = BONDS[0];

/** 모바일은 "저장된 필터"가 접힌 필터 패널 안에 있다(ScreenerFilterBar) — 먼저 펼친다. */
async function openPresetMenu(page: Page, isMobile: boolean) {
  // "필터 초기화"(빈 상태 버튼)와 겹치지 않게 "필터" / "필터 N"만 잡는다.
  if (isMobile) await page.getByRole("button", { name: /^필터( \d+)?$/ }).click();
  await page.getByRole("button", { name: /저장된 필터/ }).click();
}

test("목록에서 북마크 → 북마크 보기 → 상세에서 해제", async ({ page, isMobile }) => {
  await mockSnapshot(page, BONDS);
  await page.goto("/");

  const star = page.getByRole("button", { name: `${FIXTURE.isinCdNm} 북마크`, exact: true });
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");

  await openPresetMenu(page, isMobile);
  await page.locator('[data-slot="popover-content"]').getByRole("button", { name: "북마크 (1)" }).click();

  await expect(page.getByText("1건 / 전체 3건")).toBeVisible();
  await expect(page).toHaveURL(/bookmarked=1/);
  await expect(page.getByRole("button", { name: "북마크 보기 해제" })).toBeVisible();

  const response = await page.goto(`/bond/${FIXTURE.isinCd}`);
  expect(response?.status()).toBe(200);
  // SSR 첫 렌더는 스토리지를 모르므로 false로 시작한다 — 하이드레이션 후 true가 되는지를 본다.
  const detailStar = page.locator("main").getByRole("button", { name: `${FIXTURE.isinCdNm} 북마크`, exact: true });
  await expect(detailStar).toHaveAttribute("aria-pressed", "true");
  await detailStar.click();
  await expect(detailStar).toHaveAttribute("aria-pressed", "false");

  await page.goBack();
  await openPresetMenu(page, isMobile);
  await expect(page.locator('[data-slot="popover-content"]').getByRole("button", { name: "북마크 (0)" })).toBeVisible();
});
