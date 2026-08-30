import { EmptyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ScreenerEmptyProps {
  /** 필터가 걸린 상태로 0건이 된 경우에만 넘긴다 — 막다른 골목을 피하는 "필터 초기화" 버튼용. */
  onResetFilters?: () => void;
}

export function ScreenerEmpty({ onResetFilters }: ScreenerEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <EmptyIcon className="text-muted-foreground size-10" weight="thin" />
      <p className="text-muted-foreground text-sm">조건에 맞는 채권이 없습니다.</p>
      {onResetFilters && (
        <Button variant="outline" size="sm" onClick={onResetFilters}>
          필터 초기화
        </Button>
      )}
    </div>
  );
}
