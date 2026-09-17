/**
 * 다크모드 부트스트랩 검증. 컴포넌트 수준(`tests/components/layout/ThemeToggle.test.tsx`)은
 * 토글이 DOM·localStorage를 올바로 쓰는지까지만 볼 수 있다 — 여기서는 실제 Astro 서버가
 * 내려주는 HTML과 **전체 페이지 리로드**를 거쳐야만 드러나는 것들을 본다.
 *
 * 이 저장소에는 `<ClientRouter />`가 없다(MPA). www의 같은 스펙에 있는 "client-side
 * navigation을 넘겨 살아남는다" 2건이 여기 없는 이유이고, 대신 실제 문서 이동을 쓴다.
 */
import { expect, test, type Page } from "@playwright/test";
import { makeBonds, mockSnapshot } from "./fixtures/snapshot";

const FIXTURE = makeBonds(1)[0];
const STORAGE_KEY = "bond-screener:theme";

const preference = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

/** 스크리너는 `client:only`라 헤더 자체가 하이드레이션 후에야 생긴다 — 토글을 기다린다. */
async function gotoScreener(page: Page) {
  await mockSnapshot(page, makeBonds(3));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "테마 전환" })).toBeVisible();
}

async function choose(page: Page, label: "시스템" | "라이트" | "다크") {
  await page.getByRole("button", { name: "테마 전환" }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

// 테마는 오직 스크립트로만 입혀져야 한다. 서버가 특정 테마를 구워 내려보내면 캐시된 문서가
// 다른 사용자에게 잘못된 테마로 도달한다. <html>에 lang 말고 class/data-theme이 없어야 한다.
test("서버가 내려주는 문서에는 테마가 박혀 있지 않다", async ({ page }) => {
  const html = await (await page.request.get("/")).text();
  const openingTag = html.match(/<html[^>]*>/)?.[0];

  expect(openingTag).toBeDefined();
  expect(openingTag).not.toMatch(/\bdata-theme=/);
  expect(openingTag).not.toMatch(/\bclass=/);
});

// 번쩍임 방지의 유일한 구조적 대리 단언. "첫 페인트 전에 실행됐다"를 직접 관찰하는 API는
// 없다(page.evaluate로 보이는 시점엔 이미 페인트 후다) — 대신 그것을 보장하는 성질,
// 즉 head 안의 동기 classic 스크립트라는 사실을 고정한다. `is:inline`을 떼면 Astro가
// 별도 파일의 `type="module"`(defer)로 바꾸므로 여기서 바로 깨진다.
test("테마 스크립트는 head에서 동기로 실행된다", async ({ page }) => {
  await page.goto("/");

  expect(
    await page.evaluate(() => {
      const script = document.head.querySelector("script[data-theme-init]");
      if (!(script instanceof HTMLScriptElement)) return null;
      return { parent: script.parentElement?.tagName, type: script.type, defer: script.defer, src: script.src };
    }),
  ).toEqual({ parent: "HEAD", type: "", defer: false, src: "" });
});

test("다크 선택이 리로드를 넘겨 살아남는다", async ({ page }) => {
  await gotoScreener(page);
  await choose(page, "다크");
  await expect.poll(() => isDark(page)).toBe(true);

  await page.reload();

  expect(await preference(page)).toBe("dark");
  expect(await isDark(page)).toBe(true);
});

// MPA라 목록 → 상세는 전체 문서 요청이다 — 인라인 스크립트와 localStorage가 실제로
// 맞물려 도는지는 이 경로에서만 증명된다(상세 아일랜드는 client:load라 SSR도 함께 탄다).
test("다크 선택이 상세 페이지 이동을 넘겨 살아남는다", async ({ page }) => {
  await gotoScreener(page);
  await choose(page, "다크");
  await expect.poll(() => isDark(page)).toBe(true);

  await page.goto(`/bond/${FIXTURE.isinCd}`);

  expect(await preference(page)).toBe("dark");
  expect(await isDark(page)).toBe(true);
});

// 저장되는 값은 해소된 "light"/"dark"가 아니라 고른 값 그대로여야 한다 — 아니면 다음
// 방문에서 "OS를 따른다"는 의사가 사라지고 그때의 OS 설정에 박제된다.
test("시스템 선택은 리터럴 'system'으로 저장돼 리로드를 넘긴다", async ({ page }) => {
  await gotoScreener(page);
  await choose(page, "시스템");
  await expect.poll(() => stored(page)).toBe("system");

  await page.reload();

  expect(await preference(page)).toBe("system");
});
