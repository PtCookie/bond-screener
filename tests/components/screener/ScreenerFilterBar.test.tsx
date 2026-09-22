import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { ScreenerFilterBar } from "@/components/screener/ScreenerFilterBar";
import { EMPTY_FILTERS, type ScreenerFilterOptions, type ScreenerFilters } from "@/lib/screener/filters";

const EMPTY_OPTIONS: ScreenerFilterOptions = { grades: [], intTcds: [], markets: [], kinds: [] };

// 프리셋 관련 props는 필터 바가 ScreenerPresetMenu로 그대로 넘기기만 한다 —
// 동작 자체는 ScreenerPresetMenu.test.tsx가 덮으므로 여기서는 자리만 채운다.
const PRESET_PROPS = {
  presets: [],
  presetQuery: "",
  onSavePreset: () => {},
  onDeletePreset: () => {},
  onApplyPreset: () => {},
};

/**
 * 필터 칩 트리거의 라벨을 DOM 순서대로 뽑는다. 필터 바에는 칩 말고도 팝오버 트리거가
 * 둘 더 있다 — "+" 피커(아이콘만이라 텍스트가 비어 있다)와 프리셋 메뉴("저장된 필터").
 */
function chipTriggerLabels(container: Element): string[] {
  return [...container.querySelectorAll('[data-slot="popover-trigger"]')]
    .map((el) => (el.textContent ?? "").trim())
    .filter((text) => text !== "" && !text.startsWith("저장된 필터"));
}

// Vitest Browser Mode의 기본 뷰포트(414×896)는 md(768px) 미만이라 모바일 갈래로 렌더된다 —
// 이 describe의 테스트는 전부 데스크톱(칩이 항상 펼쳐진) 의미이므로 명시적으로 넓힌다.
describe("ScreenerFilterBar (데스크톱)", () => {
  beforeEach(async () => {
    await page.viewport(1200, 800);
  });

  test("검색어 입력 시 onFiltersChange 함수형 업데이터가 q만 패치한다", async () => {
    const onFiltersChange = vi.fn();
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
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
        {...PRESET_PROPS}
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
        {...PRESET_PROPS}
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
        {...PRESET_PROPS}
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
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={3}
        totalCount={10}
      />,
    );
    await expect.element(screen.getByText("3건 / 전체 10건")).toBeInTheDocument();
  });
  // 사용자가 "+"로 무엇을 언제 켜든 기본 5개는 이 순서를 지켜야 한다 — 렌더가
  // CHIP_FILTER_DEFS를 거르는 형태라 켠 순서가 아니라 레지스트리 순서를 따른다.
  test("기본 칩은 종류·신용등급·표면이율·만기일·수익률 5개이고 DOM 순서도 그대로다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );

    expect(chipTriggerLabels(screen.container)).toEqual([
      "종류 전체",
      "신용등급 전체",
      "표면이율(%)",
      "만기일",
      "수익률(%)",
    ]);
  });

  test("기본 상태에서는 이자유형·시장구분 칩이 없다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );

    await expect.element(screen.getByRole("button", { name: "이자유형 전체" })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "시장구분 전체" })).not.toBeInTheDocument();
  });

  // 칩 구성은 URL에 저장하지 않으므로, 값만 들어오는 경로(URL 복원·프리셋 적용)가 존재한다.
  // 합집합 규칙이 없으면 "값은 걸렸는데 칩이 없어 해제할 수 없는" 상태가 만들어진다.
  test("숨겨진 필터라도 값이 들어있으면 칩이 드러난다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={{ ...EMPTY_FILTERS, intTcds: ["01"] }}
        options={{ ...EMPTY_OPTIONS, intTcds: [{ code: "01", label: "이표채", count: 1 }] }}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={3}
        totalCount={10}
      />,
    );

    await expect.element(screen.getByRole("button", { name: "이자유형 1" })).toBeInTheDocument();
  });

  test("피커에서 필터를 켜면 칩이 레지스트리 자리(기본 5개 뒤)에 들어간다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={{ ...EMPTY_OPTIONS, markets: [{ code: "KTS", label: "KTS", count: 1 }] }}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "필터 추가" }));
    await userEvent.click(screen.getByText("시장구분"));
    await userEvent.keyboard("{Escape}");

    // 이자유형(레지스트리 7번째)은 켜지 않았으므로, 시장구분이 수익률 바로 뒤에 온다.
    expect(chipTriggerLabels(screen.container)).toEqual([
      "종류 전체",
      "신용등급 전체",
      "표면이율(%)",
      "만기일",
      "수익률(%)",
      "시장구분 전체",
    ]);
  });

  test("칩을 제거하면 그 필터의 값도 함께 비워진다", async () => {
    const onFiltersChange = vi.fn();
    const screen = await render(
      <ScreenerFilterBar
        filters={{ ...EMPTY_FILTERS, grades: ["AAA"] }}
        options={{ ...EMPTY_OPTIONS, grades: [{ code: "AAA", label: "AAA", count: 1 }] }}
        {...PRESET_PROPS}
        onFiltersChange={onFiltersChange}
        onReset={() => {}}
        resultCount={3}
        totalCount={10}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "신용등급 1" }));
    await userEvent.click(screen.getByRole("button", { name: "신용등급 필터 제거" }));

    // 값을 남기면 합집합 규칙이 칩을 즉시 되살릴 뿐 아니라, 보이지 않는 필터가
    // 결과를 거르는 상태가 된다.
    const updater = onFiltersChange.mock.calls.at(-1)?.[0] as (prev: ScreenerFilters) => ScreenerFilters;
    expect(updater({ ...EMPTY_FILTERS, grades: ["AAA"] })).toEqual(EMPTY_FILTERS);
  });

  // 헤더와 같은 규약 — 로딩 중 "0건"은 "진짜 0건"과 구분되지 않는다.
  test("로딩 중에는 결과 건수 배지 대신 스켈레톤을 표시한다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={0}
        totalCount={0}
        status="loading"
      />,
    );

    await expect.element(screen.getByText("0건", { exact: true })).not.toBeInTheDocument();
    expect(screen.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    // 필터 컨트롤 자체는 계속 보인다.
    await expect.element(screen.getByPlaceholder("종목명·발행인·ISIN 검색")).toBeInTheDocument();
  });
});

