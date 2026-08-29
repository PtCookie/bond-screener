import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ScreenerErrorProps {
  message: string;
  onRetry: () => void;
}

/** 스냅샷 fetch 실패(네트워크 오류, `pnpm snapshot` 미실행 등) 시 표시. */
export function ScreenerError({ message, onRetry }: ScreenerErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <WarningCircleIcon className="text-destructive size-10" weight="thin" />
      <div className="space-y-1">
        <p className="text-sm font-medium">데이터를 불러오지 못했습니다.</p>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}
