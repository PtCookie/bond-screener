import { PlusIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import { CHIP_FILTER_DEFS, type ScreenerFilterId } from "@/lib/screener/filter-defs";

interface ScreenerFilterPickerProps {
  visibleIds: readonly ScreenerFilterId[];
  onToggle: (id: ScreenerFilterId, visible: boolean) => void;
  onResetVisibility: () => void;
}

/**
 * 어떤 필터 칩을 띄울지 고르는 "+" 팝오버. TradingView 스크리너의 필터 추가 메뉴와 같은
 * 역할이되, 이 프로젝트는 항목이 12개뿐이라 그룹핑·검색 없이 평평한 목록으로 둔다.
 *
 * `DropdownMenuCheckboxItem`이 아니라 Popover + Checkbox인 이유: base-ui 메뉴 아이템은
 * 선택 즉시 메뉴를 닫아 여러 개를 연달아 토글할 수 없다.
 *
 * 체크 해제는 칩을 감추는 데서 끝나지 않고 그 필터의 **값도 함께 비운다**(호출부 담당) —
 * 값을 남기면 합집합 규칙(`resolveVisibleFilterIds`)이 칩을 즉시 되살린다.
 */
export function ScreenerFilterPicker({ visibleIds, onToggle, onResetVisibility }: ScreenerFilterPickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="필터 추가"
        className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "shrink-0")}
      >
        <PlusIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-2">
        <PopoverHeader className="flex-row items-center justify-between gap-2">
          <PopoverTitle className="text-sm">필터</PopoverTitle>
          <Button variant="ghost" size="xs" onClick={onResetVisibility}>
            기본값
          </Button>
        </PopoverHeader>

        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {CHIP_FILTER_DEFS.map((def) => (
            <Label
              key={def.id}
              className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 font-normal"
            >
              <Checkbox
                checked={visibleIds.includes(def.id)}
                onCheckedChange={(checked) => onToggle(def.id, checked)}
              />
              {def.label}
            </Label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
