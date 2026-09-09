import { CaretDownIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ScreenerFilterOption } from "@/lib/screener/filters";

interface ScreenerFilterMultiSelectProps {
  label: string;
  options: ScreenerFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/** 신용등급·이자유형·시장구분·종류가 공유하는 "코드 다중선택 + 데이터 기반 선택지" 패턴. */
export function ScreenerFilterMultiSelect({ label, options, selected, onChange }: ScreenerFilterMultiSelectProps) {
  function toggle(code: string, checked: boolean) {
    onChange(checked ? [...selected, code] : selected.filter((c) => c !== code));
  }

  return (
    <Popover>
      <PopoverTrigger
        disabled={options.length === 0}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-between gap-2 font-normal")}
      >
        <span className={selected.length > 0 ? undefined : "text-muted-foreground"}>
          {label} {selected.length > 0 ? selected.length : "전체"}
        </span>
        <CaretDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-2">
        {/* 이 필터 하나만 비우는 버튼 — 필터 바의 "초기화"는 전체를 되돌려 대안이 못 된다.
            팝오버는 닫지 않는다(해제 직후 다시 고르는 흐름이 자연스럽다). 접근성 이름에
            필터명을 붙여 팝오버가 열린 상태에서도 셀렉터가 모호해지지 않게 한다. */}
        <PopoverHeader className="flex-row items-center justify-between gap-2">
          <PopoverTitle className="text-sm">{label}</PopoverTitle>
          <Button
            variant="ghost"
            size="xs"
            aria-label={`${label} 해제`}
            disabled={selected.length === 0}
            onClick={() => {
              onChange([]);
            }}
          >
            해제
          </Button>
        </PopoverHeader>

        {options.length === 0 ? (
          <p className="text-muted-foreground px-1.5 py-1 text-sm">선택지 없음</p>
        ) : (
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {options.map((opt) => (
              <Label
                key={opt.code}
                className="hover:bg-muted flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1.5 py-1 font-normal"
              >
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={selected.includes(opt.code)}
                    onCheckedChange={(checked) => toggle(opt.code, checked)}
                  />
                  {opt.label}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{opt.count.toLocaleString("ko-KR")}</span>
              </Label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
