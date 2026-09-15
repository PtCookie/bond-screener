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

  // 0을 그대로 그리면 "아직 안 왔다"와 "진짜 0건이다"가 화면에서 구분되지 않는다.
  test("로딩 중에는 건수·기준일자 대신 스켈레톤을 표시한다", async () => {
    const screen = await render(<ScreenerHeader basDt={null} filteredCount={0} totalCount={0} status="loading" />);

    await expect.element(screen.getByText("총 0건", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("기준일자 —")).not.toBeInTheDocument();
    // 라벨 자체는 남아 무엇을 기다리는지 보인다.
    await expect.element(screen.getByText("기준일자", { exact: false })).toBeInTheDocument();
    expect(screen.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  // 실패 상태에서 스켈레톤을 깜빡이면 "로딩이 끝나지 않는다"로 읽힌다 — 아예 그리지 않는다.
  test("에러 상태에서는 건수·기준일자·스켈레톤을 모두 그리지 않는다", async () => {
    const screen = await render(<ScreenerHeader basDt={null} filteredCount={0} totalCount={0} status="error" />);

    await expect.element(screen.getByText("총 0건", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("기준일자", { exact: false })).not.toBeInTheDocument();
    expect(screen.container.querySelector('[data-slot="skeleton"]')).toBeNull();
    // 제목은 남는다.
    await expect.element(screen.getByRole("heading", { name: "채권 스크리너" })).toBeInTheDocument();
  });
});
