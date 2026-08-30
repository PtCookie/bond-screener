import { useMemo, useState } from "react";
import type { BondMarketCategory } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBondPrices } from "@/hooks/useBondPrices";
import { decodePriceSeries, presetToRange, RANGE_PRESETS, type RangePreset } from "@/lib/bond/price-series";
import { PriceChart, type PriceChartMetric } from "./PriceChart";

/** `src/lib/api/params.ts`의 `todayYmd`(비공개)와 동일한 계산 — 이 파일은 클라이언트 전용이라 별도로 둔다. */
function todayYmd(): number {
  const now = new Date();
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

interface PriceChartCardProps {
  isinCd: string;
  /** SSR로 받은 `latestPrices`에 실제로 존재하는 시장만 — 없는 시장을 선택지로 보여줄 이유가 없다. */
  markets: BondMarketCategory[];
}

const DEFAULT_MARKET: BondMarketCategory = "일반채권";

export function PriceChartCard({ isinCd, markets }: PriceChartCardProps) {
  const [market, setMarket] = useState<BondMarketCategory>(markets[0] ?? DEFAULT_MARKET);
  const [preset, setPreset] = useState<RangePreset>("1Y");
  const [metric, setMetric] = useState<PriceChartMetric>("price");

  // preset이 바뀔 때만 새로 계산 — todayYmd()를 렌더마다 부르면 range 객체 identity가
  // 매번 바뀌어 useBondPrices의 queryKey가 불필요하게 갱신된다.
  const range = useMemo(() => presetToRange(preset, todayYmd()), [preset]);

  // `market`은 항상 명시해 요청한다 — 생략하면 여러 시장이 섞여 와 시리즈 time 유일성이 깨진다
  // (`src/lib/bond/client.ts`의 `fetchBondPrices` 주석 참고).
  const { data, isPending, isError, error } = useBondPrices(isinCd, market, range.from, range.to);
  const points = useMemo(() => (data ? (decodePriceSeries(data).get(market) ?? []) : []), [data, market]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>가격 추이</CardTitle>
      </CardHeader>
      <CardContent>
        {/* CardAction(shadcn Card의 grid-cols-[1fr_auto] 헤더 레이아웃)에 넣으면 좁은
            화면에서 1fr 컬럼이 두 토글그룹에 밀려 제목이 글자 단위로 줄바꿈되는 문제가
            있어(실측: 375px 폭에서 재현) 헤더 밖 CardContent에 별도 flex-wrap 줄로 둔다. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {markets.length > 1 ? (
            <ToggleGroup
              aria-label="시장"
              variant="outline"
              size="sm"
              value={[market]}
              onValueChange={(v) => {
                const next = v[0] as BondMarketCategory | undefined;
                if (next) setMarket(next);
              }}
            >
              {markets.map((m) => (
                <ToggleGroupItem key={m} value={m}>
                  {m}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <span />
          )}
          <ToggleGroup
            aria-label="지표"
            variant="outline"
            size="sm"
            value={[metric]}
            onValueChange={(v) => {
              const next = v[0] as PriceChartMetric | undefined;
              if (next) setMetric(next);
            }}
          >
            <ToggleGroupItem value="price">종가</ToggleGroupItem>
            <ToggleGroupItem value="yield">수익률</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="mb-3 flex justify-end">
          <ToggleGroup
            aria-label="기간"
            variant="outline"
            size="sm"
            value={[preset]}
            onValueChange={(v) => {
              const next = v[0] as RangePreset | undefined;
              if (next) setPreset(next);
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
          <div className="text-destructive flex h-[360px] items-center justify-center text-sm">
            {error instanceof Error ? error.message : String(error)}
          </div>
        ) : isPending ? (
          <Skeleton className="h-[360px] w-full" />
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
