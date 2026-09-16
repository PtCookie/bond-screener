// vitest.browser.config.ts의 setupFiles. `vitest-browser-react`(메인 엔트리, `/pure`가 아님)는
// 자동 cleanup을 제공하므로 여기서 별도 afterEach(cleanup)이 필요 없다.
import { afterEach } from "vitest";
import "@/styles/global.css";

// useScreenerViewState(src/hooks/useScreenerViewState.ts)가 window.history.replaceState로
// 테스트 iframe의 URL을 실제로 바꾸고 sessionStorage에 쓴다. useFilterPresets는 같은
// 이유로 localStorage에 쓴다(이쪽은 세션이 끝나도 남는다). 복원하지 않으면 훅 테스트끼리
// 서로의 URL/스토리지를 오염시킨다.
const initialUrl = window.location.href;

afterEach(() => {
  window.history.replaceState(null, "", initialUrl);
  // ThemeToggle(src/lib/theme.ts)은 <html>에 직접 쓴다. 되돌리지 않으면 .dark가 같은
  // 브라우저의 뒤 테스트로 새어 라이트 테마로 찍어 둔 스크린샷 베이스라인이 통째로 깨진다.
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    // 일부 브라우저 설정(프라이빗 모드 등)에서 스토리지 접근이 막힐 수 있다 — 실제 앱
    // 코드(useScreenerViewState/useFilterPresets)도 같은 이유로 이 접근을 try/catch로 감싼다.
  }
});
