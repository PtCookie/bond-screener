/**
 * `ScreenerTable`은 `useIsMobile()`로 실제 뷰포트를 평가해 데스크톱/모바일 레이아웃을
 * 가르므로, `page.viewport()`로 진짜 뷰포트를 바꿔가며 검증한다(Browser Mode의 이득).
 */
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { useTable, type PaginationState, type SortingState } from "@tanstack/react-table";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { screenerColumns, screenerFeatures } from "@/components/screener/columns";
import { ScreenerTable } from "@/components/screener/ScreenerTable";
import type { ScreenerRow } from "@/lib/screener/types";
import { makeScreenerRow } from "../../helpers/screener-row";

function makeRows(n: number): ScreenerRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeScreenerRow({ isinCd: `KR${String(i).padStart(10, "0")}`, isinCdNm: `테스트채권${i}` }),
  );
}

function Harness({ rows, isLoading = false }: { rows: ScreenerRow[]; isLoading?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const table = useTable({
    features: screenerFeatures,
    columns: screenerColumns,
    data: rows,
    getRowId: (row) => row.isinCd,
    state: { sorting, pagination },
    onSortingChange: (updater) => setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    onPaginationChange: (updater) => setPagination((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    autoResetPageIndex: false,
  });
  return <ScreenerTable table={table} isLoading={isLoading} />;
}

describe("ScreenerTable", () => {
  test("isLoading이면 스켈레톤을 표시한다(빈 상태 문구가 없음)", async () => {
    const screen = await render(<Harness rows={[]} isLoading />);
    await expect.element(screen.getByText("조건에 맞는 채권이 없습니다.")).not.toBeInTheDocument();
  });

  /**
   * 스켈레톤이 "표처럼 보이는 별개의 것"이 아니라 **실제 표 그 자체**여야 한다는 계약.
   * 예전 구현은 동일 폭 pill을 div로 쌓아 헤더도, 컬럼 폭도, 모바일 2행 구조도 없었다.
   */
  test("로딩 중에도 실제 컬럼 헤더가 렌더된다", async () => {
    await page.viewport(1200, 800);
    const screen = await render(<Harness rows={[]} isLoading />);

    await expect.element(screen.getByText("종목명")).toBeInTheDocument();
    await expect.element(screen.getByText("거래량")).toBeInTheDocument();
    expect(screen.container.querySelectorAll("thead th")).toHaveLength(screenerColumns.length);
  });

  // meta.width가 colgroup으로 상속되는지 — 컬럼 폭 무시가 예전 스켈레톤의 핵심 결함이었다.
  test("로딩 중 colgroup이 컬럼별 meta.width를 그대로 반영한다", async () => {
    await page.viewport(1200, 800);
    const screen = await render(<Harness rows={[]} isLoading />);

    const firstCol = screen.container.querySelector("colgroup col");
    expect(firstCol).not.toBeNull();
    expect((firstCol as HTMLTableColElement).style.width).toBe("16rem");
  });

  test("스켈레톤 행은 aria-hidden이고 실제 행과 data-slot으로 구분된다", async () => {
    await page.viewport(1200, 800);
    const screen = await render(<Harness rows={[]} isLoading />);

    const skeletonRows = screen.container.querySelectorAll('tbody tr[data-slot="screener-skeleton-row"]');
    expect(skeletonRows.length).toBeGreaterThan(0);
    for (const row of skeletonRows) expect(row.getAttribute("aria-hidden")).toBe("true");
    // 로딩 중에는 실제 행이 하나도 없어야 한다.
    expect(screen.container.querySelectorAll('tbody tr[data-slot="table-row"]')).toHaveLength(0);
    expect(screen.container.querySelector("table")?.getAttribute("aria-busy")).toBe("true");
  });

  /**
   * ⚠️ 여기의 20은 `ScreenerSkeleton.tsx`의 상한과 묶여 있고, 그 상한은 E2E가 `tbody tr`를
   * 그대로 세는 곳(`e2e/screener.spec.ts`의 25, `e2e/responsive.spec.ts`의 6)과 겹치지
   * 않도록 고른 값이다. 이 숫자를 바꾸려면 두 스펙의 기대 행 수를 먼저 확인할 것.
   */
  test("스켈레톤 행 수는 데스크톱·모바일 모두 tr 20개로 맞춰진다", async () => {
    await page.viewport(1200, 800);
    const desktop = await render(<Harness rows={[]} isLoading />);
    // pageSize 25 → min(25, 20) = 20행.
    await expect.poll(() => desktop.container.querySelectorAll("tbody tr").length).toBe(20);

    await page.viewport(390, 800);
    const mobile = await render(<Harness rows={[]} isLoading />);
    // 모바일은 종목당 2행이라 10종목 × 2 = 20행.
    await expect.poll(() => mobile.container.querySelectorAll("tbody tr").length).toBe(20);
    await page.viewport(1200, 800); // 다음 테스트에 영향 없도록 되돌린다.
  });

  test("0건이면 빈 상태를 표시한다", async () => {
    const screen = await render(<Harness rows={[]} />);
    await expect.element(screen.getByText("조건에 맞는 채권이 없습니다.")).toBeInTheDocument();
  });

  test("데스크톱(768px 이상)에서는 종목당 한 행이다", async () => {
    await page.viewport(1200, 800);
    const screen = await render(<Harness rows={makeRows(3)} />);
    await expect.element(screen.getByText("테스트채권0")).toBeInTheDocument();

    const rows = screen.container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
  });

  test("모바일(767px 이하)에서는 종목당 두 행이다", async () => {
    await page.viewport(390, 800);
    const screen = await render(<Harness rows={makeRows(3)} />);
    await expect.element(screen.getByText("테스트채권0")).toBeInTheDocument();

    await expect.poll(() => screen.container.querySelectorAll("tbody tr").length).toBe(6);
    await page.viewport(1200, 800); // 다음 테스트에 영향 없도록 되돌린다.
  });

  // 행 클릭 → window.location.href 대입 → 실제 상세 페이지 이동은 여기서 검증하지 않는다.
  // 실측 확인(세 브라우저 전부): `location`은 Window.prototype의, `href`는 Location
  // 인스턴스의 own accessor 프로퍼티이고 둘 다 configurable:false다 — jsdom과 달리 실제
  // 브라우저에서는 defineProperty로 가로챌 방법이 없다(시도하면 즉시 throw). 클릭 시
  // 실제로 그 경로가 로드되는지는 `e2e/navigation.spec.ts`(Playwright, 실제 페이지 전이를
  // `page.waitForURL()`로 검증)가 담당한다 — 여기서는 정적으로 href만 확인한다.
  test("1열(종목명) 셀은 상세 페이지로 가는 링크를 담고 있다", async () => {
    const screen = await render(<Harness rows={makeRows(1)} />);
    const link = screen.getByRole("link", { name: "테스트채권0" });
    await expect.element(link).toHaveAttribute("href", "/bond/KR0000000000");
  });

  // sticky 1열은 뒤로 스크롤되는 다른 셀 위에 그려지므로 hover 여부와 무관하게 항상
  // 불투명해야 한다 — 반투명이면 뒤 셀 글자가 비쳐 보인다(실제로 있었던 버그).
  // color-mix() 결과는 브라우저마다 computed value 직렬화가 달라(oklab()/rgb() 등)
  // 문자열로 비교하지 않고, canvas에 칠해 alpha 채널만 측정한다.
  test("sticky 1열 셀 배경은 hover 상태에서도 불투명하다", async () => {
    await page.viewport(1200, 800);
    const screen = await render(<Harness rows={makeRows(1)} />);
    const cell = screen.container.querySelector("tbody tr td:first-child");
    if (!cell) throw new Error("첫 번째 셀을 찾지 못했습니다");

    const before = getComputedStyle(cell).backgroundColor;
    expect(alphaOf(before)).toBe(255);

    await screen.getByText("테스트채권0").hover();
    const after = getComputedStyle(cell).backgroundColor;
    expect(alphaOf(after)).toBe(255);
    expect(after).not.toBe(before); // hover 틴트가 실제로 적용됐는지도 함께 확인
  });
});

function alphaOf(color: string): number {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context를 생성하지 못했습니다");
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data[3];
}
