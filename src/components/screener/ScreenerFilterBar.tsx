import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countActiveFilters, type ScreenerFilterOptions, type ScreenerFilters } from "@/lib/screener/filters";
import { ScreenerFilterMultiSelect } from "./ScreenerFilterMultiSelect";
import { ScreenerFilterRange } from "./ScreenerFilterRange";

/** `bondBal`은 원 단위로 저장돼 있다 — 필터 입력은 억 단위가 자연스러워 여기서만 환산한다. */
const WON_PER_EOK = 1e8;

interface ScreenerFilterBarProps {
  filters: ScreenerFilters;
  options: ScreenerFilterOptions;
  onFiltersChange: (updater: ScreenerFilters | ((prev: ScreenerFilters) => ScreenerFilters)) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
}

export function ScreenerFilterBar({
  filters,
  options,
  onFiltersChange,
  onReset,
  resultCount,
  totalCount,
}: ScreenerFilterBarProps) {
  const activeCount = countActiveFilters(filters);

  function patch(partial: Partial<ScreenerFilters>) {
    onFiltersChange((prev) => ({ ...prev, ...partial }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <MagnifyingGlassIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={filters.q}
          onChange={(e) => patch({ q: e.target.value })}
          placeholder="종목명·발행인·ISIN 검색"
          className="w-56 pl-9"
        />
      </div>

      <ScreenerFilterMultiSelect
        label="신용등급"
        options={options.grades}
        selected={filters.grades}
        onChange={(grades) => patch({ grades })}
      />
      <ScreenerFilterMultiSelect
        label="이자유형"
        options={options.intTcds}
        selected={filters.intTcds}
        onChange={(intTcds) => patch({ intTcds })}
      />
      <ScreenerFilterMultiSelect
        label="시장구분"
        options={options.markets}
        selected={filters.markets}
        onChange={(markets) => patch({ markets })}
      />
      <ScreenerFilterMultiSelect
        label="종류"
        options={options.kinds}
        selected={filters.kinds}
        onChange={(kinds) => patch({ kinds })}
      />

      <ScreenerFilterRange
        label="만기일"
        inputType="date"
        min={filters.exprDtFrom}
        max={filters.exprDtTo}
        onChange={(exprDtFrom, exprDtTo) => patch({ exprDtFrom, exprDtTo })}
      />
      <ScreenerFilterRange
        label="표면이율(%)"
        step={0.001}
        min={filters.srfcInrtMin}
        max={filters.srfcInrtMax}
        onChange={(srfcInrtMin, srfcInrtMax) => patch({ srfcInrtMin, srfcInrtMax })}
      />
      <ScreenerFilterRange
        label="잔액(억)"
        min={filters.bondBalMin === null ? null : filters.bondBalMin / WON_PER_EOK}
        max={filters.bondBalMax === null ? null : filters.bondBalMax / WON_PER_EOK}
        onChange={(min, max) =>
          patch({
            bondBalMin: min === null ? null : min * WON_PER_EOK,
            bondBalMax: max === null ? null : max * WON_PER_EOK,
          })
        }
      />
      <ScreenerFilterRange
        label="수익률(%)"
        step={0.001}
        min={filters.clprBnfRtMin}
        max={filters.clprBnfRtMax}
        onChange={(clprBnfRtMin, clprBnfRtMax) => patch({ clprBnfRtMin, clprBnfRtMax })}
      />

      <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={onReset}>
        초기화
      </Button>

      <Badge variant="outline" className="text-muted-foreground ml-auto">
        {resultCount === totalCount
          ? `${resultCount.toLocaleString("ko-KR")}건`
          : `${resultCount.toLocaleString("ko-KR")}건 / 전체 ${totalCount.toLocaleString("ko-KR")}건`}
      </Badge>
    </div>
  );
}
