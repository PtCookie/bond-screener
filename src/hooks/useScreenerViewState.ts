import { useCallback, useEffect, useRef, useState } from "react";
import { functionalUpdate, type PaginationState, type SortingState, type Updater } from "@tanstack/react-table";
import { EMPTY_FILTERS, type ScreenerFilters } from "@/lib/screener/filters";
import {
  DEFAULT_VIEW_STATE,
  decodeViewState,
  encodeViewState,
  type ScreenerViewState,
} from "@/lib/screener/view-state";

const SESSION_STORAGE_KEY = "bond-screener:view-state";

function readSessionStorage(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    // 프라이빗 모드/저장소 차단 — 폴백 없이 조용히 무시.
    return null;
  }
}

function writeSessionStorage(query: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, query);
  } catch {
    // 위와 동일한 이유로 무시 — URL이 정본이라 여기서 실패해도 뷰 상태 자체는 살아있다.
  }
}

export interface UseScreenerViewStateResult {
  state: ScreenerViewState;
  setFilters: (updater: ScreenerFilters | ((prev: ScreenerFilters) => ScreenerFilters)) => void;
  setSorting: (updater: Updater<SortingState>) => void;
  setPagination: (updater: Updater<PaginationState>) => void;
  resetFilters: () => void;
}

/**
 * 필터·정렬·페이지 상태를 URL 쿼리(정본) + sessionStorage(쿼리 없는 진입 시 폴백)에
 * 동기화하는 훅. Astro MPA에서 상세 페이지를 오가며 전체 리로드가 일어나도 뷰 상태가
 * 살아남게 한다.
 *
 * 초기 `useState`는 항상 `DEFAULT_VIEW_STATE`로 시작하고, 실제 복원은 마운트
 * `useEffect`에서 한다. `useState(() => decodeViewState(location.search))`처럼 첫
 * 렌더부터 복원하면 안 된다 — 이 화면은 `client:load`라 서버에서도 렌더되는데, 서버
 * HTML은 `location`이 없어 항상 기본 상태이다. 하이드레이션 첫 렌더가 URL 상태로
 * 시작하면 서버/클라이언트 마크업이 어긋나 hydration mismatch가 난다. 이 시점엔 아직
 * 스냅샷 fetch 전(스켈레톤)이라 한 틱 뒤에 복원해도 화면 깜빡임은 없다.
 */
export function useScreenerViewState(): UseScreenerViewStateResult {
  const [state, setState] = useState<ScreenerViewState>(DEFAULT_VIEW_STATE);
  const restoredRef = useRef(false);

  const sync = useCallback((next: ScreenerViewState) => {
    const query = encodeViewState(next);
    const url = query === "" ? window.location.pathname : `${window.location.pathname}?${query}`;
    // pushState가 아니라 replaceState — 필터 입력 하나하나가 히스토리 항목으로 쌓이면
    // 뒤로가기가 무력화된다. 뒤로가기는 상세 페이지로 진입하기 직전 URL로 돌아가는
    // 것만으로 충분하다.
    window.history.replaceState(window.history.state, "", url);
    writeSessionStorage(query);
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const search = window.location.search.replace(/^\?/, "");
    // URL에 쿼리가 있으면 URL이 정본이라 그대로 쓰고, 없으면 sessionStorage 폴백을 쓴다.
    // sessionStorage에서 복원한 경우 URL이 여전히 빈 상태로 남으므로, sync로 주소창에도
    // 반영해야 한다 — 그렇지 않으면 이 상태에서 URL을 복사/공유해도 재현되지 않는다.
    const fromUrl = search !== "";
    const restored = fromUrl ? search : (readSessionStorage() ?? "");
    if (restored === "") return;
    const next = decodeViewState(restored);
    setState(next);
    if (!fromUrl) sync(next);
  }, [sync]);

  const updateState = useCallback(
    (updater: (prev: ScreenerViewState) => ScreenerViewState) => {
      setState((prev) => {
        const next = updater(prev);
        sync(next);
        return next;
      });
    },
    [sync],
  );

  const setFilters = useCallback(
    (updater: ScreenerFilters | ((prev: ScreenerFilters) => ScreenerFilters)) => {
      updateState((prev) => {
        const filters = typeof updater === "function" ? updater(prev.filters) : updater;
        // 필터가 바뀌면 이전 페이지 번호가 새 결과 범위를 벗어날 수 있어 1페이지로 되돌린다.
        return { ...prev, filters, pageIndex: 0 };
      });
    },
    [updateState],
  );

  const setSorting = useCallback(
    (updater: Updater<SortingState>) => {
      updateState((prev) => ({ ...prev, sorting: functionalUpdate(updater, prev.sorting) }));
    },
    [updateState],
  );

  const setPagination = useCallback(
    (updater: Updater<PaginationState>) => {
      updateState((prev) => {
        const pagination = functionalUpdate(updater, { pageIndex: prev.pageIndex, pageSize: prev.pageSize });
        return { ...prev, pageIndex: pagination.pageIndex, pageSize: pagination.pageSize };
      });
    },
    [updateState],
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, [setFilters]);

  return { state, setFilters, setSorting, setPagination, resetFilters };
}
