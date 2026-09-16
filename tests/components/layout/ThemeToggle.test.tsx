/**
 * `setup-browser.ts`의 afterEach가 `.dark`/`data-theme`/localStorage를 되돌리므로 각 테스트는
 * 깨끗한 <html>에서 시작한다.
 */
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

async function choose(screen: Awaited<ReturnType<typeof render>>, label: "시스템" | "라이트" | "다크") {
  await screen.getByRole("button", { name: "테마 전환" }).click();
  await screen.getByRole("menuitem", { name: label }).click();
}

describe("ThemeToggle", () => {
  test("접근 가능한 이름을 가진 버튼으로 렌더된다", async () => {
    const screen = await render(<ThemeToggle />);
    await expect.element(screen.getByRole("button", { name: "테마 전환" })).toBeInTheDocument();
  });

  test("다크를 고르면 .dark 클래스·data-theme·localStorage가 함께 갱신된다", async () => {
    const screen = await render(<ThemeToggle />);
    await choose(screen, "다크");

    await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  test("라이트를 고르면 .dark 클래스가 제거된다", async () => {
    const screen = await render(<ThemeToggle />);
    await choose(screen, "다크");
    await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(true);

    await choose(screen, "라이트");
    await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  // 저장되는 것은 해소된 값("light"/"dark")이 아니라 고른 값 그대로여야 한다 — 아니면
  // 다음 방문에서 "OS를 따른다"는 의사가 사라진다.
  test("시스템을 고르면 해소값이 아니라 리터럴 'system'이 저장된다", async () => {
    const screen = await render(<ThemeToggle />);
    await choose(screen, "다크");
    await choose(screen, "시스템");

    await expect.poll(() => localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  // 시스템 모드의 해소 결과는 OS 설정에 달렸다 — 어느 쪽이든 data-theme은 "system"으로
  // 남고 .dark 여부만 그 설정을 따라가야 한다.
  test("시스템 모드의 .dark 여부는 prefers-color-scheme과 일치한다", async () => {
    const screen = await render(<ThemeToggle />);
    await choose(screen, "시스템");

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(prefersDark);
  });

  test("이미 적용된 테마가 있으면 그 상태에서 시작한다", async () => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.classList.add("dark");

    const screen = await render(<ThemeToggle />);

    // 마운트만으로 기존 상태를 덮어쓰지 않는다(아일랜드가 둘이라 서로를 되돌리면 안 된다).
    await expect.element(screen.getByRole("button", { name: "테마 전환" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
