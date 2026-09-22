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
    const screen = await render(<ScreenerFilterRange label="수익률(%)" min={null} max={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "수익률(%)" }));
    await screen.getByLabelText("수익률(%) 최대").fill("500");
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

  test("팝오버의 해제 버튼은 min/max를 함께 비운다", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterRange label="만기일" inputType="date" min={20260101} max={20261231} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "만기일" }));
    await userEvent.click(screen.getByRole("button", { name: "만기일 해제" }));

    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  test("min/max가 모두 null이면 해제 버튼이 disabled다", async () => {
    const screen = await render(<ScreenerFilterRange label="수익률(%)" min={null} max={null} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "수익률(%)" }));

    await expect.element(screen.getByRole("button", { name: "수익률(%) 해제" })).toBeDisabled();
  });

  test("onRemove를 주면 제거 버튼이 생기고, 주지 않으면 없다", async () => {
    const onRemove = vi.fn();
    const screen = await render(
      <ScreenerFilterRange label="거래량" inputType="amount" min={null} max={null} onChange={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "거래량" }));
    await expect.element(screen.getByRole("button", { name: "거래량 필터 제거" })).not.toBeInTheDocument();

    await screen.rerender(
      <ScreenerFilterRange
        label="거래량"
        inputType="amount"
        min={null}
        max={null}
        onChange={() => {}}
        onRemove={onRemove}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "거래량 필터 제거" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  test("priceDerived면 시세 없는 종목이 빠진다는 안내를 띄운다", async () => {
    const screen = await render(
      <ScreenerFilterRange label="거래량" inputType="amount" min={null} max={null} onChange={() => {}} priceDerived />,
    );
    await userEvent.click(screen.getByRole("button", { name: "거래량" }));
    await expect.element(screen.getByText("시세가 없는 종목은 결과에서 제외됩니다.")).toBeInTheDocument();
  });
});

// 원 단위 raw 값(5000000000)을 그대로 타이핑하게 하면 0을 세야 해서 쓸 수 없다 —
// 저장값은 언제나 원 단위로 두고 입력 표기만 환산한다.
describe("ScreenerFilterRange (amount 단위 환산)", () => {
  test("억 단위로 열리고 저장값을 나눠서 표시한다", async () => {
    const screen = await render(
      <ScreenerFilterRange label="채권잔액" inputType="amount" min={150_000_000} max={null} onChange={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "채권잔액" }));
    await expect.element(screen.getByLabelText("채권잔액 최소")).toHaveValue(1.5);
  });

  test("입력값에 단위 배수를 곱해 원 단위로 콜백한다", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterRange label="채권잔액" inputType="amount" min={null} max={null} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "채권잔액" }));
    await screen.getByLabelText("채권잔액 최소").fill("50");

    expect(onChange).toHaveBeenLastCalledWith(5_000_000_000, null);
  });

  test("소수 입력도 부동소수 오차 없이 정수로 반올림된다", async () => {
    // 0.07 * 1e8 === 7000000.000000001 — Math.round가 없으면 이 값이 그대로 URL에 실린다.
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterRange label="채권잔액" inputType="amount" min={null} max={null} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "채권잔액" }));
    await screen.getByLabelText("채권잔액 최소").fill("0.07");

    expect(onChange).toHaveBeenLastCalledWith(7_000_000, null);
  });

  test("단위를 바꾸면 표시값만 바뀌고 저장값은 그대로다", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <ScreenerFilterRange label="채권잔액" inputType="amount" min={5_000_000_000} max={null} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "채권잔액" }));
    await expect.element(screen.getByLabelText("채권잔액 최소")).toHaveValue(50);

    await userEvent.click(screen.getByRole("button", { name: "채권잔액 단위 조" }));
    await expect.element(screen.getByLabelText("채권잔액 최소")).toHaveValue(0.005);
    // 단위 전환 자체는 값을 바꾸지 않는다.
    expect(onChange).not.toHaveBeenCalled();
  });

  test("이미 조 단위 값이 들어있으면 조 단위로 열린다", async () => {
    const screen = await render(
      <ScreenerFilterRange
        label="채권잔액"
        inputType="amount"
        min={3_000_000_000_000}
        max={null}
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "채권잔액" }));
    await expect.element(screen.getByLabelText("채권잔액 최소")).toHaveValue(3);
  });
});
