import { useSyncExternalStore } from "react";
import {
  EMPTY_BOOKMARK_SNAPSHOT,
  getBookmarkSnapshot,
  subscribeBookmarks,
  toggleBookmarkInStore,
  type BookmarkSnapshot,
} from "@/lib/bookmark-store";

export interface UseBookmarksResult {
  /** 최신순. */
  bookmarks: BookmarkSnapshot["list"];
  bookmarkedIds: ReadonlySet<string>;
  toggle: (isinCd: string, name: string | null) => void;
}

/**
 * 북마크 목록 구독. 서버 스냅샷은 빈 목록이다 — `BondDetail`은 `client:load`라 SSR되는데,
 * 서버 HTML에 없는 별 상태로 하이드레이션을 시작하면 mismatch가 난다. React가 하이드레이션
 * 동안 서버 스냅샷으로 렌더한 뒤 클라이언트 스냅샷으로 한 번 더 렌더해 준다.
 */
export function useBookmarks(): UseBookmarksResult {
  const snapshot = useSyncExternalStore(subscribeBookmarks, getBookmarkSnapshot, () => EMPTY_BOOKMARK_SNAPSHOT);
  return { bookmarks: snapshot.list, bookmarkedIds: snapshot.ids, toggle: toggleBookmarkInStore };
}
