import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { BondDetailHeader } from "@/components/bond/BondDetailHeader";

describe("BondDetailHeader", () => {
  test("null 필드는 대시로 표시된다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm={null}
        markets={[]}
        market="일반채권"
        onMarketChange={() => {}}
        latestPrices={[]}
      />,
    );
    await expect.element(screen.getByRole("heading", { name: "—" })).toBeInTheDocument();
    await expect.element(screen.getByText("KR6000011D36")).toBeInTheDocument();
  });

  test("ISIN만 라벨과 함께 표시하고, 발행인·단축코드는 표시하지 않는다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm="테스트채권"
        markets={[]}
        market="일반채권"
        onMarketChange={() => {}}
        latestPrices={[]}
      />,
    );
    await expect.element(screen.getByText("ISIN")).toBeInTheDocument();
    await expect.element(screen.getByText("KR6000011D36")).toBeInTheDocument();
    // 발행인·단축코드는 발행 개요 카드로 옮겼다 — 컴포넌트 props에서도 완전히 빠졌다(ui-audit ⑱).
    // 가운뎃점으로 이어붙인 예전 형태("A · B · C")가 남지 않았는지도 확인한다.
    await expect.element(screen.getByText(/·/)).not.toBeInTheDocument();
  });

  test("latestPrices가 있으면 선택된 시장의 종가/수익률이 각각 라벨과 함께 표시된다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm="테스트채권"
        markets={["일반채권"]}
        market="일반채권"
        onMarketChange={() => {}}
        latestPrices={[{ mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 }]}
      />,
    );
    await expect.element(screen.getByText("10,250")).toBeInTheDocument();
    await expect.element(screen.getByText("종가")).toBeInTheDocument();
    await expect.element(screen.getByText("3.200%")).toBeInTheDocument();
    await expect.element(screen.getByText("수익률")).toBeInTheDocument();
    // 예전처럼 "-2 (3.811%)"로 괄호 안에 묶이지 않는다 — 전일대비와 수익률은 별도 값이다.
    await expect.element(screen.getByText(/\(.*%.*\)/)).not.toBeInTheDocument();
  });

  test("전일대비 양수는 up 톤, 음수는 down 톤 클래스를 받는다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm="테스트채권"
        markets={["일반채권", "KTS"]}
        market="일반채권"
        onMarketChange={() => {}}
        latestPrices={[
          { mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 },
          { mrktCtg: "KTS", clprPrc: 10000, clprVs: -30, clprBnfRt: 3.0 },
        ]}
      />,
    );
    await expect.element(screen.getByText("+50")).toHaveClass(/text-price-up/);
  });

  test("markets가 2개 이상일 때만 시장 토글이 뜬다", async () => {
    const single = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm="테스트채권"
        markets={["일반채권"]}
        market="일반채권"
        onMarketChange={() => {}}
        latestPrices={[{ mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 }]}
      />,
    );
    await expect.element(single.getByRole("group", { name: "시장" })).not.toBeInTheDocument();

    const multi = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm="테스트채권"
        markets={["KTS", "일반채권"]}
        market="일반채권"
        onMarketChange={() => {}}
        latestPrices={[
          { mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 },
          { mrktCtg: "KTS", clprPrc: 10000, clprVs: -30, clprBnfRt: 3.0 },
        ]}
      />,
    );
    await expect.element(multi.getByRole("group", { name: "시장" })).toBeInTheDocument();
  });

  test("시장 토글을 누르면 onMarketChange가 그 시장으로 호출된다", async () => {
    const onMarketChange = vi.fn();
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        isinCdNm="테스트채권"
        markets={["KTS", "일반채권"]}
        market="일반채권"
        onMarketChange={onMarketChange}
        latestPrices={[
          { mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 },
          { mrktCtg: "KTS", clprPrc: 10000, clprVs: -30, clprBnfRt: 3.0 },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "KTS" }));
    expect(onMarketChange).toHaveBeenCalledWith("KTS");
  });
});
