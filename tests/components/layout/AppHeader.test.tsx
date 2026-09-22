import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { AppHeader } from "@/components/layout/AppHeader";
import type { ScreenerStatus } from "@/lib/screener/types";

// 두 날짜를 일부러 다른 값으로 둔다 — 기본정보/시세 칸이 서로 섞이지 않는지가 이 화면의 핵심이다.
function summary(over: Partial<Parameters<typeof AppHeader>[0]["summary"] & object> = {}) {
  return {
    basDt: 20260828 as number | null,
    priceBasDt: 20260919 as number | null,
    status: "ready" as ScreenerStatus,
    ...over,
  };
}

describe("AppHeader", () => {
  test("basDt가 null이면 대시로 표시된다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary({ basDt: null })} />);
    await expect.element(screen.getByText("기본정보 —")).toBeInTheDocument();
  });

  // 라벨과 날짜가 서로 다른 span이지만 사이의 공백 텍스트 노드가 살아 있어야 이 단언이
  // 통과한다(AppHeader의 {" "} 주석 참고) — 깨지면 마크업 쪽을 고칠 것.
  test("기본정보와 시세 기준일이 각각 YYYY-MM-DD로 표시된다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary()} />);
    await expect.element(screen.getByText("기본정보 2026-08-28")).toBeInTheDocument();
    await expect.element(screen.getByText("시세 2026-09-19")).toBeInTheDocument();
  });

  // 스냅샷에 시세가 한 건도 없는 경우. 기본정보 쪽은 멀쩡히 떠야 한다 — 한쪽이 없다고
  // 나머지까지 못 보여주면 폴백으로 합쳐 두던 예전과 다를 바가 없다.
  test("시세 기준일만 없으면 그 칸만 대시가 된다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary({ priceBasDt: null })} />);
    await expect.element(screen.getByText("기본정보 2026-08-28")).toBeInTheDocument();
    await expect.element(screen.getByText("시세 —")).toBeInTheDocument();
  });

  // 건수는 ScreenerFilterBar 배지가 유일한 소유자다(ui-audit ⑤) — 헤더에는 없어야 한다.
  test("건수는 어떤 상태에서도 헤더에 그리지 않는다", async () => {
    const screen = await render(<AppHeader title="채권 스크리너" summary={summary()} />);
    await expect.element(screen.getByText("건", { exact: false })).not.toBeInTheDocument();
  });

  test("로딩 중에는 기준일자 대신 자리바를 표시한다", async () => {
    const screen = await render(
      <AppHeader title="채권 스크리너" summary={summary({ basDt: null, priceBasDt: null, status: "loading" })} />,
    );

    // 0이나 대시를 확정값처럼 그리면 "아직 안 왔다"와 "진짜 그 값이다"가 구분되지 않는다.
    await expect.element(screen.getByText("기본정보 —")).not.toBeInTheDocument();
    await expect.element(screen.getByText("시세 —")).not.toBeInTheDocument();
    // 라벨 자체는 남아 무엇을 기다리는지 보인다.
    await expect.element(screen.getByText("기준일자", { exact: true })).toBeInTheDocument();
    // 자리바는 값 칸마다 하나씩 — 한쪽만 뜨면 나머지 칸이 조용히 비어 보인다.
    expect(screen.container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });

  // 실패 상태에서 스켈레톤을 깜빡이면 "로딩이 끝나지 않는다"로 읽힌다 — 아예 그리지 않는다.
  test("에러 상태에서는 기준일자도 스켈레톤도 그리지 않는다", async () => {
    const screen = await render(
      <AppHeader title="채권 스크리너" summary={summary({ basDt: null, priceBasDt: null, status: "error" })} />,
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
