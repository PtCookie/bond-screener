import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * 비활성 껍데기. 레이아웃만 미리 잡아두고 실제 필터링 로직은 붙이지 않는다 —
 * 클릭해도 상태가 바뀌지 않도록 전부 disabled로 렌더한다.
 */
export function ScreenerFilterBar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled className="text-muted-foreground gap-2 font-normal">
        <MagnifyingGlassIcon data-icon="inline-start" />
        발행인 검색
      </Button>
      <Button variant="outline" size="sm" disabled className="justify-between gap-2 font-normal">
        <span className="text-muted-foreground">신용등급 전체</span>
        <CaretDownIcon data-icon="inline-end" />
      </Button>
      <Button variant="outline" size="sm" disabled className="justify-between gap-2 font-normal">
        <span className="text-muted-foreground">이자유형 전체</span>
        <CaretDownIcon data-icon="inline-end" />
      </Button>
      <Button variant="outline" size="sm" disabled className="justify-between gap-2 font-normal">
        <span className="text-muted-foreground">시장구분 전체</span>
        <CaretDownIcon data-icon="inline-end" />
      </Button>
      <Button variant="ghost" size="sm" disabled>
        초기화
      </Button>
      <Badge variant="outline" className="text-muted-foreground ml-auto">
        필터는 아직 동작하지 않음
      </Badge>
    </div>
  );
}
