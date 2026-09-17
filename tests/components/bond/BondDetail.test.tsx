/**
 * `BondDetail`은 최상단에서 `QueryProvider`로 감싸고 `PriceChartCard`를 포함한다 —
 * `PriceChartCard`는 내부에서 `useBondPrices`로 fetch하므로 이 컴포넌트를 렌더하려면
 * `GET /api/bond/[id]/prices`를 항상 스텁해야 한다(응답 없이 두면 pending 상태로 남을
 * 뿐 에러는 아니라 이 테스트들에는 영향 없다).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { BondDetail } from "@/components/bond/BondDetail";
import { stubFetch, type StubFetchHandle } from "../../helpers/fetch-stub";
import { makeBondDetailResponse } from "../../helpers/bond-detail";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPrices(): StubFetchHandle {
  return stubFetch([
    {
      match: (url) => url.includes("/prices"),
      // decodePriceSeries가 basDt/mrktCtg/clprPrc/clprBnfRt 컬럼 존재를 요구한다 —
      // rows는 비워도 columns는 실제 응답 형태를 갖춰야 한다.
      body: {
        isinCd: "KR6000011D36",
        from: 0,
        to: 0,
        columns: ["basDt", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt"],
        rows: [],
        truncated: false,
      },
    },
  ]);
}

describe("BondDetail", () => {
  test("stateHistory가 1건이면 변경 이력 표를 렌더하지 않는다", async () => {
    stubPrices();
    const detail = makeBondDetailResponse({ stateHistory: [{ valid_from: 20260101 }] });
    const screen = await render(<BondDetail detail={detail} />);
    await expect.element(screen.getByText("변경 이력")).not.toBeInTheDocument();
  });

  test("stateHistory가 2건 이상이면 변경 이력 표를 렌더한다", async () => {
    stubPrices();
    const detail = makeBondDetailResponse({
      stateHistory: [{ valid_from: 20260201, kis_grade: "AA-" }, { valid_from: 20260101 }],
    });
    const screen = await render(<BondDetail detail={detail} />);
    await expect.element(screen.getByText("변경 이력")).toBeInTheDocument();
  });

  test("markets는 latestPrices에 실제 존재하는 시장만, 선언 순서(KTS→일반채권→소액채권)로 파생된다", async () => {
    stubPrices();
    const detail = makeBondDetailResponse({
      latestPrices: [
        { mrkt_ctg: 2, clpr_prc: 10000 }, // 일반채권
        { mrkt_ctg: 1, clpr_prc: 10050 }, // KTS
      ],
    });
    const screen = await render(<BondDetail detail={detail} />);
    // PriceChartCard는 markets.length > 1일 때만 시장 토글그룹을 렌더한다.
    const toggle = screen.getByRole("group", { name: "시장" });
    await expect.element(toggle).toBeInTheDocument();
    // KTS가 일반채권보다 먼저 나와야 한다(선언 순서).
    const buttons = toggle.getByRole("button");
    await expect.element(buttons.first()).toHaveTextContent("KTS");
  });

  test("markets가 1개면 시장 토글그룹이 렌더되지 않는다", async () => {
    stubPrices();
    const detail = makeBondDetailResponse({ latestPrices: [{ mrkt_ctg: 2, clpr_prc: 10000 }] });
    const screen = await render(<BondDetail detail={detail} />);
    await expect.element(screen.getByRole("group", { name: "시장" })).not.toBeInTheDocument();
  });

  test("헤더의 시장 토글을 누르면 가격 추이 차트도 같은 시장으로 재요청한다", async () => {
    const handle = stubPrices();
    const detail = makeBondDetailResponse({
      latestPrices: [
        { mrkt_ctg: 2, clpr_prc: 10000 }, // 일반채권
        { mrkt_ctg: 1, clpr_prc: 10050 }, // KTS
      ],
    });
    const screen = await render(<BondDetail detail={detail} />);
    const toggle = screen.getByRole("group", { name: "시장" });
    // 초기 선택은 BOND_MARKET_CATEGORIES 선언 순서(KTS → 일반채권)의 첫 시장이다.
    await expect.poll(() => handle.calledUrls.at(-1)).toContain("market=KTS");

    await userEvent.click(toggle.getByRole("button", { name: "일반채권" }));
    await expect.poll(() => handle.calledUrls.at(-1)).toContain("market=%EC%9D%BC%EB%B0%98%EC%B1%84%EA%B6%8C");
  });

  test("발행 개요의 시장구분에 존재하는 시장이 모두 나열된다", async () => {
    stubPrices();
    const detail = makeBondDetailResponse({
      latestPrices: [
        { mrkt_ctg: 2, clpr_prc: 10000 }, // 일반채권
        { mrkt_ctg: 1, clpr_prc: 10050 }, // KTS
      ],
    });
    const screen = await render(<BondDetail detail={detail} />);
    await expect.element(screen.getByText("시장구분")).toBeInTheDocument();
    await expect.element(screen.getByText("KTS, 일반채권")).toBeInTheDocument();
  });

  // ui-audit ㉖ — 차트 상태(시장·지표·기간) URL 동기화. `useChartViewState`가 URL 복원을
  // 끝내야 useBondPrices가 요청을 쏘므로(restored 게이트), 첫 요청은 항상 poll로 기다린다.
  test("기간 토글을 누르면 URL에 range가 반영된다", async () => {
    const handle = stubPrices();
    const detail = makeBondDetailResponse();
    const screen = await render(<BondDetail detail={detail} />);
    await expect.poll(() => handle.calledUrls.length).toBeGreaterThan(0);

    const periodToggle = screen.getByRole("group", { name: "기간" });
    await userEvent.click(periodToggle.getByRole("button", { name: "3M" }));

    await expect.poll(() => window.location.search).toContain("range=3M");
  });

  test("?range=3M&metric=yield로 진입하면 그 상태로 복원된다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?range=3M&metric=yield`);
    const handle = stubPrices();
    const detail = makeBondDetailResponse();
    const screen = await render(<BondDetail detail={detail} />);

    await expect.element(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
    await expect.element(screen.getByRole("button", { name: "수익률" })).toHaveAttribute("aria-pressed", "true");
    // 기본값(1Y)이 아니라 복원된 3M로 딱 한 번만 요청됐는지 — 기본값→복원값 이중 요청이
    // 없다는 것이 enabled 게이트(useBondPrices의 restored)의 존재 이유다.
    await expect.poll(() => handle.calledUrls.length).toBe(1);
  });
});
