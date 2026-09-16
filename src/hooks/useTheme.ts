import { useSyncExternalStore } from "react";
import {
  readResolvedTheme,
  readTheme,
  setTheme as setThemeStore,
  subscribeTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

export type { ResolvedTheme, Theme };

/**
 * 사용자가 고른 *선호값*과 그것을 바꾸는 함수. 토글 UI처럼 "무엇을 골랐는지"를 보여주는
 * 쪽이 쓴다.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  return { theme, setTheme: setThemeStore };
}

/**
 * 실제로 적용된 값(`light`/`dark`). "system"을 고른 채 OS 설정이 바뀌면 선호값은 그대로라
 * `useTheme`은 리렌더를 일으키지 않는다 — 색이 바뀌는 것 자체에 반응해야 하는 쪽
 * (`PriceChart`처럼 CSS 변수를 JS로 읽는 컴포넌트)은 이 훅을 써야 한다.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, readResolvedTheme, () => "light" as ResolvedTheme);
}
