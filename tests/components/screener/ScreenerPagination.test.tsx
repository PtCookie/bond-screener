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
import type { ScreenerRow, ScreenerStatus } from "@/lib/screener/types";
import { makeScreenerRow } from "../../helpers/screener-row";

function makeRows(n: number): ScreenerRow[] {
  return Array.from({ length: n }, (_, i) => makeScreenerRow({ isinCd: `KR${String(i).padStart(10, "0")}` }));
}

function Harness({
  rows,
  initialPageIndex = 0,
  status,
}: {
  rows: ScreenerRow[];
  initialPageIndex?: number;
  status?: ScreenerStatus;
}) {
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
  return <ScreenerPagination table={table} totalCount={rows.length} status={status} />;
}

describe("ScreenerPagination", () => {
  test("총 0건이면 '0–0 / 전체 0건'을 표시한다", async () => {
    const screen = await render(<Harness rows={[]} />);
    await expect.element(screen.getByText("0–0 / 전체 0건")).toBeInTheDocument();
  });

  /**
   * 로딩 중에도 바가 통째로 사라지지 않는 것이 이 테스트의 요점이다 — 언마운트하면
   * 로딩 완료 순간 페이지가 바 높이만큼 튀고(표가 max-h-[70vh]로 잘려 바가 fold 근처에 있다),
   * 페이지 크기 버튼처럼 URL/sessionStorage에서 이미 복원된 "맞는 정보"까지 함께 버리게 된다.
   */
  test("로딩 중에는 건수·페이지 번호만 스켈레톤이 되고 바와 페이지 크기 버튼은 남는다", async () => {
    const screen = await render(<Harness rows={[]} status="loading" />);

    await expect.element(screen.getByText("0–0 / 전체 0건")).not.toBeInTheDocument();
    // 복원된 pageIndex가 1이면 "2 / 1"이라는 불가능한 값이 나온다 — 슬롯째 대체해 그것까지 막는다.
    await expect.element(screen.getByText("1 / 1")).not.toBeInTheDocument();

    await expect.element(screen.getByRole("button", { name: "25" })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "50" })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "100" })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "다음 페이지" })).toBeInTheDocument();
  });

  test("로딩 중 pageIndex가 복원돼 있어도 '2 / 1' 같은 불가능한 값이 뜨지 않는다", async () => {
    const screen = await render(<Harness rows={[]} initialPageIndex={1} status="loading" />);
    await expect.element(screen.getByText("2 / 1")).not.toBeInTheDocument();
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
