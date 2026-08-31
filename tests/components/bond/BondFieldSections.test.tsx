import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { BondFieldSections } from "@/components/bond/BondFieldSections";
import { DETAIL_SECTIONS } from "@/lib/bond/detail-view";
import type { BondDetailField } from "@/lib/bond/detail";

describe("BondFieldSections", () => {
  test("모든 섹션 제목이 렌더된다", async () => {
    const screen = await render(<BondFieldSections bond={{}} state={null} />);
    for (const section of DETAIL_SECTIONS) {
      // exact: true — 기본값(false, 부분일치)이면 "금액" 섹션 제목이 "채권발행금액" 같은
      // 필드 라벨의 부분 문자열에도 매치해 모호해진다.
      await expect.element(screen.getByText(section.title, { exact: true })).toBeInTheDocument();
    }
  });

  test("bond 소스 필드는 bond 객체에서 값을 가져온다", async () => {
    const bond: Record<string, BondDetailField> = { isinCdNm: "테스트채권" };
    const screen = await render(<BondFieldSections bond={bond} state={null} />);
    await expect.element(screen.getByText("테스트채권")).toBeInTheDocument();
  });

  test("state가 null이면 state 소스 필드(신용등급 등)는 대시로 표시된다", async () => {
    const screen = await render(<BondFieldSections bond={{}} state={null} />);
    // "신용등급" 섹션의 4개 필드(kisGrade 등)가 전부 state 소스라, state가 null이면
    // 이 섹션 안에 대시가 4개 있어야 한다.
    const dashes = screen.getByText("—");
    await expect.element(dashes.first()).toBeInTheDocument();
  });

  test("state가 있으면 state 소스 필드가 그 값을 표시한다", async () => {
    const screen = await render(<BondFieldSections bond={{}} state={{ kisGrade: "AAA" }} />);
    await expect.element(screen.getByText("AAA")).toBeInTheDocument();
  });
});
