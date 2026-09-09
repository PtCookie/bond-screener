/**
 * `ScreenerPresetMenu`는 상태를 들지 않는 프레젠테이션 컴포넌트라 여기서는 콜백 계약만
 * 고정한다 — 목록의 실제 보관은 `tests/hooks/useFilterPresets.test.ts`가 덮는다.
 * 특히 "동명 저장은 확인을 거쳐야 onSave가 불린다"를 회귀 방지한다.
 */
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { ScreenerPresetMenu } from "@/components/screener/ScreenerPresetMenu";
import type { FilterPreset } from "@/lib/screener/presets";

const PRESETS: FilterPreset[] = [
  { id: "p1", name: "국채 단기물", query: "kinds=1101", createdAt: 1 },
  { id: "p2", name: "고금리", query: "srfcInrtMin=5", createdAt: 2 },
];

function renderMenu(overrides: Partial<React.ComponentProps<typeof ScreenerPresetMenu>> = {}) {
  return render(
    <ScreenerPresetMenu
      presets={PRESETS}
      currentQuery="q=현재"
      onSave={() => {}}
      onDelete={() => {}}
      onApply={() => {}}
      {...overrides}
    />,
  );
}

/** 팝오버는 Portal로 body 직속에 렌더된다 — 트리거와 텍스트가 겹칠 수 있어 범위를 좁힌다. */
function popover() {
  const content = document.querySelector('[data-slot="popover-content"]');
  if (!content) throw new Error("팝오버 콘텐츠를 찾지 못했습니다");
  return page.elementLocator(content);
}

async function openMenu(screen: Awaited<ReturnType<typeof renderMenu>>) {
  await userEvent.click(screen.getByRole("button", { name: /저장된 필터/ }));
}

describe("목록", () => {
  test("저장된 프리셋이 없으면 안내 문구를 보여준다", async () => {
    const screen = await renderMenu({ presets: [] });
    await openMenu(screen);

    await expect.element(popover().getByText("저장된 필터가 없습니다.")).toBeInTheDocument();
  });

  test("프리셋을 클릭하면 그 query로 onApply가 호출되고 팝오버가 닫힌다", async () => {
    const onApply = vi.fn();
    const screen = await renderMenu({ onApply });
    await openMenu(screen);

    await userEvent.click(popover().getByRole("button", { name: "고금리", exact: true }));

    expect(onApply).toHaveBeenCalledExactlyOnceWith("srfcInrtMin=5");
    await expect.poll(() => document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  test("삭제 버튼은 해당 id로 onDelete를 호출한다", async () => {
    const onDelete = vi.fn();
    const screen = await renderMenu({ onDelete });
    await openMenu(screen);

    await userEvent.click(popover().getByRole("button", { name: "국채 단기물 삭제" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith("p1");
  });
});

describe("저장", () => {
  test("이름이 비어 있으면 저장 버튼이 disabled다", async () => {
    const screen = await renderMenu();
    await openMenu(screen);

    await expect.element(popover().getByRole("button", { name: "저장" })).toBeDisabled();
  });

  test("새 이름을 입력하고 저장하면 trim된 이름과 현재 쿼리로 onSave가 호출된다", async () => {
    const onSave = vi.fn();
    const screen = await renderMenu({ onSave });
    await openMenu(screen);

    await popover().getByLabelText("프리셋 이름").fill("  회사채  ");
    await userEvent.click(popover().getByRole("button", { name: "저장" }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith("회사채", "q=현재");
  });

  test("입력창에서 Enter를 눌러도 저장된다(팝오버 안에서는 폼의 암묵적 submit이 걸리지 않는다)", async () => {
    const onSave = vi.fn();
    const screen = await renderMenu({ onSave });
    await openMenu(screen);

    await popover().getByLabelText("프리셋 이름").fill("회사채");
    await userEvent.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledExactlyOnceWith("회사채", "q=현재");
  });
});

describe("동명 덮어쓰기", () => {
  test("기존 이름을 입력하면 버튼이 '덮어쓰기'로 바뀌고, 확인해야 onSave가 호출된다", async () => {
    const onSave = vi.fn();
    const screen = await renderMenu({ onSave });
    await openMenu(screen);

    // 대소문자·공백을 무시한 동명 판정을 함께 확인한다.
    await popover().getByLabelText("프리셋 이름").fill(" 고금리 ");
    await userEvent.click(popover().getByRole("button", { name: "덮어쓰기" }));

    // 확인 단계 — 아직 저장되지 않았다.
    expect(onSave).not.toHaveBeenCalled();
    await expect.element(popover().getByText("“고금리” 프리셋을 덮어쓸까요?")).toBeInTheDocument();

    await userEvent.click(popover().getByRole("button", { name: "덮어쓰기" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("고금리", "q=현재");
  });

  test("확인 단계에서 취소하면 저장하지 않고 입력 폼으로 돌아온다", async () => {
    const onSave = vi.fn();
    const screen = await renderMenu({ onSave });
    await openMenu(screen);

    await popover().getByLabelText("프리셋 이름").fill("고금리");
    await userEvent.click(popover().getByRole("button", { name: "덮어쓰기" }));
    await userEvent.click(popover().getByRole("button", { name: "취소" }));

    expect(onSave).not.toHaveBeenCalled();
    await expect.element(popover().getByLabelText("프리셋 이름")).toHaveValue("고금리");
  });
});
