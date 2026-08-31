/**
 * `ScreenerPagination`은 `ReactTable<typeof screenerFeatures, ScreenerRow>`를 받는다 —
 * `screenerColumns`/`screenerFeatures`로 실제 테이블을 만들어 페이지네이션 상태를 조작한다.
 */
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { useTable, type PaginationState } from "@tanstack/react-table";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { screenerColumns, screenerFeatures } from "@/components/screener/columns";
import { ScreenerPagination } from "@/components/screener/ScreenerPagination";
import type { ScreenerRow } from "@/lib/screener/types";
import { makeScreenerRow } from "../../helpers/screener-row";

function makeRows(n: number): ScreenerRow[] {
  return Array.from({ length: n }, (_, i) => makeScreenerRow({ isinCd: `KR${String(i).padStart(10, "0")}` }));
}

function Harness({ rows, initialPageIndex = 0 }: { rows: ScreenerRow[]; initialPageIndex?: number }) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: initialPageIndex, pageSize: 25 });
  const table = useTable({
    features: screenerFeatures,
    columns: screenerColumns,
    data: rows,
    getRowId: (row) => row.isinCd,
    state: { sorting: [], pagination },
    onSortingChange: () => {},
    onPaginationChange: (updater) => setPagination((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    // BondScreener.tsx와 동일 — 끄지 않으면 TanStack Table이 매 상태 변경마다 pageIndex를
    // 0으로 자동 리셋해 nextPage() 등 페이지 이동 자체가 무력화된다.
    autoResetPageIndex: false,
  });
  return <ScreenerPagination table={table} totalCount={rows.length} />;
}

describe("ScreenerPagination", () => {
  test("총 0건이면 '0–0 / 전체 0건'을 표시한다", async () => {
    const screen = await render(<Harness rows={[]} />);
    await expect.element(screen.getByText("0–0 / 전체 0건")).toBeInTheDocument();
  });

  test("첫 페이지에서는 처음/이전 버튼이 disabled다", async () => {
    const screen = await render(<Harness rows={makeRows(30)} />);
    await expect.element(screen.getByText("1–25 / 전체 30건")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "처음 페이지" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "다음 페이지" })).not.toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "마지막 페이지" })).not.toBeDisabled();
  });

  test("마지막 페이지에서는 다음/마지막 버튼이 disabled고 범위가 총 건수에서 잘린다", async () => {
    const screen = await render(<Harness rows={makeRows(30)} initialPageIndex={1} />);
    await expect.element(screen.getByText("26–30 / 전체 30건")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "다음 페이지" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "마지막 페이지" })).toBeDisabled();
  });

  test("다음 페이지 클릭 시 페이지가 넘어간다", async () => {
    const screen = await render(<Harness rows={makeRows(60)} />);
    await userEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await expect.element(screen.getByText("26–50 / 전체 60건")).toBeInTheDocument();
  });

  test("pageSize 버튼 클릭 시 페이지 크기가 바뀐다", async () => {
    const screen = await render(<Harness rows={makeRows(60)} />);
    await userEvent.click(screen.getByRole("button", { name: "50" }));
    await expect.element(screen.getByText("1–50 / 전체 60건")).toBeInTheDocument();
  });
});
