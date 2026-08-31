import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ScreenerFilterMultiSelect } from "@/components/screener/ScreenerFilterMultiSelect";

const OPTIONS = [
  { code: "AAA", label: "AAA", count: 3 },
  { code: "AA+", label: "AA+", count: 5 },
];

describe("ScreenerFilterMultiSelect", () => {
  test("선택 0건이면 '전체', n건이면 개수를 트리거에 표시한다", async () => {
    const screen = await render(
      <ScreenerFilterMultiSelect label="신용등급" options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    await expect.element(screen.getByText("신용등급 전체")).toBeInTheDocument();

    await screen.rerender(
      <ScreenerFilterMultiSelect label="신용등급" options={OPTIONS} selected={["AAA"]} onChange={() => {}} />,
    );
    await expect.element(screen.getByText("신용등급 1")).toBeInTheDocument();
  });

  test("options가 0건이면 트리거가 disabled다", async () => {
    const screen = await render(
      <ScreenerFilterMultiSelect label="신용등급" options={[]} selected={[]} onChange={() => {}} />,
    );
    await expect.element(screen.getByRole("button", { name: "신용등급 전체" })).toBeDisabled();
  });

  test("팝오버를 열고 체크박스를 누르면 onChange가 코드를 추가한다", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterMultiSelect label="신용등급" options={OPTIONS} selected={[]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "신용등급 전체" }));
    await userEvent.click(screen.getByText("AAA"));

    expect(onChange).toHaveBeenCalledWith(["AAA"]);
  });

  test("이미 선택된 코드를 다시 누르면 onChange가 그 코드를 제거한다", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterMultiSelect label="신용등급" options={OPTIONS} selected={["AAA", "AA+"]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "신용등급 2" }));
    await userEvent.click(screen.getByText("AAA"));

    expect(onChange).toHaveBeenCalledWith(["AA+"]);
  });

  test("options가 있으면 팝오버에 각 항목과 건수가 보인다", async () => {
    const screen = await render(
      <ScreenerFilterMultiSelect label="신용등급" options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "신용등급 전체" }));
    await expect.element(screen.getByText("AAA")).toBeInTheDocument();
    await expect.element(screen.getByText("5")).toBeInTheDocument();
  });
});
