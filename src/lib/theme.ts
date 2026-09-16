/**
 * 테마 스토어. **DOM이 곧 스토어다** — `<html data-theme>`가 사용자가 고른 *선호값*
 * (`system`/`light`/`dark`)을, `<html class="dark">`가 그것을 해소한 *실제 값*을 담는다.
 * CSS는 후자만 보고, React는 `src/hooks/useTheme.ts`가 `useSyncExternalStore`로 감싸 읽는다.
 *
 * 별도의 Context/Provider를 두지 않는 이유: 이 앱은 아일랜드가 둘(BondScreener·BondDetail)로
 * 갈라져 React 트리를 공유하지 않는다. 각자 Provider를 두면 서로 다른 값을 들고 어긋날 수
 * 있지만, DOM은 한 벌뿐이라 구조적으로 어긋날 수 없다.
 *
 * `Layout.astro`의 인라인 헤드 스크립트가 아래 `applyTheme`의 해소식을 **의도적으로 중복**
 * 구현한다 — 그 스크립트는 첫 페인트 전에 돌아야 해서 `is:inline`이어야 하고, 그러려면
 * import가 없는 순수 JS여야 하므로 이 모듈을 가져다 쓸 방법이 없다. 한쪽을 고치면 반드시
 * 다른 쪽도 고칠 것.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** `bond-screener:<name>` — useScreenerViewState/useFilterPresets와 같은 접두사 규약. */
export const THEME_STORAGE_KEY = "bond-screener:theme";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** global.css의 `--background` 값과 손으로 맞춰 둔다(모바일 주소창 색). */
const THEME_COLOR = { light: "oklch(1 0 0)", dark: "oklch(0.148 0.004 228.8)" };

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/** 저장된 선호값. 서버(SSR)에서는 알 수 없으므로 "system". */
export function readTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const stored = document.documentElement.dataset.theme;
  return isTheme(stored) ? stored : "system";
}

/**
 * 해소된 값. 선호값(`readTheme`)과 구분해서 쓸 것 — "system"인 채로 OS가 다크로 뒤집히면
 * `data-theme`은 "system" 그대로라 선호값 스냅샷이 변하지 않아 React가 리렌더하지 않는다.
 * 실제 색이 바뀌는 것에 반응해야 하는 쪽(PriceChart)은 반드시 이쪽을 봐야 한다.
 */
export function readResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function syncThemeColorMeta(isDark: boolean): void {
  document.getElementById("theme-color-meta")?.setAttribute("content", isDark ? THEME_COLOR.dark : THEME_COLOR.light);
}

/** 선호값을 DOM에 반영한다(저장은 하지 않는다). */
export function applyTheme(theme: Theme): void {
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia(DARK_MEDIA_QUERY).matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", isDark);
  syncThemeColorMeta(isDark);
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 프라이빗 모드/저장소 차단 — 이번 페이지에는 적용되고 리로드 후에만 사라진다.
  }
}

// 이 모듈이 직접 일으키지 않은 변화에도 구독자가 반응해야 한다: ① "system"인 동안 OS 설정이
// 바뀌는 경우, ② 다른 탭에서 선호값을 바꾼 경우. 두 리스너는 모든 구독자가 공유하고
// 마지막 구독자가 떠날 때 정리한다.
let listenerCount = 0;
let media: MediaQueryList | undefined;

function handleMediaChange(): void {
  if (readTheme() === "system") applyTheme("system");
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== THEME_STORAGE_KEY) return;
  applyTheme(isTheme(event.newValue) ? event.newValue : "system");
}

export function subscribeTheme(listener: () => void): () => void {
  if (listenerCount === 0) {
    media = window.matchMedia(DARK_MEDIA_QUERY);
    media.addEventListener("change", handleMediaChange);
    window.addEventListener("storage", handleStorage);
  }
  listenerCount += 1;

  // `class`도 함께 관찰하는 것이 핵심이다 — readResolvedTheme이 보는 것이 그 클래스라,
  // data-theme만 걸면 "system 유지 + OS 전환" 경로에서 아무도 통지받지 못한다.
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

  return () => {
    observer.disconnect();
    listenerCount -= 1;
    if (listenerCount === 0 && media) {
      media.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorage);
      media = undefined;
    }
  };
}
