import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { ScreenerFilterPicker } from "@/components/screener/ScreenerFilterPicker";
import { CHIP_FILTER_DEFS, DEFAULT_VISIBLE_FILTER_IDS } from "@/lib/screener/filter-defs";

/** Base UI 팝오버는 Portal로 body 직속에 뜬다 — 표·칩과 텍스트가 겹치지 않게 스코프를 좁힌다. */
function popoverContent(): Element {
  const el = document.querySelector('[data-slot="popover-content"]');
  if (el === null) throw new Error("popover content not found");
  return el;
}

describe("ScreenerFilterPicker", () => {
  test("트리거는 '필터 추가' 접근성 이름을 가진다", async () => {
    const screen = await render(
      <ScreenerFilterPicker visibleIds={DEFAULT_VISIBLE_FILTER_IDS} onToggle={() => {}} onResetVisibility={() => {}} />,
    );
    await expect.element(screen.getByRole("button", { name: "필터 추가" })).toBeInTheDocument();
  });

  test("칩으로 그릴 수 있는 필터를 전부 목록에 보여준다", async () => {
    const screen = await render(
      <ScreenerFilterPicker visibleIds={DEFAULT_VISIBLE_FILTER_IDS} onToggle={() => {}} onResetVisibility={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "필터 추가" }));

    const text = popoverContent().textContent ?? "";
    for (const def of CHIP_FILTER_DEFS) {
      expect(text).toContain(def.label);
    }
  });

  test("체크 상태가 visibleIds를 반영한다", async () => {
    const screen = await render(
      <ScreenerFilterPicker visibleIds={["grades"]} onToggle={() => {}} onResetVisibility={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "필터 추가" }));

    const popover = page.elementLocator(popoverContent());
    await expect.element(popover.getByRole("checkbox", { name: "신용등급" })).toBeChecked();
    await expect.element(popover.getByRole("checkbox", { name: "시장구분" })).not.toBeChecked();
  });

  test("숨겨진 필터를 체크하면 onToggle(id, true)로 통보한다", async () => {
    const onToggle = vi.fn();
    const screen = await render(
      <ScreenerFilterPicker visibleIds={DEFAULT_VISIBLE_FILTER_IDS} onToggle={onToggle} onResetVisibility={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "필터 추가" }));
    await userEvent.click(screen.getByText("시장구분"));

    expect(onToggle).toHaveBeenCalledWith("markets", true);
  });

  test("보이는 필터를 체크 해제하면 onToggle(id, false)로 통보한다", async () => {
    const onToggle = vi.fn();
    const screen = await render(
      <ScreenerFilterPicker visibleIds={DEFAULT_VISIBLE_FILTER_IDS} onToggle={onToggle} onResetVisibility={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "필터 추가" }));
    await userEvent.click(screen.getByText("신용등급"));

    expect(onToggle).toHaveBeenCalledWith("grades", false);
  });

  test("기본값 버튼이 onResetVisibility를 호출한다", async () => {
    const onResetVisibility = vi.fn();
    const screen = await render(
      <ScreenerFilterPicker visibleIds={["markets"]} onToggle={() => {}} onResetVisibility={onResetVisibility} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "필터 추가" }));
    await userEvent.click(screen.getByRole("button", { name: "기본값" }));

    expect(onResetVisibility).toHaveBeenCalledOnce();
  });
});
