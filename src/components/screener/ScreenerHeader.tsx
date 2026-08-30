import { Badge } from "@/components/ui/badge";
import { fmtYmd } from "@/lib/screener/format";

interface ScreenerHeaderProps {
  /** 로딩 중이거나 실패해 아직 알 수 없으면 null. */
  basDt: number | null;
  /** 필터 적용 후 결과 건수. */
  filteredCount: number;
  /** 필터 이전 전체 건수. */
  totalCount: number;
}

export function ScreenerHeader({ basDt, filteredCount, totalCount }: ScreenerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">채권 스크리너</h1>
        <Badge variant="outline">기준일자 {fmtYmd(basDt)}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {filteredCount === totalCount
          ? `총 ${totalCount.toLocaleString("ko-KR")}건`
          : `${filteredCount.toLocaleString("ko-KR")}건 / 전체 ${totalCount.toLocaleString("ko-KR")}건`}
      </p>
    </div>
  );
}
