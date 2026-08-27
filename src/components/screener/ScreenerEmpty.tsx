import { EmptyIcon } from "@phosphor-icons/react";

export function ScreenerEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <EmptyIcon className="text-muted-foreground size-10" weight="thin" />
      <p className="text-muted-foreground text-sm">조건에 맞는 채권이 없습니다.</p>
    </div>
  );
}
