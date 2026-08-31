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
});
