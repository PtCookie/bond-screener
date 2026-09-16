import { fmtYmd } from "@/lib/screener/format";
import type { ScreenerStatus } from "@/lib/screener/types";
import { ThemeToggle } from "./ThemeToggle";

interface AppHeaderSummary {
  /** 로딩 중이거나 실패해 아직 알 수 없으면 null. */
  basDt: number | null;
  /**
   * `"loading"`이면 데이터에서 온 값(기준일자)을 확정값으로 그리지 않는다. 자리바만 둔다.
   * `"error"`면 스켈레톤조차 그리지 않는다 — 끝나지 않는 로딩으로 읽힌다.
   */
  status: ScreenerStatus;
}

interface AppHeaderProps {
  /**
   * 이 헤더가 화면의 h1을 소유할 때만 넘긴다. 상세 페이지는 종목명이 h1이라
   * (`BondDetailHeader`) 넘기지 않는다 — 한 문서에 h1이 둘이면 문서 개요가 망가지고,
   * `e2e/navigation.spec.ts`의 `getByRole("heading", { level: 1 })`이 strict mode 위반으로
   * 깨진다.
   */
  title?: string;
  /** 스크리너 아일랜드에서만 넘긴다. 이 데이터는 아일랜드 안 QueryClient에서만 얻을 수 있다. */
  summary?: AppHeaderSummary;
}

/**
 * 두 아일랜드(BondScreener·BondDetail)가 공유하는 헤더. 테마 토글의 유일한 배치 지점이다.
 *
 * 건수는 여기에 두지 않는다(ui-audit ⑤) — 건수는 필터의 결과물이라 `ScreenerFilterBar`의
 * 배지가 유일한 소유자이고, 모바일 sticky 한 줄도 그 배지를 전제로 설계돼 있다(⑧).
 * 덕분에 기준일자가 헤더의 유일한 데이터 값이 되어 위계가 생긴다(⑬).
 */
export function AppHeader({ title, summary }: AppHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-lg font-semibold">{title}</h1>}
        {summary && summary.status !== "error" && (
          // 배지가 아니라 라벨+값이다(ui-audit ⑬) — 금융 데이터 도구에서 "이 숫자가 언제
          // 것인가"는 보조 정보 기호(muted outline 배지)로 묻힐 값이 아니다. 라벨은 작게
          // 죽이고 날짜에 대비를 준다.
          //
          // 두 span 사이의 {" "}를 지우지 말 것: flex 컨테이너라 공백 전용 텍스트 노드는
          // 렌더되지 않아(간격은 gap-1.5 담당) 화면에는 영향이 없지만, textContent에는 남아
          // 기존 텍스트 셀렉터("기준일자 2026-08-28", /기준일자 \d{4}-\d{2}-\d{2}/,
          // "기준일자 —")가 그대로 매치한다.
          <p className="flex items-baseline gap-1.5 text-sm">
            {/* 라벨("기준일자")은 상수라 로딩 중에도 남긴다 — 무엇을 기다리는 중인지 보인다. */}
            <span className="text-muted-foreground text-xs">기준일자</span>{" "}
            {summary.status === "loading" ? (
              // <p> 안이라 자리바는 div(= ui/skeleton 컴포넌트)가 아니라 <span>이어야 한다.
              // h-4는 text-sm 줄 높이, w-20은 "2026-08-28"의 폭 — 로딩 → 완료 시 이동이 없다.
              // data-slot은 ui/skeleton과 같은 값을 쓴다 — 테스트가 "자리바가 떠 있다"를
              // 찾는 훅이고, 역할도 그것과 동일하다.
              <span
                data-slot="skeleton"
                className="bg-muted inline-block h-4 w-20 animate-pulse rounded"
                aria-hidden="true"
              />
            ) : (
              <span className="text-foreground font-medium tabular-nums">{fmtYmd(summary.basDt)}</span>
            )}
          </p>
        )}
      </div>
      <ThemeToggle />
    </div>
  );
}
