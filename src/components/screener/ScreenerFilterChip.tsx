import { setMultiValue, setRangeValue, type ScreenerFilterDef } from "@/lib/screener/filter-defs";
import type { ScreenerFilterOption, ScreenerFilters } from "@/lib/screener/filters";
import { ScreenerFilterMultiSelect } from "./ScreenerFilterMultiSelect";
import { ScreenerFilterRange } from "./ScreenerFilterRange";

interface ScreenerFilterChipProps {
  def: ScreenerFilterDef;
  filters: ScreenerFilters;
  options: ScreenerFilterOption[];
  onFiltersChange: (updater: (prev: ScreenerFilters) => ScreenerFilters) => void;
  onRemove: () => void;
}

/**
 * def 하나를 알맞은 칩 컴포넌트로 그린다 — 레지스트리(`filter-defs.ts`)와 기존 칩
 * 컴포넌트 사이의 얇은 디스패처.
 *
 * `ScreenerFilterMultiSelect`/`ScreenerFilterRange`의 prop 계약은 건드리지 않는다.
 * 이 파일은 def가 가리키는 키를 읽고 쓰는 역할만 맡는다.
 *
 * 검색(`placement: "search"`)은 칩이 아니라 필터 바의 검색창으로 그려지므로 여기 오지 않는다.
 */
export function ScreenerFilterChip({ def, filters, options, onFiltersChange, onRemove }: ScreenerFilterChipProps) {
  if (def.kind === "multi") {
    return (
      <ScreenerFilterMultiSelect
        label={def.label}
        options={options}
        selected={filters[def.valueKey]}
        onChange={(next) => onFiltersChange((prev) => setMultiValue(def, prev, next))}
        priceDerived={def.priceDerived}
        onRemove={onRemove}
      />
    );
  }

  if (def.kind === "range") {
    return (
      <ScreenerFilterRange
        label={def.label}
        inputType={def.inputType}
        step={def.step}
        min={filters[def.minKey]}
        max={filters[def.maxKey]}
        onChange={(min, max) => onFiltersChange((prev) => setRangeValue(def, prev, min, max))}
        priceDerived={def.priceDerived}
        onRemove={onRemove}
      />
    );
  }

  return null;
}
