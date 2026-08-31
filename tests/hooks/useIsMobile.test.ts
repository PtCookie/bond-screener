/**
 * `src/hooks/useIsMobile.ts` — jsdom 스텁이 아니라 실제 뷰포트를 767px 아래위로 바꿔가며
 * matchMedia("(max-width: 767px)")가 진짜로 평가되는지 확인한다(Browser Mode의 직접적 이득).
 */
import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderHook } from "vitest-browser-react";
import { useIsMobile } from "@/hooks/useIsMobile";

describe("useIsMobile", () => {
  test("768px 이상이면 false", async () => {
    await page.viewport(1024, 768);
    const { result } = await renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test("767px 이하이면 true", async () => {
    await page.viewport(500, 800);
    const { result } = await renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test("마운트 후 뷰포트가 바뀌면 값이 갱신된다", async () => {
    await page.viewport(1024, 768);
    const { result } = await renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    await page.viewport(400, 800);
    // matchMedia의 change 이벤트는 비동기로 전달되므로 값이 뒤집힐 때까지 기다린다.
    await expect.poll(() => result.current).toBe(true);
  });

  test("언마운트 후에는 더 이상 값이 갱신되지 않는다(리스너 해제)", async () => {
    await page.viewport(1024, 768);
    const { result, unmount } = await renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    await unmount();
    await page.viewport(400, 800);
    // 언마운트된 훅의 result는 더 이상 갱신되지 않는다 — 마지막 값 그대로 남아야 한다.
    expect(result.current).toBe(false);
  });
});
