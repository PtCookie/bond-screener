import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** SSR/최초 마운트 전 스냅샷. `client:only="react"`라 실제로 쓰이진 않지만 훅 자체를 SSR-safe하게 유지한다. */
function getServerSnapshot(): boolean {
  return false;
}

/** md 브레이크포인트(768px) 미만 여부를 실시간으로 추적한다. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