// 375px에서 칩 전부를 펼쳐두면 4줄(~340px)이 sticky로 화면을 영구 점유한다(ui-audit ⑧) —
// 모바일에서는 검색창·토글·건수만 담은 한 줄만 보이고 나머지 필터는 접힌 패널 안에 있다.
describe("ScreenerFilterBar (모바일)", () => {
  beforeEach(async () => {
    await page.viewport(390, 800);
  });

  test("초기 상태 — 칩은 숨겨져 있고 검색창·필터 토글·건수만 보인다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );

    await expect.element(screen.getByPlaceholder("종목명·발행인·ISIN 검색")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "필터", exact: true })).toBeInTheDocument();
    await expect.element(screen.getByText("10건")).toBeInTheDocument();
    // 칩은 접힌 패널 안에 있어 아직 접근 트리에 나타나지 않는다(base-ui Collapsible은
    // 닫힌 패널을 hidden 처리한다).
    await expect.element(screen.getByRole("button", { name: "신용등급 전체" })).not.toBeInTheDocument();
  });

  test("필터 토글을 누르면 칩이 나타난다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={EMPTY_FILTERS}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={10}
        totalCount={10}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "필터", exact: true }));
    await expect.element(screen.getByRole("button", { name: "신용등급 전체" })).toBeInTheDocument();
  });

  test("활성 필터 수가 토글 버튼에 표시된다", async () => {
    const screen = await render(
      <ScreenerFilterBar
        filters={{ ...EMPTY_FILTERS, q: "삼성", grades: ["AAA"] }}
        options={EMPTY_OPTIONS}
        {...PRESET_PROPS}
        onFiltersChange={() => {}}
        onReset={() => {}}
        resultCount={3}
        totalCount={10}
      />,
    );

    // activeCount는 q·grades 2건 — 검색어는 검색창 자체에 이미 보이므로 토글 라벨은
    // countActiveFilters 값을 그대로 반영한다.
    await expect.element(screen.getByRole("button", { name: "필터 2" })).toBeInTheDocument();

    // 다음 테스트에 영향 없도록 되돌린다(ScreenerTable.test.tsx의 관례와 동일).
    await page.viewport(1200, 800);
  });
});
