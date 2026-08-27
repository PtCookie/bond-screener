import { Badge } from "@/components/ui/badge";
import { fmtYmd } from "@/lib/screener/format";

interface ScreenerHeaderProps {
  basDt: number;
  totalCount: number;
}

export function ScreenerHeader({ basDt, totalCount }: ScreenerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">채권 스크리너</h1>
        <Badge variant="outline">기준일자 {fmtYmd(basDt)}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">총 {totalCount.toLocaleString("ko-KR")}건</p>
    </div>
  );
}
