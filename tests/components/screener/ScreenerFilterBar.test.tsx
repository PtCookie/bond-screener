import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ScreenerFilterBar } from "@/components/screener/ScreenerFilterBar";
import { EMPTY_FILTERS, type ScreenerFilterOptions, type ScreenerFilters } from "@/lib/screener/filters";

const EMPTY_OPTIONS: ScreenerFilterOptions = { grades: [], intTcds: [], markets: [], kinds: [] };

describe("ScreenerFilterBar", () => {
  test("검색어 입력 시 onFiltersChange 함수형 업데이터가 q만 패치한다", async () => {
    const onFiltersChange = vi.fn();
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        onFiltersChange={onFiltersChange}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );

    await screen.getByPlaceholder("종목명·발행인·ISIN 검색").fill("삼성");

    expect(onFiltersChange).toHaveBeenCalled();
    const updater = onFiltersChange.mock.calls.at(-1)?.[0] as (prev: ScreenerFilters) => ScreenerFilters;
    expect(updater(EMPTY_FILTERS)).toEqual({ ...EMPTY_FILTERS, q: "삼성" });
  });

  test("활성 필터가 0건이면 초기화 버튼이 disabled다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );
    await expect.element(screen.getByRole("button", { name: "초기화" })).toBeDisabled();
  });

  test("활성 필터가 있으면 초기화 버튼이 활성화되고 클릭 시 onReset이 호출된다", async () => {
    const onReset = vi.fn();
    const screen = await render(
      <ScreenerFilterBar
        filters={{ ...EMPTY_FILTERS, q: "삼성" }}
        options={EMPTY_OPTIONS}
        onFiltersChange={() => {}}
        onReset={onReset}
        resultCount={3}
        totalCount={10}
      />,
    );
    const resetButton = screen.getByRole("button", { name: "초기화" });
    await expect.element(resetButton).not.toBeDisabled();
    await userEvent.click(resetButton);
    expect(onReset).toHaveBeenCalledOnce();
  });

  test("결과 건수 == 전체 건수면 'N건'만 표시한다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );
    await expect.element(screen.getByText("10건")).toBeInTheDocument();
  });

  test("결과 건수 != 전체 건수면 두 값을 모두 표시한다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={{ ...EMPTY_FILTERS, q: "a" }}
        options={EMPTY_OPTIONS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={3}
        totalCount={10}
      />,
    );
    await expect.element(screen.getByText("3건 / 전체 10건")).toBeInTheDocument();
  });

  test("잔액 필터 — 표시는 억 단위, 콜백은 원 단위로 환산한다(WON_PER_EOK 왕복)", async () => {
    const onFiltersChange = vi.fn();
    const screen = await render(
      <ScreenerFilterBar
        filters={{ ...EMPTY_FILTERS, bondBalMin: 1_000_000_000_000, bondBalMax: null }} // 1e12원 = 10,000억
        options={EMPTY_OPTIONS}
        onFiltersChange={onFiltersChange}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "잔액(억)" }));
    await expect.element(screen.getByLabelText("잔액(억) 최소")).toHaveValue(10000);

    await screen.getByLabelText("잔액(억) 최대").fill("500");
    // 최소 1e12원은 그대로 유지된 채 최대만 5e10원(500억)으로 콜백된다.
    const updater = onFiltersChange.mock.calls.at(-1)?.[0] as (prev: ScreenerFilters) => ScreenerFilters;
    const next = updater({ ...EMPTY_FILTERS, bondBalMin: 1_000_000_000_000, bondBalMax: null });
    expect(next.bondBalMin).toBe(1_000_000_000_000);
    expect(next.bondBalMax).toBe(50_000_000_000);
  });
});
