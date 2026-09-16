import { CaretDownIcon, FunnelIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useIsMobile";
import { countActiveFilters, type ScreenerFilterOptions, type ScreenerFilters } from "@/lib/screener/filters";
import { cn } from "cn";
import type { FilterPreset } from "@/lib/screener/presets";
import type { ScreenerStatus } from "@/lib/screener/types";
import { ScreenerFilterMultiSelect } from "./ScreenerFilterMultiSelect";
import { ScreenerFilterRange } from "./ScreenerFilterRange";
import { ScreenerPresetMenu } from "./ScreenerPresetMenu";

interface ScreenerFilterBarProps {
  filters: ScreenerFilters;
  options: ScreenerFilterOptions;
  onFiltersChange: (updater: ScreenerFilters | ((prev: ScreenerFilters) => ScreenerFilters)) => void;
  onReset: () => void;
  /** 필터 바는 정렬 상태를 모른다 — 프리셋 관련 값은 받아서 그대로 넘기기만 한다. */
  presets: FilterPreset[];
  presetQuery: string;
  onSavePreset: (name: string, query: string) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (query: string) => void;
  resultCount: number;
  totalCount: number;
  /**
   * 기본값 `"ready"` — 넘기지 않으면 지금까지와 똑같이 동작한다. 로딩 중에는 결과 건수를
   * 숫자로 그리지 않는다(0이 "진짜 0건"과 구분되지 않는다). `ScreenerHeader`와 같은 규약.
   */
  status?: ScreenerStatus;
}

export function ScreenerFilterBar({
  filters,
  options,
  onFiltersChange,
  onReset,
  presets,
  presetQuery,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
  resultCount,
  totalCount,
  status = "ready",
}: ScreenerFilterBarProps) {
  const isMobile = useIsMobile();
  const activeCount = countActiveFilters(filters);

  function patch(partial: Partial<ScreenerFilters>) {
    onFiltersChange((prev) => ({ ...prev, ...partial }));
  }

  // 검색창은 어느 폭에서도 남는 공간을 쓴다(ui-audit ⑩) — 구 w-56(224px)은 pl-9를 빼면 텍스트
  // 영역이 188px뿐이라 placeholder가 잘렸다. 데스크톱에는 하한(14rem)과 상한(24rem)만 둔다:
  // 상한이 없으면 자라난 검색창이 그 flex 줄의 남는 공간을 다 먹어 같은 줄의 건수 배지가
  // ml-auto로 우측 정렬되지 못한다(auto margin은 grow가 끝난 뒤 남은 공간만 쓴다).
  const searchInput = (
    <div className="relative min-w-0 flex-1 md:max-w-sm md:min-w-56">
      <MagnifyingGlassIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        value={filters.q}
        onChange={(e) => patch({ q: e.target.value })}
        placeholder="종목명·발행인·ISIN 검색"
        className="w-full pl-9"
      />
    </div>
  );

  const filterControls = (
    <>
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
        label="수익률(%)"
        step={0.001}
        min={filters.clprBnfRtMin}
        max={filters.clprBnfRtMax}
        onChange={(clprBnfRtMin, clprBnfRtMax) => patch({ clprBnfRtMin, clprBnfRtMax })}
      />

      <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={onReset}>
        초기화
      </Button>

      <ScreenerPresetMenu
        presets={presets}
        currentQuery={presetQuery}
        onSave={onSavePreset}
        onDelete={onDeletePreset}
        onApply={onApplyPreset}
      />
    </>
  );

  // h-5·rounded-3xl은 badgeVariants의 실제 값이고, ml-auto는 대체 요소에도 반드시
  // 남아야 우측 정렬이 무너지지 않는다.
  const countBadge =
    status === "loading" ? (
      <Skeleton className="ml-auto h-5 w-14 shrink-0 rounded-3xl" aria-hidden="true" />
    ) : status === "ready" ? (
      <Badge variant="outline" className="text-muted-foreground ml-auto shrink-0">
        {resultCount === totalCount
          ? `${resultCount.toLocaleString("ko-KR")}건`
          : `${resultCount.toLocaleString("ko-KR")}건 / 전체 ${totalCount.toLocaleString("ko-KR")}건`}
      </Badge>
    ) : null;

  if (isMobile) {
    // 375px에서 칩 전부를 펼쳐두면 4줄(~340px)이 화면 전체에 sticky로 눌러앉는다(ui-audit ⑧) —
    // 검색창·토글·건수만 담은 한 줄만 sticky로 고정하고, 나머지 필터는 접어 일반 흐름에 둔다
    // (펼치면 표를 밀어낼 뿐 화면을 영구 점유하지 않는다).
    return (
      <Collapsible>
        <div className="bg-background sticky top-0 z-30 flex items-center gap-2 py-2">
          {searchInput}
          <CollapsibleTrigger
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "group shrink-0 gap-1.5 font-normal")}
          >
            <FunnelIcon />
            필터{activeCount > 0 ? ` ${activeCount}` : ""}
            <CaretDownIcon className="transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          {countBadge}
        </div>
        <CollapsibleContent className="flex flex-wrap items-center gap-2 pb-2">{filterControls}</CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div className="bg-background sticky top-0 z-30 flex flex-wrap items-center gap-2 py-2">
      {searchInput}
      {filterControls}
      {countBadge}
    </div>
  );
}
