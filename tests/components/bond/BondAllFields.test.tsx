import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { BondAllFields } from "@/components/bond/BondAllFields";
import { ALL_BOND_FIELD_SPECS, CURATED_BOND_KEYS } from "@/lib/bond/detail-view";

describe("BondAllFields", () => {
  test("헤더의 개수가 큐레이션 제외 필드 수와 일치한다", async () => {
    const expectedCount = Object.values(ALL_BOND_FIELD_SPECS).filter((f) => !CURATED_BOND_KEYS.has(f.key)).length;
    const screen = await render(<BondAllFields bond={{}} />);
    await expect.element(screen.getByText(`전체 항목 (${expectedCount})`)).toBeInTheDocument();
  });

  test("트리거를 클릭하면 콘텐츠가 열린다", async () => {
    const screen = await render(<BondAllFields bond={{ irtChngDcdNm: "고정금리", stripsNm: "테스트스트립스" }} />);
    // Collapsible 콘텐츠는 base-ui가 애니메이션과 함께 마운트하므로 실제 값이 보일 때까지 기다린다.
    await expect.element(screen.getByText("테스트스트립스")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /전체 항목/ }));
    await expect.element(screen.getByText("고정금리")).toBeInTheDocument();
    await expect.element(screen.getByText("테스트스트립스")).toBeInTheDocument();
  });

  test("큐레이션 섹션에 이미 노출된 필드(예: isinCdNm)는 여기 없다", async () => {
    const screen = await render(<BondAllFields bond={{ isinCdNm: "테스트채권" }} />);
    await userEvent.click(screen.getByRole("button", { name: /전체 항목/ }));
    await expect.element(screen.getByText("테스트채권")).not.toBeInTheDocument();
  });
});
