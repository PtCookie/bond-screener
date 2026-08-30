import { CaretDownIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
      <PopoverContent align="start" className="w-56">
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
