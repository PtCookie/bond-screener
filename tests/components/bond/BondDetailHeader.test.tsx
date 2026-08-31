import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { BondDetailHeader } from "@/components/bond/BondDetailHeader";

describe("BondDetailHeader", () => {
  test("null 필드는 대시로 표시된다", async () => {
    const screen = await render(
      <BondDetailHeader isinCd="KR6000011D36" srtnCd={null} isinCdNm={null} bondIsurNm={null} latestPrices={[]} />,
    );
    await expect.element(screen.getByRole("heading", { name: "—" })).toBeInTheDocument();
    await expect.element(screen.getByText(/KR6000011D36/)).toBeInTheDocument();
  });

  test("srtnCd가 있으면 함께 표시된다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        srtnCd="60000123"
        isinCdNm="테스트채권"
        bondIsurNm="테스트발행사"
        latestPrices={[]}
      />,
    );
    await expect.element(screen.getByText("테스트발행사 · KR6000011D36 · 60000123")).toBeInTheDocument();
  });

  test("latestPrices가 있으면 시장별 가격 카드가 렌더된다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        srtnCd={null}
        isinCdNm="테스트채권"
        bondIsurNm="테스트발행사"
        latestPrices={[{ mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 }]}
      />,
    );
    await expect.element(screen.getByText("일반채권")).toBeInTheDocument();
    await expect.element(screen.getByText("10,250")).toBeInTheDocument();
  });

  test("전일대비 양수는 up 톤, 음수는 down 톤 클래스를 받는다", async () => {
    const screen = await render(
      <BondDetailHeader
        isinCd="KR6000011D36"
        srtnCd={null}
        isinCdNm="테스트채권"
        bondIsurNm="테스트발행사"
        latestPrices={[
          { mrktCtg: "일반채권", clprPrc: 10250, clprVs: 50, clprBnfRt: 3.2 },
          { mrktCtg: "KTS", clprPrc: 10000, clprVs: -30, clprBnfRt: 3.0 },
        ]}
      />,
    );
    // clprVs/clprBnfRt가 "+50 (3.200%)" 형태로 한 요소 안에 합쳐 렌더되므로 정규식으로 찾는다.
    await expect.element(screen.getByText(/^\+50/)).toHaveClass(/text-price-up/);
    await expect.element(screen.getByText(/^-30/)).toHaveClass(/text-price-down/);
  });
});
