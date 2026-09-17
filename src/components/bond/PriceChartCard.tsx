import { useMemo } from "react";
import type { BondMarketCategory } from "@/api";
import { ErrorState } from "@/components/common/ErrorState";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBondPrices } from "@/hooks/useBondPrices";
import { toFriendlyErrorMessage } from "@/lib/errorMessage";
import {
  decodePriceSeries,
  presetToRange,
  RANGE_PRESETS,
  type PriceChartMetric,
  type RangePreset,
} from "@/lib/bond/price-series";
import { PriceChart } from "./PriceChart";

/** `src/lib/api/params.ts`의 `todayYmd`(비공개)와 동일한 계산 — 이 파일은 클라이언트 전용이라 별도로 둔다. */
function todayYmd(): number {
  const now = new Date();
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

interface PriceChartCardProps {
  isinCd: string;
  /**
   * 시장·기간·지표 전부 제어 props다(ui-audit ㉖) — 상태 소유자는 `BondDetail`
   * (`useChartViewState`)이고, 이 컴포넌트는 값을 그리고 변경을 콜백으로 올려보내기만 한다.
   * 시장 토글 UI 자체는 `BondDetailHeader`에 있다(ui-audit ⑥) — 헤더의 최신 시세와 이
   * 차트가 같은 시장을 가리켜야 해 상위로 올렸다.
   */
  market: BondMarketCategory;
  preset: RangePreset;
  metric: PriceChartMetric;
  onPresetChange: (preset: RangePreset) => void;
  onMetricChange: (metric: PriceChartMetric) => void;
  /** `false`면 시세를 요청하지 않는다 — URL 복원이 끝나기 전 기본값으로 먼저 쐈다가
   * 복원값으로 다시 쏘는 왕복을 피한다(`BondDetail`이 `useChartViewState`의 `restored`를 넘긴다). */
  enabled: boolean;
}

export function PriceChartCard({
  isinCd,
  market,
  preset,
  metric,
  onPresetChange,
  onMetricChange,
  enabled,
}: PriceChartCardProps) {
  // preset이 바뀔 때만 새로 계산 — todayYmd()를 렌더마다 부르면 range 객체 identity가
  // 매번 바뀌어 useBondPrices의 queryKey가 불필요하게 갱신된다.
  const range = useMemo(() => presetToRange(preset, todayYmd()), [preset]);

  // `market`은 항상 명시해 요청한다 — 생략하면 여러 시장이 섞여 와 시리즈 time 유일성이 깨진다
  // (`src/lib/bond/client.ts`의 `fetchBondPrices` 주석 참고).
  const { data, isPending, isError, error, refetch } = useBondPrices(isinCd, market, range.from, range.to, { enabled });
  const points = useMemo(() => (data ? (decodePriceSeries(data).get(market) ?? []) : []), [data, market]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>가격 추이</CardTitle>
        {/* 지표 토글(버튼 2개)만 제목과 같은 행에 둔다 — 시장 토글까지 함께 넣으려던
            예전 시도는 375px에서 제목이 글자 단위로 줄바꿈됐지만(ui-audit ⑭), 그 토글은
            헤더로 옮겨갔고(BondDetailHeader) 여기 남은 건 버튼 2개뿐이라 재현되지 않는다. */}
        <CardAction>
          <ToggleGroup
            aria-label="지표"
            variant="outline"
            size="sm"
            value={[metric]}
            onValueChange={(v) => {
              const next = v[0] as PriceChartMetric | undefined;
              if (next) onMetricChange(next);
            }}
          >
            <ToggleGroupItem value="price">종가</ToggleGroupItem>
            <ToggleGroupItem value="yield">수익률</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex justify-end">
          <ToggleGroup
            aria-label="기간"
            variant="outline"
            size="sm"
            value={[preset]}
            onValueChange={(v) => {
              const next = v[0] as RangePreset | undefined;
              if (next) onPresetChange(next);
            }}
          >
            {RANGE_PRESETS.map((p) => (
              <ToggleGroupItem key={p} value={p}>
                {p}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {isError ? (
          <ErrorState message={toFriendlyErrorMessage(error)} onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-90 w-full" />
        ) : (
          <PriceChart points={points} metric={metric} />
        )}
        {data?.truncated && (
          <p className="text-muted-foreground mt-2 text-xs">일부 구간의 데이터가 표시 상한을 넘어 잘렸습니다.</p>
        )}
      </CardContent>
    </Card>
  );
}
