/**
 * TradingView lightweight-charts(v5) 가격/수익률 라인 차트.
 *
 * 라이선스(Apache-2.0)가 요구하는 attribution은 `layout.attributionLogo`(v5 기본값 `true`)를
 * 건드리지 않는 것으로 충족한다 — 차트 우하단에 TradingView 로고+링크가 항상 표시된다.
 * 두 번째 요건(NOTICE 고지 문구)은 `src/layouts/Layout.astro`의 푸터에서 처리한다.
 */
import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";
import type { PricePoint } from "@/lib/bond/price-series";

export type PriceChartMetric = "price" | "yield";

interface PriceChartProps {
  points: PricePoint[];
  metric: PriceChartMetric;
}

/**
 * CSS 변수 값(`global.css`는 전부 `oklch(...)`)을 lightweight-charts가 이해하는
 * `rgba(...)` 문자열로 바꾼다.
 *
 * 두 단계 다 함정이 있어 캔버스까지 거친다:
 * 1. `getPropertyValue`로 커스텀 프로퍼티의 원문 텍스트를 그대로 넘기면 라이브러리의
 *    `ColorParser`가 `oklch()`를 파싱하지 못하고 던진다(실측: "Failed to parse color:
 *    oklch(...)") — 커스텀 프로퍼티는 브라우저가 계산값으로 바꿔주지 않기 때문이다.
 * 2. 그래서 실제 `color` 속성에 대입한 뒤 `getComputedStyle`로 읽어보면 해결될 것
 *    같지만, 최신 Chromium은 원본이 `oklch()`로 지정된 색을 계산값에서도 `oklch()`
 *    그대로 직렬화해 돌려준다(브라우저 버전에 따라 rgb로 다운그레이드하지 않음 —
 *    실측으로 확인, MDN 문서의 예전 서술과 다름). 결국 같은 에러가 재현된다.
 *
 * `<canvas>` 2D context는 어떤 표기든 실제 픽셀(0~255 RGBA)로 변환해 반환하므로
 * getComputedStyle의 직렬화 방식과 무관하게 항상 rgba() 문자열을 얻을 수 있다.
 */
function readCssColor(varName: string): string {
  const probe = document.createElement("div");
  probe.style.color = `var(${varName})`;
  document.body.appendChild(probe);
  const specified = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return specified;
  ctx.fillStyle = specified;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

export function PriceChart({ points, metric }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // 차트 생성은 마운트 시 1회, cleanup에서 chart.remove(). 컨테이너는 데이터 유무와
  // 무관하게 항상 렌더되어야 한다 — 조건부로 언마운트하면 이 effect가 다시 돌지 않아
  // 차트가 재생성되지 않는다(아래 return의 "표시할 시세가 없습니다"는 오버레이로만 처리).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: readCssColor("--muted-foreground"),
      },
      grid: {
        vertLines: { color: readCssColor("--border") },
        horzLines: { color: readCssColor("--border") },
      },
      rightPriceScale: { borderColor: readCssColor("--border") },
      timeScale: { borderColor: readCssColor("--border") },
    });
    const series = chart.addSeries(LineSeries, {
      color: readCssColor("--primary"),
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 지표 토글 시 priceFormat도 함께 바꾼다 — 가격(~10,000)과 수익률(~3%)은 스케일이
  // 완전히 달라 축이 리셋되는 것이 오히려 올바른 동작이다.
  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat:
        metric === "yield"
          ? { type: "percent", precision: 3, minMove: 0.001 }
          : { type: "price", precision: 2, minMove: 0.01 },
    });
  }, [metric]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data: LineData<Time>[] = points
      .map((p) => ({ time: p.time as Time, value: metric === "yield" ? p.clprBnfRt : p.clprPrc }))
      .filter((d): d is { time: Time; value: number } => d.value !== null);
    series.setData(data);
    chart.timeScale().fitContent();
  }, [points, metric]);

  return (
    <div className="relative h-[360px] w-full">
      <div ref={containerRef} className="h-full w-full" />
      {points.length === 0 && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          표시할 시세가 없습니다.
        </div>
      )}
    </div>
  );
}
