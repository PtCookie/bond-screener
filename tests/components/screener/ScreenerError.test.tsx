import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ScreenerError } from "@/components/screener/ScreenerError";

describe("ScreenerError", () => {
  test("에러 메시지를 표시하고 다시 시도 클릭 시 콜백을 호출한다", async () => {
    const onRetry = vi.fn();
    const screen = await render(<ScreenerError message="네트워크 오류" onRetry={onRetry} />);

    await expect.element(screen.getByText("데이터를 불러오지 못했습니다.")).toBeInTheDocument();
    await expect.element(screen.getByText("네트워크 오류")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
