import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ScreenerHeader } from "@/components/screener/ScreenerHeader";

describe("ScreenerHeader", () => {
  test("basDt가 null이면 대시로 표시된다", async () => {
    const screen = await render(<ScreenerHeader basDt={null} filteredCount={0} totalCount={0} />);
    await expect.element(screen.getByText("기준일자 —")).toBeInTheDocument();
  });

  test("basDt가 있으면 YYYY-MM-DD로 표시된다", async () => {
    const screen = await render(<ScreenerHeader basDt={20260828} filteredCount={10} totalCount={10} />);
    await expect.element(screen.getByText("기준일자 2026-08-28")).toBeInTheDocument();
  });

  test("필터 전후 건수가 같으면 '총 N건'만 표시한다", async () => {
    const screen = await render(<ScreenerHeader basDt={20260828} filteredCount={100} totalCount={100} />);
    await expect.element(screen.getByText("총 100건")).toBeInTheDocument();
  });

  test("필터 전후 건수가 다르면 둘 다 표시한다", async () => {
    const screen = await render(<ScreenerHeader basDt={20260828} filteredCount={12} totalCount={100} />);
    await expect.element(screen.getByText("12건 / 전체 100건")).toBeInTheDocument();
  });
});
