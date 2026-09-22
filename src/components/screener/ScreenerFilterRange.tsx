import { useState } from "react";
import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "cn";

type RangeInputType = "number" | "date" | "amount";

interface ScreenerFilterRangeProps {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  /**
   * `"date"`면 min/max를 YYYYMMDD 정수로 받고 `<input type="date">`용 문자열로 왕복 변환한다.
   * `"amount"`면 값은 원 단위 그대로 두고 **입력 표기만** 조/억/만/원으로 환산한다.
   */
  inputType?: RangeInputType;
  step?: number;
  /** 시세에서 파생된 필드라 시세 없는 종목이 통째로 빠진다는 안내를 띄운다. */
  priceDerived?: boolean;
  /** 주어지면 팝오버 헤더에 칩 제거 버튼이 생긴다. */
  onRemove?: () => void;
}

/**
 * 금액 입력 단위. 원 단위 raw 값(예: 5000000000)을 그대로 타이핑하게 하면 0을 세야 해서
 * 쓸 수 없다 — 표가 이미 억/조로 축약해 보여주므로 입력도 같은 단위로 받는다.
 */
const AMOUNT_UNITS = [
  { label: "조", multiplier: 1e12 },
  { label: "억", multiplier: 1e8 },
  { label: "만", multiplier: 1e4 },
  { label: "원", multiplier: 1 },
] as const;

type AmountUnit = (typeof AMOUNT_UNITS)[number]["label"];

const DEFAULT_AMOUNT_UNIT: AmountUnit = "억";

function multiplierOf(unit: AmountUnit): number {
  return AMOUNT_UNITS.find((u) => u.label === unit)?.multiplier ?? 1;
}

/**
 * 이미 값이 들어있으면 그 자릿수에 맞는 단위로 연다(복원된 URL을 사람이 읽을 수 있게).
 * **입력 중에는 다시 계산하지 않는다** — 타이핑 도중 단위가 바뀌면 표기가 요동친다.
 */
function initialAmountUnit(min: number | null, max: number | null): AmountUnit {
  const value = Math.abs(min ?? max ?? 0);
  if (value === 0) return DEFAULT_AMOUNT_UNIT;
  if (value >= 1e12) return "조";
  if (value >= 1e8) return "억";
  if (value >= 1e4) return "만";
  return "원";
}

function toInputValue(v: number | null, inputType: RangeInputType, multiplier: number): string {
  if (v === null) return "";
  if (inputType === "amount") return String(v / multiplier);
  if (inputType === "number") return String(v);
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function fromInputValue(raw: string, inputType: RangeInputType, multiplier: number): number | null {
  if (raw === "") return null;
  if (inputType === "amount") {
    const n = Number(raw);
    // 반올림 필수 — 0.07 * 1e8 === 7000000.000000001.
    return Number.isFinite(n) ? Math.round(n * multiplier) : null;
  }
  if (inputType === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw.replaceAll("-", ""));
  return Number.isFinite(n) ? n : null;
}

/** 만기일·표면이율·수익률 등 범위 필터가 공유하는 "min/max 팝오버" 패턴. */
export function ScreenerFilterRange({
  label,
  min,
  max,
  onChange,
  inputType = "number",
  step,
  priceDerived = false,
  onRemove,
}: ScreenerFilterRangeProps) {
  const active = min !== null || max !== null;
  const [unit, setUnit] = useState<AmountUnit>(() => initialAmountUnit(min, max));
  // 팝오버를 제어 상태로 둔다 — 칩 제거는 자기 트리거를 언마운트시키므로, 열린 채로
  // 제거하면 base-ui가 사라진 노드로 포커스를 되돌리려 한다. 먼저 닫고 제거한다.
  const [open, setOpen] = useState(false);

  const isAmount = inputType === "amount";
  const multiplier = isAmount ? multiplierOf(unit) : 1;
  const htmlInputType = isAmount ? "number" : inputType;
  // 단위는 캡션에만 붙인다 — aria-label은 `${label} 최소` 형태를 유지해야 E2E 셀렉터가 산다.
  const unitSuffix = isAmount ? `(${unit})` : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-between gap-2 font-normal")}
      >
        <span className={active ? undefined : "text-muted-foreground"}>{label}</span>
        <CaretDownIcon aria-hidden="true" data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2">
        {/* 다중선택 필터와 같은 "이 필터만 해제" 헤더 — 최소·최대를 각각 지우지 않아도 된다. */}
        <PopoverHeader className="flex-row items-center justify-between gap-2">
          <PopoverTitle className="text-sm">{label}</PopoverTitle>
          <span className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="xs"
              aria-label={`${label} 해제`}
              disabled={!active}
              onClick={() => {
                onChange(null, null);
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

        {isAmount && (
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[unit]}
            // base-ui ToggleGroup은 단일 선택 모드에서도 값이 배열이다.
            onValueChange={(next) => {
              const picked = next[0];
              if (picked !== undefined) setUnit(picked as AmountUnit);
            }}
          >
            {AMOUNT_UNITS.map((u) => (
              <ToggleGroupItem key={u.label} value={u.label} aria-label={`${label} 단위 ${u.label}`}>
                {u.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs">최소{unitSuffix}</span>
            <Input
              type={htmlInputType}
              step={step}
              aria-label={`${label} 최소`}
              value={toInputValue(min, inputType, multiplier)}
              onChange={(e) => onChange(fromInputValue(e.target.value, inputType, multiplier), max)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs">최대{unitSuffix}</span>
            <Input
              type={htmlInputType}
              step={step}
              aria-label={`${label} 최대`}
              value={toInputValue(max, inputType, multiplier)}
              onChange={(e) => onChange(min, fromInputValue(e.target.value, inputType, multiplier))}
            />
          </div>
        </div>

        {priceDerived && <p className="text-muted-foreground text-xs">시세가 없는 종목은 결과에서 제외됩니다.</p>}
      </PopoverContent>
    </Popover>
  );
}
