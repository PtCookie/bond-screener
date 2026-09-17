import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

/**
 * 데이터를 못 받아왔을 때의 공용 화면 — 스냅샷 fetch 실패, 가격 시계열 fetch 실패가 모두
 * 이 모양을 쓴다(ui-audit ⑰: 전에는 화면마다 생김새가 다르고 차트 쪽은 되돌릴 방법이
 * 없었다). `message`는 항상 제품의 말이어야 한다 — 호출부가 `toFriendlyErrorMessage`로
 * 원본 에러를 바꿔서 넘긴다.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <WarningCircleIcon aria-hidden="true" className="text-destructive size-10" weight="thin" />
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
