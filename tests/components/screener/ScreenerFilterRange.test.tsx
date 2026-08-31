import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ScreenerFilterRange } from "@/components/screener/ScreenerFilterRange";

describe("ScreenerFilterRange", () => {
  test("트리거 클릭 시 팝오버가 열리고 최소/최대 입력이 aria-label로 조회된다", async () => {
    const screen = await render(<ScreenerFilterRange label="표면이율(%)" min={null} max={null} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "표면이율(%)" }));
    await expect.element(screen.getByLabelText("표면이율(%) 최소")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("표면이율(%) 최대")).toBeInTheDocument();
  });

  test("숫자 입력 — 빈 문자열은 null로 콜백된다", async () => {
    const onChange = vi.fn();
    const screen = await render(<ScreenerFilterRange label="표면이율(%)" min={3} max={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "표면이율(%)" }));
    const minInput = screen.getByLabelText("표면이율(%) 최소");
    await minInput.fill("");
    expect(onChange).toHaveBeenLastCalledWith(null, null);
  });

  test("숫자 입력 — 값 변경 시 min/max 쌍으로 콜백된다", async () => {
    const onChange = vi.fn();
    const screen = await render(<ScreenerFilterRange label="잔액(억)" min={null} max={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "잔액(억)" }));
    await screen.getByLabelText("잔액(억) 최대").fill("500");
    expect(onChange).toHaveBeenLastCalledWith(null, 500);
  });

  test("date 타입 — YYYYMMDD 정수가 YYYY-MM-DD로 표시되고 입력이 다시 정수로 콜백된다", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterRange label="만기일" inputType="date" min={20260101} max={null} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "만기일" }));
    const minInput = screen.getByLabelText("만기일 최소");
    await expect.element(minInput).toHaveValue("2026-01-01");

    const maxInput = screen.getByLabelText("만기일 최대");
    await maxInput.fill("2026-12-31");
    expect(onChange).toHaveBeenLastCalledWith(20260101, 20261231);
  });

  test("활성(min/max 중 하나라도 값 있음) 여부와 무관하게 트리거 라벨은 항상 같다", async () => {
    const screen = await render(<ScreenerFilterRange label="수익률(%)" min={1} max={null} onChange={() => {}} />);
    await expect.element(screen.getByRole("button", { name: "수익률(%)" })).toBeInTheDocument();
  });
});
