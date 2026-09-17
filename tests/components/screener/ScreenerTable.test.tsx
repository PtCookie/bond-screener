/**
 * `ScreenerTable`은 `useIsMobile()`로 실제 뷰포트를 평가해 데스크톱/모바일 레이아웃을
 * 가르므로, `page.viewport()`로 진짜 뷰포트를 바꿔가며 검증한다(Browser Mode의 이득).
 */
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { useTable, type PaginationState, type SortingState } from "@tanstack/react-table";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MOBILE_DATA_COLUMN_ORDER, screenerColumns, screenerFeatures } from "@/components/screener/columns";
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

  // ui-audit ⑨ — 375px에서는 앞 3칸만 실제로 보이므로, 데스크톱 컬럼 순서(종류·발행일·표면이율…)
  // 그대로 두면 시세 값이 가로 스크롤 너머로 밀려난다. 모바일에서만 만기일·종가·수익률을 앞으로 뺀다.
  test("모바일 헤더 2행은 만기일·종가·수익률 순으로 재배열된다", async () => {
    await page.viewport(390, 800);
    const screen = await render(<Harness rows={makeRows(1)} />);
    await expect.element(screen.getByText("테스트채권0")).toBeInTheDocument();

    const headerTexts = Array.from(screen.container.querySelectorAll("thead tr:nth-child(2) th")).map((th) =>
      th.textContent?.trim(),
    );
    expect(headerTexts.slice(0, 3)).toEqual(["만기일", "종가", "수익률"]);
    await page.viewport(1200, 800); // 다음 테스트에 영향 없도록 되돌린다.
  });

  test("모바일 데이터 행도 헤더와 같은 순서로 재배열된다", async () => {
    await page.viewport(390, 800);
    // bondExprDt=20250101 → "2025-01-01", clprPrc=10000 → "10,000", clprBnfRt=3.2 → "3.200%"
    // (makeScreenerRow 기본값, tests/helpers/screener-row.ts).
    const screen = await render(<Harness rows={makeRows(1)} />);
    await expect.element(screen.getByText("테스트채권0")).toBeInTheDocument();

    // 종목당 2행(이름 행 + 데이터 행) — 두 번째 tr이 데이터 행이다.
    const cellTexts = Array.from(screen.container.querySelectorAll("tbody tr:nth-child(2) td")).map((td) =>
      td.textContent?.trim(),
    );
    expect(cellTexts.slice(0, 3)).toEqual(["2025-01-01", "10,000", "3.200%"]);
    await page.viewport(1200, 800); // 다음 테스트에 영향 없도록 되돌린다.
  });

  // ui-audit ⑦ — 방향 표시가 phosphor 캐럿 svg뿐이라 스크린리더에는 정렬 상태가 전혀
  // 전달되지 않았다. 아이콘이 아니라 <th aria-sort>가 정본이다.
  test("데스크톱 th의 aria-sort가 클릭에 따라 none → 방향 → none으로 순환한다", async () => {
    await page.viewport(1200, 800);
    const screen = await render(<Harness rows={makeRows(3)} />);
    await expect.element(screen.getByText("테스트채권0")).toBeInTheDocument();

    const sortStates = () => Array.from(screen.container.querySelectorAll("thead th")).map((th) => th.ariaSort);

    // screenerColumns는 11컬럼 전부 정렬 가능하므로 전부 "none"에서 시작한다.
    expect(sortStates()).toEqual(Array(screenerColumns.length).fill("none"));

    const header = screen.getByRole("button", { name: "표면이율" });
    await userEvent.click(header);
    // 정렬이 걸린 th는 정확히 하나여야 한다(aria-sort 규약).
    await expect.poll(() => sortStates().filter((v) => v !== "none")).toHaveLength(1);
    const first = sortStates().find((v) => v !== "none");
    expect(first === "ascending" || first === "descending").toBe(true);

    await userEvent.click(header);
    await expect.poll(() => sortStates().find((v) => v !== "none")).not.toBe(first);

    await userEvent.click(header);
    await expect.poll(() => sortStates().every((v) => v === "none")).toBe(true);
  });

  test("모바일에서도 헤더 2행 th에 aria-sort가 붙는다", async () => {
    await page.viewport(390, 800);
    const screen = await render(<Harness rows={makeRows(1)} />);
    await expect.element(screen.getByText("테스트채권0")).toBeInTheDocument();

    const dataHeaders = Array.from(screen.container.querySelectorAll("thead tr:nth-child(2) th"));
    expect(dataHeaders.map((th) => th.ariaSort)).toEqual(Array(dataHeaders.length).fill("none"));
    // 1행(종목명, colSpan)도 정렬 가능한 헤더라 같은 규약을 따른다.
    expect(screen.container.querySelector("thead tr:nth-child(1) th")?.ariaSort).toBe("none");

    await page.viewport(1200, 800); // 다음 테스트에 영향 없도록 되돌린다.
  });

  // 재배열 목록을 깜빡 갱신하지 않아도 모바일에서 컬럼이 조용히 사라지지 않는지 정적으로 가드한다.
  test("MOBILE_DATA_COLUMN_ORDER는 종목명을 제외한 전체 컬럼과 정확히 일치한다", () => {
    const allDataColumnIds = screenerColumns.slice(1).map((col) => (col as { accessorKey: string }).accessorKey);
    expect(new Set(MOBILE_DATA_COLUMN_ORDER)).toEqual(new Set(allDataColumnIds));
    expect(MOBILE_DATA_COLUMN_ORDER).toHaveLength(allDataColumnIds.length);
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

  // ui-audit ⑫⑮: 종목명 링크가 일반 텍스트와 동일하게 렌더돼(색·밑줄·hover 전무)
  // 이 화면의 유일한 주요 액션에 어포던스가 없었다. `text-link`(밑줄은 hover에서만)로
  // 고정한다 — `--link`는 `--primary`를 텍스트로 재사용하되, 다크 --primary(L 0.432)는
  // 배경 위 텍스트로 쓰면 실측 대비 2.60:1로 WCAG AA에 못 미쳐 다크에서만 별도로 밝힌
  // 값이다(`global.css` 참고). 그래서 다크 모드에서 색이 달라지는 것까지 함께 고정한다.
  test("종목명 링크는 일반 텍스트와 구분되는 색과 hover 밑줄을 갖고, 다크 모드에서 대비 보정된 색을 쓴다", async () => {
    const screen = await render(<Harness rows={makeRows(1)} />);
    const link = screen.container.querySelector<HTMLElement>("tbody tr td:first-child a");
    const plainCell = screen.container.querySelector<HTMLElement>("tbody tr td:nth-child(2) span");
    if (!link || !plainCell) throw new Error("링크 또는 비교 대상 셀을 찾지 못했습니다");

    // 이전 테스트가 남긴 실제(물리) 마우스 좌표가 이번에 새로 렌더된 링크와 같은 화면
    // 위치에 겹치면 hover 없이도 hover 상태로 잡힐 수 있어, 무관한 셀로 먼저 옮겨 둔다.
    await screen.getByText("회사채").hover();

    const lightLinkColor = getComputedStyle(link).color;
    expect(getComputedStyle(link).textDecorationLine).toBe("none");
    expect(lightLinkColor).not.toBe(getComputedStyle(plainCell).color);

    await screen.getByText("테스트채권0").hover();
    expect(getComputedStyle(link).textDecorationLine).toBe("underline");

    document.documentElement.classList.add("dark");
    expect(getComputedStyle(link).color).not.toBe(lightLinkColor);
    document.documentElement.classList.remove("dark");
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
