/**
 * `PriceChartCard`는 내부에서 `useBondPrices`(TanStack Query)로 `/api/bond/[id]/prices`를
 * 호출한다 — `stubFetch`로 응답을 주고 `renderWithQuery`로 감싼다. lightweight-charts는
 * 여기서 모킹하지 않는다(실제 렌더 — `PriceChart.smoke.test.tsx`와 같은 근거).
 *
 * 시장 선택은 `BondDetailHeader`/`BondDetail`이 소유한다(ui-audit ⑥) — 시장 토글 자체와
 * `market=` 쿼리스트링 갱신 검증은 `BondDetail.test.tsx`에 있다. 이 파일은 `market`을
 * 고정 prop으로만 받는다.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { PriceChartCard } from "@/components/bond/PriceChartCard";
import { stubFetch, type StubFetchHandle } from "../../helpers/fetch-stub";
import { renderWithQuery } from "../../helpers/render-query";

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE_COLUMNS = ["basDt", "mrktCtg", "clprPrc", "clprVs", "clprBnfRt"];

function makeResponse(overrides: Partial<{ rows: (string | number | null)[][]; truncated: boolean }> = {}) {
  return {
    isinCd: "KR6000011D36",
    from: 20260101,
    to: 20260828,
    columns: BASE_COLUMNS,
    rows: overrides.rows ?? [[20260828, "일반채권", 10000, 10, 3.2]],
    truncated: overrides.truncated ?? false,
  };
}

describe("PriceChartCard", () => {
  test("로딩 중에는 스켈레톤을 보여준다", async () => {
    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal("fetch", (async () => new Promise<Response>((resolve) => (resolveFetch = resolve))) as typeof fetch);
    const screen = await renderWithQuery(<PriceChartCard isinCd="KR6000011D36" market="일반채권" />);
    await expect.element(screen.getByText("가격 추이")).toBeInTheDocument();
    // 아직 미완료 — 차트 대신 스켈레톤이 보여야 하므로 "표시할 시세가 없습니다" 같은
    // 차트 자체 텍스트는 없어야 한다.
    await expect.element(screen.getByText("표시할 시세가 없습니다.")).not.toBeInTheDocument();
    resolveFetch(new Response(JSON.stringify(makeResponse()), { status: 200 }));
  });

  test("에러 시 제품 문구를 보여주고, 다시 시도 클릭 시 재요청한다", async () => {
    const handle: StubFetchHandle = stubFetch([{ match: (url) => url.includes("/prices"), status: 500, body: "" }]);
    const screen = await renderWithQuery(<PriceChartCard isinCd="KR6000011D36" market="일반채권" />);
    await expect.element(screen.getByText("데이터를 불러오지 못했습니다.")).toBeInTheDocument();
    // 원본 에러(`요청 실패: ... (HTTP 500)`)는 개발자용 문구라 화면에 그대로 노출하지 않는다.
    await expect.element(screen.getByText(/요청 실패/)).not.toBeInTheDocument();

    const firstCallCount = handle.calledUrls.length;
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await expect.poll(() => handle.calledUrls.length).toBeGreaterThan(firstCallCount);
  });

  test("truncated가 true면 잘림 안내 문구를 표시한다", async () => {
    stubFetch([{ match: (url) => url.includes("/prices"), body: makeResponse({ truncated: true }) }]);
    const screen = await renderWithQuery(<PriceChartCard isinCd="KR6000011D36" market="일반채권" />);
    await expect.element(screen.getByText("일부 구간의 데이터가 표시 상한을 넘어 잘렸습니다.")).toBeInTheDocument();
  });

  test("지표 토글(종가↔수익률) 클릭 시 UI가 갱신된다(재요청 없음 — 클라이언트 상태)", async () => {
    stubFetch([{ match: (url) => url.includes("/prices"), body: makeResponse() }]);
    const screen = await renderWithQuery(<PriceChartCard isinCd="KR6000011D36" market="일반채권" />);
    await expect.element(screen.getByText("가격 추이")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "수익률" }));
    // 지표는 fetch 파라미터가 아니라 클라이언트에서만 계산되므로 별도 요청이 나가지
    // 않는다 — 버튼이 눌린 상태(aria-pressed)만 확인한다.
    await expect.element(screen.getByRole("button", { name: "수익률" })).toHaveAttribute("aria-pressed", "true");
  });

  test("기간 프리셋 전환 시 새 from/to로 재요청한다", async () => {
    const handle: StubFetchHandle = stubFetch([{ match: (url) => url.includes("/prices"), body: makeResponse() }]);
    const screen = await renderWithQuery(<PriceChartCard isinCd="KR6000011D36" market="일반채권" />);
    await expect.element(screen.getByText("가격 추이")).toBeInTheDocument();
    const firstCallCount = handle.calledUrls.length;

    await userEvent.click(screen.getByRole("button", { name: "3M" }));
    await expect.poll(() => handle.calledUrls.length).toBeGreaterThan(firstCallCount);
  });

  test("market prop이 바뀌면 그 시장으로 재요청한다", async () => {
    const handle: StubFetchHandle = stubFetch([{ match: (url) => url.includes("/prices"), body: makeResponse() }]);
    const screen = await renderWithQuery(<PriceChartCard isinCd="KR6000011D36" market="KTS" />);
    await expect.element(screen.getByText("가격 추이")).toBeInTheDocument();
    expect(handle.calledUrls.at(-1)).toContain("market=KTS");

    await screen.rerender(<PriceChartCard isinCd="KR6000011D36" market="일반채권" />);
    await expect.poll(() => handle.calledUrls.at(-1)).toContain("market=%EC%9D%BC%EB%B0%98%EC%B1%84%EA%B6%8C");
  });
});
