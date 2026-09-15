import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtYmd } from "@/lib/screener/format";
import type { ScreenerStatus } from "@/lib/screener/types";

interface ScreenerHeaderProps {
  /** 로딩 중이거나 실패해 아직 알 수 없으면 null. */
  basDt: number | null;
  /** 필터 적용 후 결과 건수. */
  filteredCount: number;
  /** 필터 이전 전체 건수. */
  totalCount: number;
  /**
   * 기본값 `"ready"` — 넘기지 않으면 지금까지와 똑같이 동작한다.
   *
   * `"loading"`이면 데이터에서 온 값(기준일자·건수)을 숫자로 그리지 않는다. 0을 그대로
   * 렌더하면 "아직 안 왔다"와 "진짜 0건이다"가 화면에서 구분되지 않기 때문이다.
   * `"error"`면 스켈레톤조차 그리지 않는다 — 끝나지 않는 로딩으로 읽힌다.
   */
  status?: ScreenerStatus;
}

export function ScreenerHeader({ basDt, filteredCount, totalCount, status = "ready" }: ScreenerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">채권 스크리너</h1>
        {status !== "error" && (
          <Badge variant="outline">
            {/* 라벨("기준일자")은 상수라 로딩 중에도 남긴다 — 무엇을 기다리는 중인지 보인다.
                날짜 자리 바는 Skeleton(<div>)이 아니라 <span>이다: Badge가 <span>을 렌더해
                div를 넣으면 div-in-span이 된다. */}
            기준일자{" "}
            {status === "loading" ? (
              <span className="bg-muted inline-block h-3 w-16 animate-pulse rounded-full" aria-hidden="true" />
            ) : (
              fmtYmd(basDt)
            )}
          </Badge>
        )}
        {/* 건수는 <p> 안에 스켈레톤을 넣지 않고 요소째 바꾼다 — h-5는 text-sm 줄 높이,
            w-24는 "총 29,000건"의 폭이라 로딩 → 완료 시 이동이 없다. */}
      </div>
      {status === "loading" ? (
        <Skeleton className="h-5 w-24" aria-hidden="true" />
      ) : status === "ready" ? (
        <p className="text-muted-foreground text-sm">
          {filteredCount === totalCount
            ? `총 ${totalCount.toLocaleString("ko-KR")}건`
            : `${filteredCount.toLocaleString("ko-KR")}건 / 전체 ${totalCount.toLocaleString("ko-KR")}건`}
        </p>
      ) : null}
    </div>
  );
}
