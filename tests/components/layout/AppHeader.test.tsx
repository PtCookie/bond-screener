import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { AppHeader } from "@/components/layout/AppHeader";
import type { ScreenerStatus } from "@/lib/screener/types";

function summary(over: Partial<Parameters<typeof AppHeader>[0]["summary"] & object> = {}) {
  return {
    basDt: 20260828 as number | null,
    status: "ready" as ScreenerStatus,
    ...over,
  };
}

describe("AppHeader", () => {
  test("basDt가 null이면 대시로 표시된다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary({ basDt: null })} />);
    await expect.element(screen.getByText("기준일자 —")).toBeInTheDocument();
  });

  // 라벨과 날짜가 서로 다른 span이지만 사이의 공백 텍스트 노드가 살아 있어야 이 단언이
  // 통과한다(AppHeader의 {" "} 주석 참고) — 깨지면 마크업 쪽을 고칠 것.
  test("basDt가 있으면 YYYY-MM-DD로 표시된다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary()} />);
    await expect.element(screen.getByText("기준일자 2026-08-28")).toBeInTheDocument();
  });

  // 건수는 ScreenerFilterBar 배지가 유일한 소유자다(ui-audit ⑤) — 헤더에는 없어야 한다.
  test("건수는 어떤 상태에서도 헤더에 그리지 않는다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary()} />);
    await expect.element(screen.getByText("건", { exact: false })).not.toBeInTheDocument();
  });

  test("로딩 중에는 기준일자 대신 자리바를 표시한다", async () => {
    const screen = await render(
      <AppHeader title="채권 스크리너" summary={summary({ basDt: null, status: "loading" })} />,
    );

    // 0이나 대시를 확정값처럼 그리면 "아직 안 왔다"와 "진짜 그 값이다"가 구분되지 않는다.
    await expect.element(screen.getByText("기준일자 —")).not.toBeInTheDocument();
    // 라벨 자체는 남아 무엇을 기다리는지 보인다.
    await expect.element(screen.getByText("기준일자", { exact: false })).toBeInTheDocument();
    expect(screen.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  // 실패 상태에서 스켈레톤을 깜빡이면 "로딩이 끝나지 않는다"로 읽힌다 — 아예 그리지 않는다.
  test("에러 상태에서는 기준일자도 스켈레톤도 그리지 않는다", async () => {
    const screen = await render(
      <AppHeader title="채권 스크리너" summary={summary({ basDt: null, status: "error" })} />,
    );

    await expect.element(screen.getByText("기준일자", { exact: false })).not.toBeInTheDocument();
    expect(screen.container.querySelector('[data-slot="skeleton"]')).toBeNull();
    // 제목은 남는다.
    await expect.element(screen.getByRole("heading", { name: "채권 스크리너" })).toBeInTheDocument();
  });

  // 상세 페이지의 사용법. h1은 종목명(BondDetailHeader)이 소유해야 하므로 여기서 h1을 내면
  // e2e/navigation.spec.ts의 `getByRole("heading", { level: 1 })`이 strict mode로 깨진다.
  test("title 없이 쓰면 h1도 기준일자도 그리지 않고 테마 토글만 남는다", async () => {
    const screen = await render(<AppHeader />);

    expect(screen.container.querySelector("h1")).toBeNull();
    await expect.element(screen.getByText("기준일자", { exact: false })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "테마 전환" })).toBeInTheDocument();
  });

  test("테마 토글은 어느 사용법에서도 함께 렌더된다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary()} />);
    await expect.element(screen.getByRole("button", { name: "테마 전환" })).toBeInTheDocument();
  });
});
