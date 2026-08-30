import { CaretDownIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type RangeInputType = "number" | "date";

interface ScreenerFilterRangeProps {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  /** "date"면 min/max를 YYYYMMDD 정수로 받고 `<input type="date">`용 문자열로 왕복 변환한다. */
  inputType?: RangeInputType;
  step?: number;
}

function toInputValue(v: number | null, inputType: RangeInputType): string {
  if (v === null) return "";
  if (inputType === "number") return String(v);
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function fromInputValue(raw: string, inputType: RangeInputType): number | null {
  if (raw === "") return null;
  if (inputType === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw.replaceAll("-", ""));
  return Number.isFinite(n) ? n : null;
}

/** 만기일·표면이율·잔액·수익률이 공유하는 "min/max 팝오버" 패턴. */
export function ScreenerFilterRange({
  label,
  min,
  max,
  onChange,
  inputType = "number",
  step,
}: ScreenerFilterRangeProps) {
  const active = min !== null || max !== null;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-between gap-2 font-normal")}
      >
        <span className={active ? undefined : "text-muted-foreground"}>{label}</span>
        <CaretDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs">최소</span>
            <Input
              type={inputType}
              step={step}
              aria-label={`${label} 최소`}
              value={toInputValue(min, inputType)}
              onChange={(e) => onChange(fromInputValue(e.target.value, inputType), max)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs">최대</span>
            <Input
              type={inputType}
              step={step}
              aria-label={`${label} 최대`}
              value={toInputValue(max, inputType)}
              onChange={(e) => onChange(min, fromInputValue(e.target.value, inputType))}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
