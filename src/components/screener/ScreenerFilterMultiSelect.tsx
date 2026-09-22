import { useState } from "react";
import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import type { ScreenerFilterOption } from "@/lib/screener/filters";

interface ScreenerFilterMultiSelectProps {
  label: string;
  options: ScreenerFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** 시세에서 파생된 필드라 시세 없는 종목이 통째로 빠진다는 안내를 띄운다. */
  priceDerived?: boolean;
  /** 주어지면 팝오버 헤더에 칩 제거 버튼이 생긴다. */
  onRemove?: () => void;
}

/** 신용등급·이자유형·시장구분·종류가 공유하는 "코드 다중선택 + 데이터 기반 선택지" 패턴. */
export function ScreenerFilterMultiSelect({
  label,
  options,
  selected,
  onChange,
  priceDerived = false,
  onRemove,
}: ScreenerFilterMultiSelectProps) {
  // 팝오버를 제어 상태로 둔다 — 칩 제거는 자기 트리거를 언마운트시키므로, 열린 채로
  // 제거하면 base-ui가 사라진 노드로 포커스를 되돌리려 한다. 먼저 닫고 제거한다.
  const [open, setOpen] = useState(false);

  function toggle(code: string, checked: boolean) {
    onChange(checked ? [...selected, code] : selected.filter((c) => c !== code));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={options.length === 0}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-between gap-2 font-normal")}
      >
        <span className={selected.length > 0 ? undefined : "text-muted-foreground"}>
          {label} {selected.length > 0 ? selected.length : "전체"}
        </span>
        <CaretDownIcon aria-hidden="true" data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-2">
        {/* 이 필터 하나만 비우는 버튼 — 필터 바의 "초기화"는 전체를 되돌려 대안이 못 된다.
            팝오버는 닫지 않는다(해제 직후 다시 고르는 흐름이 자연스럽다). 접근성 이름에
            필터명을 붙여 팝오버가 열린 상태에서도 셀렉터가 모호해지지 않게 한다. */}
        <PopoverHeader className="flex-row items-center justify-between gap-2">
          <PopoverTitle className="text-sm">{label}</PopoverTitle>
          <span className="flex items-center gap-0.5">
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
            {onRemove !== undefined && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${label} 필터 제거`}
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                <XIcon aria-hidden="true" />
              </Button>
            )}
          </span>
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

        {priceDerived && <p className="text-muted-foreground text-xs">시세가 없는 종목은 결과에서 제외됩니다.</p>}
      </PopoverContent>
    </Popover>
  );
}
