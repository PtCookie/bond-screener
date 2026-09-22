import { fmtYmd } from "@/lib/screener/format";
import type { ScreenerStatus } from "@/lib/screener/types";
import { ThemeToggle } from "./ThemeToggle";

interface AppHeaderSummary {
  /** 기본정보(bond 정적 필드) 기준일. 로딩 중이거나 실패해 아직 알 수 없으면 null. */
  basDt: number | null;
  /** 시세 기준일. 스냅샷에 시세가 한 건도 없으면 로딩과 무관하게 null이다. */
  priceBasDt: number | null;
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
 * 기준일자 한 칸의 값. 로딩 중에는 0이나 대시를 확정값처럼 그리지 않고 자리바만 둔다 —
 * "아직 안 왔다"와 "진짜 그 값이다"가 구분되지 않기 때문이다.
 *
 * h-4는 text-sm 줄 높이, w-20은 "2026-08-28"의 폭이라 로딩 → 완료 시 가로 이동이 없다.
 * `data-slot`은 ui/skeleton과 같은 값을 쓴다 — 역할이 같고, 테스트가 "자리바가 떠 있다"를
 * 찾는 훅이다. `<p>` 안이라 div(= ui/skeleton 컴포넌트)가 아니라 `<span>`이어야 한다.
 */
function BasDtValue({ value, status }: { value: number | null; status: ScreenerStatus }) {
  if (status === "loading") {
    return (
      <span data-slot="skeleton" className="bg-muted inline-block h-4 w-20 animate-pulse rounded" aria-hidden="true" />
    );
  }
  return <span className="text-foreground font-medium tabular-nums">{fmtYmd(value)}</span>;
}

/**
 * 두 아일랜드(BondScreener·BondDetail)가 공유하는 헤더. 테마 토글의 유일한 배치 지점이다.
 *
 * 건수는 여기에 두지 않는다(ui-audit ⑤) — 건수는 필터의 결과물이라 `ScreenerFilterBar`의
 * 배지가 유일한 소유자이고, 모바일 sticky 한 줄도 그 배지를 전제로 설계돼 있다(⑧).
 * 덕분에 기준일자가 헤더에 남는 유일한 데이터 값이 되어 위계가 생긴다(⑬).
 */
export function AppHeader({ title, summary }: AppHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* 기준일자가 값 두 개로 넓어져 모바일에서 제목을 압박한다 — flex-wrap으로 블록을
          통째로 아랫줄에 내려보내고, shrink-0으로 제목이 "채권 스크/리너"처럼 쪼개지는 것을
          막는다(실측 393px 뷰포트에서 재현). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {title && <h1 className="shrink-0 text-lg font-semibold">{title}</h1>}
        {summary && summary.status !== "error" && (
          // 배지가 아니라 라벨+값이다(ui-audit ⑬) — 금융 데이터 도구에서 "이 숫자가 언제
          // 것인가"는 보조 정보 기호(muted outline 배지)로 묻힐 값이 아니다. 라벨은 작게
          // 죽이고 날짜에 대비를 준다.
          //
          // 기본정보와 시세는 갱신 주기가 달라(전자는 base 주 1회 재빌드 + 영업일 델타,
          // 후자는 매 영업일) 한 날짜로 합치면 어느 쪽 날짜인지 알 수 없다 — 그래서 묶음
          // 라벨 아래 두 값을 나란히 둔다.
          //
          // 라벨과 값 사이의 {" "}를 지우지 말 것: flex 컨테이너라 공백 전용 텍스트 노드는
          // 렌더되지 않아(간격은 gap 담당) 화면에는 영향이 없지만, textContent에는 남아
          // 텍스트 셀렉터("기본정보 2026-08-28", /기본정보 \d{4}-\d{2}-\d{2}/, "시세 —")가
          // 그대로 매치한다. 쌍을 감싸는 span도 같은 이유로 필요하다 — 이게 없으면 라벨과
          // 값이 <p> 하나에 뒤섞여 쌍 단위로 단언할 수 없다.
          <p className="flex basis-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm md:basis-auto">
            {/* 라벨은 상수라 로딩 중에도 남긴다 — 무엇을 기다리는 중인지 보인다. */}
            <span className="text-muted-foreground text-xs">기준일자</span>{" "}
            <span className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground text-xs">기본정보</span>{" "}
              <BasDtValue value={summary.basDt} status={summary.status} />
            </span>
            <span aria-hidden="true" className="text-muted-foreground text-xs">
              ·
            </span>{" "}
            <span className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground text-xs">시세</span>{" "}
              <BasDtValue value={summary.priceBasDt} status={summary.status} />
            </span>
          </p>
        )}
      </div>
      {/* ml-auto가 없으면 모바일에서 기준일자 블록에 밀려 줄바꿈된 토글이 justify-between의
          한 항목짜리 줄에 남아 좌측으로 붙는다 — 데스크톱에서는 원래도 우측이라 무해하다. */}
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
