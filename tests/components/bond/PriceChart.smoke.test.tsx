/**
 * `PriceChart.test.tsx`는 lightweight-charts를 모킹해 상호작용을 검증한다 — 이 파일은
 * 모킹 없이 실제 라이브러리로 렌더해, `readCssColor`의 oklch→rgba 변환을 포함한 전체
 * 경로가 실제 브라우저에서 크래시 없이 동작하고 canvas가 실제로 마운트되는지만 확인한다
 * (jsdom에서는 canvas 2D context가 없어 애초에 불가능했던 커버리지).
 */
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PriceChart } from "@/components/bond/PriceChart";
import type { PricePoint } from "@/lib/bond/price-series";

const POINTS: PricePoint[] = [
  { time: "2026-08-27", basDt: 20260827, clprPrc: 10000, clprBnfRt: 3.1 },
  { time: "2026-08-28", basDt: 20260828, clprPrc: 10050, clprBnfRt: 3.05 },
];

describe("PriceChart (실제 렌더 스모크)", () => {
  test("실제 데이터로 마운트하면 canvas가 생긴다", async () => {
    const screen = await render(<PriceChart points={POINTS} metric="price" />);
    await expect.poll(() => screen.container.querySelectorAll("canvas").length).toBeGreaterThan(0);
  });

  test("빈 데이터로 마운트해도 크래시하지 않는다", async () => {
    const screen = await render(<PriceChart points={[]} metric="price" />);
    await expect.element(screen.getByText("표시할 시세가 없습니다.")).toBeInTheDocument();
  });

  // readCssColor가 다크 팔레트의 oklch 값도 rgba로 바꿔 lightweight-charts에 넘길 수 있는지 —
  // 모킹된 테스트로는 라이브러리의 실제 ColorParser를 통과하는지 알 수 없다.
  test("라이트 → 다크 전환 시 색을 다시 적용해도 크래시하지 않는다", async () => {
    const screen = await render(<PriceChart points={POINTS} metric="price" />);
    await expect.poll(() => screen.container.querySelectorAll("canvas").length).toBeGreaterThan(0);

    // setup-browser.ts의 afterEach가 이 클래스를 되돌린다.
    document.documentElement.classList.add("dark");
    await expect.poll(() => screen.container.querySelectorAll("canvas").length).toBeGreaterThan(0);
  });

  test("metric 전환·언마운트를 거쳐도 크래시하지 않는다", async () => {
    const screen = await render(<PriceChart points={POINTS} metric="price" />);
    await screen.rerender(<PriceChart points={POINTS} metric="yield" />);
    await expect.poll(() => screen.container.querySelectorAll("canvas").length).toBeGreaterThan(0);

    await screen.unmount();
    expect(screen.container.querySelectorAll("canvas")).toHaveLength(0);
  });
});
