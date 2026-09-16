/**
 * `BondScreener` 통합 테스트. `stubFetch`로 `/api/snapshot/*`를 모킹하고 컴포넌트를
 * 통째로 렌더해, 인라인 주석으로만 보장돼 있던 계약을 실제로 고정한다:
 * (1) 필터 선택지는 필터 결과가 아니라 원본 전체 기준, (2) 필터 변경 시 페이지가
 * 1페이지로 리셋, (3) fetch 실패 시 에러 화면과 재시도.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { BondScreener } from "@/components/screener/BondScreener";
import { stubFetch } from "../../helpers/fetch-stub";
import { makeSnapshotIndex, makeSnapshotPayload, type SnapshotFixtureBond } from "../../helpers/snapshot-fixture";

// Vitest Browser Mode의 기본 뷰포트(414×896)는 md(768px) 미만이라 모바일 갈래로 렌더된다 —
// 이 파일의 테스트는 전부 데스크톱 레이아웃(칩이 항상 펼쳐진 ScreenerFilterBar)을 가정한다.
beforeEach(async () => {
  await page.viewport(1200, 800);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 30건 — pageSize(25) 초과라 2페이지가 되고, 등급은 AAA(0~19) / BBB(20~29)로 나뉜다. */
function makeBonds(): SnapshotFixtureBond[] {
  return Array.from({ length: 30 }, (_, i) => ({
    isinCd: `KR${String(i).padStart(10, "0")}`,
    isinCdNm: `유일채권${i}`,
    bondIsurNm: "테스트발행사",
    lastChgBasDt: 20260828,
    kisGrade: i < 20 ? "AAA" : "BBB",
  }));
}

function stubSnapshot(bonds: SnapshotFixtureBond[]) {
  const payload = makeSnapshotPayload(bonds);
  const index = makeSnapshotIndex(payload);
  stubFetch([
    { match: "/api/snapshot/index", body: index },
    { match: `/api/snapshot/bond/${payload.basDt}`, body: payload },
  ]);
  return payload;
}

describe("BondScreener", () => {
  /**
   * 로딩 프레임 회귀 가드. `stubFetch`는 매칭 안 된 라우트에서 throw하고 즉시 응답해
   * 로딩 상태를 붙잡을 수 없으므로, 영원히 pending인 fetch를 직접 심어 `isPending`을 고정한다
   * (정리는 이 파일 상단의 `afterEach(vi.unstubAllGlobals)`가 맡는다).
   */
  test("로딩 중에는 0 건수를 확정값처럼 보여주지 않는다", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const screen = await render(<BondScreener />);

    // 스켈레톤이 떴는지부터 확인해 "아직 마운트 전이라 문구가 없다"와 구분한다.
    await expect
      .poll(() => screen.container.querySelectorAll('tbody tr[data-slot="screener-skeleton-row"]').length)
      .toBeGreaterThan(0);

    await expect.element(screen.getByText("총 0건", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("0–0 / 전체 0건")).not.toBeInTheDocument();
    await expect.element(screen.getByText("1 / 1")).not.toBeInTheDocument();
    await expect.element(screen.getByText("기준일자 —")).not.toBeInTheDocument();

    // 로딩 사실은 라이브 리전이 알린다(스켈레톤 행은 aria-hidden이라 낭독되지 않는다).
    await expect.element(screen.getByText("채권 목록을 불러오는 중입니다.")).toBeInTheDocument();
  });

  test("정상 로드 — 전체 건수를 표시한다", async () => {
    stubSnapshot(makeBonds());
    const screen = await render(<BondScreener />);
    await expect.element(screen.getByText("총 30건")).toBeInTheDocument();
  });

  test("필터 선택지는 필터 결과가 아니라 원본 전체 기준으로 유지된다", async () => {
    stubSnapshot(makeBonds());
    const screen = await render(<BondScreener />);
    await expect.element(screen.getByText("총 30건")).toBeInTheDocument();

    // 검색으로 결과를 BBB 등급 종목 1건으로 좁힌다.
    await screen.getByPlaceholder("종목명·발행인·ISIN 검색").fill("유일채권25");
    // ScreenerHeader와 ScreenerFilterBar가 같은 문구 형식("N건 / 전체 M건")을 각자 표시하므로
    // getByText가 2건에 매치한다 — .first()로 하나만 골라 존재를 확인한다.
    await expect.element(screen.getByText("1건 / 전체 30건").first()).toBeInTheDocument();

    // 신용등급 선택지는 여전히 AAA/BBB 둘 다 보여야 한다(원본 30건 기준) — 결과가 1건으로
    // 좁혀졌다고 선택지 자체가 BBB 하나로 줄면 다중선택을 다시 넓히기 어려워진다.
    // "신용등급"만으로는 표 헤더의 정렬 버튼과도 매치하므로("신용등급" 컬럼) 전체 라벨로 특정한다.
    await userEvent.click(screen.getByRole("button", { name: "신용등급 전체" }));

    // 팝오버는 Portal로 body 직속에 렌더돼 screen.container 밖에 있고, 필터링된 결과
    // 행에도 "BBB" Badge가 남아있어 전역 getByText는 모호하다 — 팝오버 콘텐츠로 범위를
    // 좁힌다(vitest-browser-react 내부와 동일하게 page.elementLocator로 스코프).
    const popoverContent = document.querySelector('[data-slot="popover-content"]');
    if (!popoverContent) throw new Error("팝오버 콘텐츠를 찾지 못했습니다");
    const popover = page.elementLocator(popoverContent);
    await expect.element(popover.getByText("AAA")).toBeInTheDocument();
    await expect.element(popover.getByText("BBB")).toBeInTheDocument();
  });

  test("2페이지로 이동한 뒤 필터를 바꾸면 1페이지로 돌아간다", async () => {
    stubSnapshot(makeBonds());
    const screen = await render(<BondScreener />);
    await expect.element(screen.getByText("총 30건")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await expect.element(screen.getByText("26–30 / 전체 30건")).toBeInTheDocument();

    await screen.getByPlaceholder("종목명·발행인·ISIN 검색").fill("유일채권");
    // 검색어가 전체 30건에 매치하므로 결과 수는 그대로지만, 필터 변경 자체가
    // pageIndex를 0으로 되돌린다(autoResetPageIndex: false + setFilters의 수동 리셋).
    await expect.element(screen.getByText("1–25 / 전체 30건")).toBeInTheDocument();
  });

  test("fetch 실패 시 에러 화면을 표시하고, 재시도하면 정상 렌더된다", async () => {
    stubFetch([{ match: "/api/snapshot/index", status: 500, body: "" }]);
    const screen = await render(<BondScreener />);
    await expect.element(screen.getByText("데이터를 불러오지 못했습니다.")).toBeInTheDocument();

    stubSnapshot(makeBonds());
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await expect.element(screen.getByText("총 30건")).toBeInTheDocument();
  });
});
