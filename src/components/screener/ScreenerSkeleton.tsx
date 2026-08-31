import { Skeleton } from "@/components/ui/skeleton";
import { screenerColumns } from "./columns";

const SKELETON_COLUMN_COUNT = screenerColumns.length;
const SKELETON_ROW_COUNT = 10;

/** 로딩 중 표시하는 스켈레톤. 실제 <Table>과 같은 컬럼 수로 폭 감을 맞춘다. */
export function ScreenerSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIdx) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- 정적 스켈레톤, 순서 변경 없음
        <div key={rowIdx} className="flex gap-4">
          {Array.from({ length: SKELETON_COLUMN_COUNT }).map((_, colIdx) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- 정적 스켈레톤, 순서 변경 없음
            <Skeleton key={colIdx} className="h-4 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
