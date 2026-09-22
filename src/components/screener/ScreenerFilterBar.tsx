import { useCallback, useMemo, useState } from "react";
import { CaretDownIcon, FunnelIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  CHIP_FILTER_DEFS,
  DEFAULT_VISIBLE_FILTER_IDS,
  SEARCH_FILTER_DEF,
  clearFilter,
  resolveVisibleFilterIds,
  type ScreenerFilterId,
} from "@/lib/screener/filter-defs";
import {
  countActiveFilters,
  type ScreenerFilterOption,
  type ScreenerFilterOptions,
  type ScreenerFilters,
} from "@/lib/screener/filters";
import { cn } from "cn";
import type { FilterPreset } from "@/lib/screener/presets";
import type { ScreenerStatus } from "@/lib/screener/types";
import { ScreenerFilterChip } from "./ScreenerFilterChip";
import { ScreenerFilterPicker } from "./ScreenerFilterPicker";
import { ScreenerPresetMenu } from "./ScreenerPresetMenu";

const NO_OPTIONS: ScreenerFilterOption[] = [];

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

  // 어떤 칩을 띄울지는 이 컴포넌트의 로컬 상태다 — URL에도 sessionStorage에도 저장하지
  // 않는다. 저장 대신 아래 합집합 규칙으로 "값이 있는 필터는 무조건 보인다"를 보장한다.
  const [visibleIds, setVisibleIds] = useState<readonly ScreenerFilterId[]>(DEFAULT_VISIBLE_FILTER_IDS);

  // 반드시 즉시값 filters로 계산한다(deferred 값으로 계산하면 값보다 한 틱 늦게 칩이 뜬다).
  const resolvedIds = useMemo(() => resolveVisibleFilterIds(visibleIds, filters), [visibleIds, filters]);
  // CHIP_FILTER_DEFS를 거르는 형태라 렌더 순서는 언제나 레지스트리 선언 순서다 —
  // 켠 순서에 따라 칩이 뒤섞이지 않는다.
  const visibleDefs = useMemo(() => CHIP_FILTER_DEFS.filter((def) => resolvedIds.includes(def.id)), [resolvedIds]);

  const toggleFilterVisibility = useCallback(
    (id: ScreenerFilterId, visible: boolean) => {
      setVisibleIds((prev) => (visible ? [...prev, id] : prev.filter((x) => x !== id)));
      if (visible) return;
      // 감출 때는 값도 같이 비운다 — 남겨 두면 합집합 규칙이 칩을 즉시 되살릴 뿐 아니라,
      // 보이지 않는 필터가 결과를 거르는 상태가 된다.
      const def = CHIP_FILTER_DEFS.find((d) => d.id === id);
      if (def !== undefined) onFiltersChange((prev) => clearFilter(def, prev));
    },
    [onFiltersChange],
  );

  const resetFilterVisibility = useCallback(() => {
    setVisibleIds(DEFAULT_VISIBLE_FILTER_IDS);
  }, []);

  // 검색창은 어느 폭에서도 남는 공간을 쓴다(ui-audit ⑩) — 구 w-56(224px)은 pl-9를 빼면 텍스트
  // 영역이 188px뿐이라 placeholder가 잘렸다. 데스크톱에는 하한(14rem)과 상한(24rem)만 둔다:
  // 상한이 없으면 자라난 검색창이 그 flex 줄의 남는 공간을 다 먹어 같은 줄의 건수 배지가
  // ml-auto로 우측 정렬되지 못한다(auto margin은 grow가 끝난 뒤 남은 공간만 쓴다).
  const searchInput = (
    <div className="relative min-w-0 flex-1 md:max-w-sm md:min-w-56">
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        // type="search"는 모바일 키보드의 검색 키(enterKeyHint와 함께)와 네이티브 지우기(×)
        // 버튼을 동시에 준다(ui-audit ㉔). 부수 효과로 role이 textbox → searchbox로 바뀌므로
        // 이 입력을 getByRole("textbox")로 찾지 말 것 — 테스트·E2E는 전부 placeholder로 찾는다.
        type="search"
        name="q"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={filters.q}
        onChange={(e) => {
          const { value } = e.target;
          onFiltersChange((prev) => ({ ...prev, q: value }));
        }}
        placeholder={SEARCH_FILTER_DEF.placeholder}
        className="w-full pl-9"
      />
    </div>
  );

  const filterControls = (
    <>
      {visibleDefs.map((def) => (
        // key는 반드시 def.id — index를 쓰면 칩 제거 시 엉뚱한 칩이 언마운트된다.
        <ScreenerFilterChip
          key={def.id}
          def={def}
          filters={filters}
          options={options[def.id] ?? NO_OPTIONS}
          onFiltersChange={onFiltersChange}
          onRemove={() => toggleFilterVisibility(def.id, false)}
        />
      ))}

      <ScreenerFilterPicker
        visibleIds={resolvedIds}
        onToggle={toggleFilterVisibility}
        onResetVisibility={resetFilterVisibility}
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
            <FunnelIcon aria-hidden="true" />
            필터{activeCount > 0 ? ` ${activeCount}` : ""}
            <CaretDownIcon aria-hidden="true" className="transition-transform group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          {countBadge}
        </div>
        <CollapsibleContent className="flex max-h-[60vh] flex-wrap items-center gap-2 overflow-y-auto pb-2">
          {filterControls}
        </CollapsibleContent>
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
