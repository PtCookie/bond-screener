import { expect, test } from "@playwright/test";
import { makeBonds, mockSnapshot, mockSnapshotFailure } from "./fixtures/snapshot";

test("필터 결과가 0건이면 빈 상태와 필터 초기화 버튼이 표시된다", async ({ page }) => {
  await mockSnapshot(page, makeBonds());
  await page.goto("/");

  await page.getByPlaceholder("종목명·발행인·ISIN 검색").fill("존재하지않는채권이름");
  await expect(page.getByText("조건에 맞는 채권이 없습니다.")).toBeVisible();

  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.getByText("총 30건")).toBeVisible();
});

test("스냅샷 fetch 실패 시 에러 화면이 뜨고, 재시도하면 정상 목록으로 복구된다", async ({ page }) => {
  await mockSnapshotFailure(page);
  await page.goto("/");

  // useScreenerData(TanStack Query)가 retry를 끄지 않아(기본 3회, 지수 백오프) 최종
  // isError까지 여러 초가 걸린다 — 기본 5s 타임아웃보다 넉넉히 잡는다.
  await expect(page.getByText("데이터를 불러오지 못했습니다.")).toBeVisible({ timeout: 15_000 });

  // 정상 응답으로 라우팅을 되돌린 뒤 재시도한다.
  await mockSnapshot(page, makeBonds());
  await page.getByRole("button", { name: "다시 시도" }).click();

  await expect(page.getByText("총 30건")).toBeVisible();
});
