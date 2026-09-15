import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 스크리너 표의 로딩 스켈레톤 중 **셀 단위 조각**만 담는다. 행·표 모양은
 * `ScreenerTable.tsx`가 직접 그린다 — 스켈레톤 행은 실제 레이아웃(sticky 1열, 우측 정렬,
 * 시세 그룹 구분선, 모바일 2행 구조)과 한 줄씩 대응해야 하는데, 그 상수들을 이 파일로
 * export하면 `ScreenerTable → ScreenerSkeleton` import와 ESM 순환이 생긴다. 실제 행 바로
 * 옆에 두는 인접성 자체가 "스켈레톤이 표와 닮게 유지된다"는 보장이다.
 */

/** 표 컨테이너가 `max-h-[70vh]`로 잘리므로, 클램프에 닿을 만큼만 그리면 높이가 일치한다. */
const SKELETON_MAX_ROWS = 20;

/**
 * 그릴 스켈레톤 **종목** 수. 데스크톱은 종목당 `<tr>` 1개, 모바일은 2개라 모바일 상한이 절반이다
 * (= 어느 쪽이든 `<tr>` 최대 20개).
 *
 * `pageSize`를 따르므로 로딩 → 완료 시 표 높이가 유지된다. 상한이 없으면 `pageSize=100`에서
 * 수백 ms짜리 프레임을 위해 `<td>` 1,100개와 동시 애니메이션 레이어가 생성·파괴된다.
 *
 * ⚠️ **20과 10은 임의의 값이 아니다.** E2E가 `tbody tr`를 그대로 세는 곳이 있어
 * (`e2e/screener.spec.ts`의 `toHaveCount(25)`, `e2e/responsive.spec.ts`의 `toHaveCount(6)`)
 * 스켈레톤 행 수가 그 값과 겹치면 **로딩 중인 화면을 상대로 조용히 통과한다.** 특히 모바일
 * 상한을 3으로 낮추면 3 × 2 = 6행이 되어 정확히 그 함정에 빠진다. 이 값을 바꾸려면 두 스펙의
 * 기대 행 수를 먼저 확인할 것.
 */
export function skeletonRowCount(pageSize: number, isMobile: boolean): number {
  return Math.min(pageSize, isMobile ? SKELETON_MAX_ROWS / 2 : SKELETON_MAX_ROWS);
}

/** 셀 하나를 채우는 바의 폭 후보. 전부 같은 폭이면 표가 아니라 격자처럼 보인다. */
const FILL_WIDTHS = ["w-full", "w-4/5", "w-3/5", "w-2/3"] as const;

interface ScreenerSkeletonBarProps {
  rowIdx: number;
  colIdx: number;
  /** 컬럼 `meta.align`. "end"면 숫자 컬럼이라 바도 우측에 붙인다. */
  align?: "start" | "end";
  className?: string;
}

/**
 * 셀 하나짜리 스켈레톤 바.
 *
 * 폭은 행·열 인덱스로 **결정론적으로** 고른다 — `Math.random()`을 쓰면 리렌더마다 폭이
 * 흔들리고, 3개 브라우저(chromium/firefox/webkit)에서 도는 컴포넌트 테스트가 불안정해진다.
 */
export function ScreenerSkeletonBar({ rowIdx, colIdx, align, className }: ScreenerSkeletonBarProps) {
  const width = FILL_WIDTHS[(rowIdx * 7 + colIdx) % FILL_WIDTHS.length];
  return <Skeleton className={cn("h-4 rounded-md", width, align === "end" && "ml-auto", className)} />;
}
