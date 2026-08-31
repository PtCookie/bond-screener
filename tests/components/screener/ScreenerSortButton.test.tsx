/**
 * `ScreenerSortButton`은 `Header<typeof screenerFeatures, ScreenerRow>`를 받으므로,
 * 실제 컬럼 정의 없이 흉내 낸 객체를 넘기면 타입도 런타임 동작도 어긋난다 — 대신
 * `screenerFeatures`와 같은 제네릭으로 최소 2컬럼(정렬 가능 1 + `enableSorting: false` 1)
 * 짜리 실제 테이블을 만들어 그 헤더를 넘긴다. `screenerColumns`(13컬럼 전부 기본
 * 정렬 가능)에는 정렬 불가 컬럼이 없어 이 테스트만을 위한 별도 컬럼셋을 쓴다.
 */
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { createColumnHelper, useTable, type SortingState } from "@tanstack/react-table";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { screenerFeatures } from "@/components/screener/columns";
import { ScreenerSortButton } from "@/components/screener/ScreenerSortButton";
import type { ScreenerRow } from "@/lib/screener/types";
import { makeScreenerRow } from "../../helpers/screener-row";

const helper = createColumnHelper<typeof screenerFeatures, ScreenerRow>();
const columns = helper.columns([
  helper.accessor("trqu", { header: "거래량" }),
  helper.accessor("isinCd", { header: "ISIN", enableSorting: false }),
]);

function Harness({ colIndex }: { colIndex: 0 | 1 }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useTable({
    features: screenerFeatures,
    columns,
    data: [makeScreenerRow()],
    getRowId: (row) => row.isinCd,
    state: { sorting, pagination: { pageIndex: 0, pageSize: 25 } },
    onSortingChange: (updater) => setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    onPaginationChange: () => {},
  });
  const header = table.getHeaderGroups()[0].headers[colIndex];
  return (
    <div>
      <ScreenerSortButton header={header} />
      {/* 정렬 아이콘은 접근성 트리에 텍스트로 드러나지 않아(phosphor svg) 별도로 상태를 노출 */}
      <span data-testid="sort-state">{JSON.stringify(sorting)}</span>
    </div>
  );
}

describe("ScreenerSortButton", () => {
  test("정렬 가능 컬럼은 3-state를 순환하고 3번째 클릭에서 해제로 돌아온다", async () => {
    // TanStack Table v9는 숫자 컬럼(trqu)의 첫 클릭 방향을 desc로 기본 추론한다 —
    // ScreenerSortButton 자체는 방향과 무관하게 순환만 담당하므로, 여기서는 정확한
    // 첫 방향값이 아니라 "클릭마다 상태가 바뀌고 3번째 클릭에서 원래(해제) 상태로
    // 돌아온다"는 순환 계약을 검증한다.
    const screen = await render(<Harness colIndex={0} />);
    const button = screen.getByRole("button", { name: "거래량" });
    const state = screen.getByTestId("sort-state");
    await expect.element(state).toHaveTextContent("[]");

    await userEvent.click(button);
    await expect.poll(() => state.element().textContent).not.toBe("[]");
    const firstDirection = state.element().textContent;

    await userEvent.click(button);
    await expect.poll(() => state.element().textContent).not.toBe(firstDirection);
    const secondDirection = state.element().textContent;
    expect(secondDirection).not.toBe("[]");

    await userEvent.click(button);
    await expect.element(state).toHaveTextContent("[]");
  });

  test("정렬 불가 컬럼은 button이 아니라 span으로 렌더된다", async () => {
    const screen = await render(<Harness colIndex={1} />);
    await expect.element(screen.getByText("ISIN")).toBeInTheDocument();
    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });
});
