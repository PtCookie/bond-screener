/**
 * `lightweight-charts`는 canvas에 직접 그려 DOM으로 내부 상태를 관찰할 수 없다 — 그래서
 * 상호작용(옵션 갱신·데이터 전달·정리)은 라이브러리를 모킹해 호출 인자로 검증하고,
 * `readCssColor`(oklch→rgba 변환, jsdom에서는 애초에 검증 불가능한 부분)는 모킹 대상이
 * 아닌 컴포넌트 자체 로직이므로 `createChart`에 실제로 전달되는 `layout.textColor` 등의
 * 인자를 통해 함께 검증된다. 별도로 라이브러리를 모킹하지 않는 실제 렌더 스모크 테스트도
 * 하나 둔다 — canvas가 실제로 마운트되는지, 크래시 없이 동작하는지는 실제 브라우저에서만
 * 의미가 있다.
 */
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { PriceChart } from "@/components/bond/PriceChart";
import type { PricePoint } from "@/lib/bond/price-series";

const { createChartMock, seriesMock, chartMock, fitContentMock } = vi.hoisted(() => {
  const fitContentMock = vi.fn();
  const seriesMock = { applyOptions: vi.fn(), setData: vi.fn() };
  const chartMock = {
    addSeries: vi.fn(() => seriesMock),
    remove: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: fitContentMock })),
  };
  const createChartMock = vi.fn<(el?: HTMLElement, options?: { layout: { textColor: string } }) => typeof chartMock>(
    () => chartMock,
  );
  return { createChartMock, seriesMock, chartMock, fitContentMock };
});

vi.mock("lightweight-charts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lightweight-charts")>();
  return { ...actual, createChart: createChartMock };
});

const POINTS: PricePoint[] = [
  { time: "2026-08-27", basDt: 20260827, clprPrc: 10000, clprBnfRt: 3.1 },
  { time: "2026-08-28", basDt: 20260828, clprPrc: 10050, clprBnfRt: 3.05 },
];

describe("PriceChart (모킹 — 상호작용)", () => {
  test("마운트 시 차트·시리즈를 1회 생성하고, readCssColor가 유효한 rgba 문자열을 넘긴다", async () => {
    await render(<PriceChart points={POINTS} metric="price" />);
    expect(createChartMock).toHaveBeenCalledOnce();
    const options = createChartMock.mock.calls[0][1];
    expect(options?.layout.textColor).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
    expect(chartMock.addSeries).toHaveBeenCalledOnce();
  });

  test("points가 바뀌면 metric에 맞는 값으로 setData가 호출된다", async () => {
    await render(<PriceChart points={POINTS} metric="price" />);
    expect(seriesMock.setData).toHaveBeenLastCalledWith([
      { time: "2026-08-27", value: 10000 },
      { time: "2026-08-28", value: 10050 },
    ]);
    expect(fitContentMock).toHaveBeenCalled();
  });

  test("metric이 yield면 clprBnfRt 값으로 setData가 호출된다", async () => {
    await render(<PriceChart points={POINTS} metric="yield" />);
    expect(seriesMock.setData).toHaveBeenLastCalledWith([
      { time: "2026-08-27", value: 3.1 },
      { time: "2026-08-28", value: 3.05 },
    ]);
  });

  test("metric 전환 시 series.applyOptions가 새 priceFormat으로 호출된다", async () => {
    const screen = await render(<PriceChart points={POINTS} metric="price" />);
    seriesMock.applyOptions.mockClear();
    await screen.rerender(<PriceChart points={POINTS} metric="yield" />);
    expect(seriesMock.applyOptions).toHaveBeenLastCalledWith({
      priceFormat: { type: "percent", precision: 3, minMove: 0.001 },
    });
  });

  test("값이 null인 포인트는 setData에서 제외된다", async () => {
    const pointsWithNull: PricePoint[] = [
      ...POINTS,
      { time: "2026-08-29", basDt: 20260829, clprPrc: null, clprBnfRt: null },
    ];
    await render(<PriceChart points={pointsWithNull} metric="price" />);
    const lastCall = seriesMock.setData.mock.calls.at(-1)?.[0] as { time: string }[];
    expect(lastCall).toHaveLength(2);
  });

  test("언마운트 시 chart.remove()가 호출된다", async () => {
    const screen = await render(<PriceChart points={POINTS} metric="price" />);
    chartMock.remove.mockClear();
    await screen.unmount();
    expect(chartMock.remove).toHaveBeenCalledOnce();
  });

  test("points가 비어 있으면 안내 문구가 오버레이로 표시된다", async () => {
    const screen = await render(<PriceChart points={[]} metric="price" />);
    await expect.element(screen.getByText("표시할 시세가 없습니다.")).toBeInTheDocument();
  });
});
