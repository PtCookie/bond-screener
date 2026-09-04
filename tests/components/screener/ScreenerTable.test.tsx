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
