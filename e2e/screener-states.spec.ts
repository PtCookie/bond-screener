import { expect, test } from "@playwright/test";
import { makeBonds, mockSnapshot, mockSnapshotDeferred, mockSnapshotFailure } from "./fixtures/snapshot";

test("필터 결과가 0건이면 빈 상태와 필터 초기화 버튼이 표시된다", async ({ page }) => {
  await mockSnapshot(page, makeBonds());
  await page.goto("/");

  await page.getByPlaceholder("종목명·발행인·ISIN 검색").fill("존재하지않는채권이름");
  await expect(page.getByText("조건에 맞는 채권이 없습니다.")).toBeVisible();

  // 건수의 유일한 소유자는 필터 바 배지다(ui-audit ⑤) — exact가 없으면 페이지네이션의
  // "1–25 / 전체 30건"에도 부분일치한다.
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.getByText("30건", { exact: true })).toBeVisible();
});

test("스냅샷 fetch 실패 시 에러 화면이 뜨고, 재시도하면 정상 목록으로 복구된다", async ({ page }) => {
  await mockSnapshotFailure(page);
  await page.goto("/");

  // useScreenerData(TanStack Query)가 retry를 끄지 않아(기본 3회, 지수 백오프) 최종
  // isError까지 여러 초가 걸린다 — 기본 5s 타임아웃보다 넉넉히 잡는다.
  await expect(page.getByText("데이터를 불러오지 못했습니다.")).toBeVisible({ timeout: 15_000 });

  // 실패했는데 "0건"이 남아 있으면 "조회 결과가 없다"로 읽힌다 — 건수·기준일자는 사라져야 한다.
  // (로딩과 달리 스켈레톤도 그리지 않는다. 끝나지 않는 로딩으로 보이기 때문이다.)
  await expect(page.getByText("0건", { exact: true })).toHaveCount(0);
  await expect(page.getByText("기본정보 —")).toHaveCount(0);

  // 정상 응답으로 라우팅을 되돌린 뒤 재시도한다.
  await mockSnapshot(page, makeBonds());
  await page.getByRole("button", { name: "다시 시도" }).click();

  await expect(page.getByText("30건", { exact: true })).toBeVisible();
});

/**
 * 로딩 프레임에서 "0"을 확정값처럼 보여주지 않는지 — 실제 Astro island 하이드레이션 경로로 확인한다.
 * 단언이 레이아웃에 무관해 모바일 프로젝트에서도 그대로 의미가 있다.
 */
test("로딩 중에는 건수·기준일자·페이지 번호를 0으로 그리지 않는다", async ({ page }) => {
  const { release } = await mockSnapshotDeferred(page, makeBonds());
  await page.goto("/");

  // 표 모양 스켈레톤이 떴는지 먼저 확인해 "아직 마운트 전"과 구분한다.
  const skeletonRows = page.locator('tbody tr[data-slot="screener-skeleton-row"]');
  await expect(skeletonRows.first()).toBeVisible();

  // 로딩 중에도 컬럼 헤더는 진짜다.
  await expect(page.getByRole("button", { name: "종목명", exact: true })).toBeVisible();

  await expect(page.getByText("0건", { exact: true })).toHaveCount(0);
  await expect(page.getByText("0–0 / 전체 0건")).toHaveCount(0);
  await expect(page.getByText("1 / 1")).toHaveCount(0);
  // 로딩 중에는 두 칸 다 자리바다. release() 뒤에는 시세가 픽스처에 없어 "시세 —"가 정상으로 뜬다.
  await expect(page.getByText("기본정보 —")).toHaveCount(0);
  await expect(page.getByText("시세 —")).toHaveCount(0);

  release();

  await expect(page.getByText("30건", { exact: true })).toBeVisible();
  // 로딩이 끝나면 스켈레톤 행이 하나도 남지 않는다.
  await expect(skeletonRows).toHaveCount(0);
});
