import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ScreenerEmpty } from "@/components/screener/ScreenerEmpty";

describe("ScreenerEmpty", () => {
  test("onResetFilters가 없으면 버튼이 렌더되지 않는다", async () => {
    const screen = await render(<ScreenerEmpty />);
    await expect.element(screen.getByText("조건에 맞는 채권이 없습니다.")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "필터 초기화" })).not.toBeInTheDocument();
  });

  test("onResetFilters가 있으면 버튼이 렌더되고 클릭 시 호출된다", async () => {
    const onReset = vi.fn();
    const screen = await render(<ScreenerEmpty onResetFilters={onReset} />);
    const button = screen.getByRole("button", { name: "필터 초기화" });
    await expect.element(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
