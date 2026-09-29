/**
 * 북마크 스토어 — localStorage를 정본으로 두고 `useSyncExternalStore`가 구독할 수 있게 감싼다.
 * `theme.ts`와 같은 이유로 Context/Provider를 두지 않는다: 두 아일랜드(BondScreener·
 * BondDetail)와 표의 셀 하나하나가 prop 전달 없이 같은 값을 읽어야 한다.
 *
 * 스냅샷은 **캐시한 참조**를 돌려준다 — `useSyncExternalStore`는 getSnapshot이 매번 새
 * 객체를 내면 무한 리렌더에 빠진다. 캐시는 이 모듈의 쓰기, 다른 탭의 `storage` 이벤트,
 * bfcache 복원(`pageshow`)에서만 무효화된다.
 */
import { BOOKMARKS_STORAGE_KEY, parseBookmarks, serializeBookmarks, toggleBookmark, type Bookmark } from "./bookmarks";

export interface BookmarkSnapshot {
  /** 최신순. */
  list: readonly Bookmark[];
  ids: ReadonlySet<string>;
}

function toSnapshot(list: Bookmark[]): BookmarkSnapshot {
  return { list, ids: new Set(list.map((b) => b.isinCd)) };
}

/** 서버 렌더·하이드레이션 첫 렌더용. 서버에는 스토리지가 없으므로 항상 비어 있다. */
export const EMPTY_BOOKMARK_SNAPSHOT: BookmarkSnapshot = toSnapshot([]);

let cache: BookmarkSnapshot | null = null;
const listeners = new Set<() => void>();

function readStorage(): string | null {
  try {
    return localStorage.getItem(BOOKMARKS_STORAGE_KEY);
  } catch {
    // 프라이빗 모드/저장소 차단 — 빈 목록으로 동작한다.
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, value);
  } catch {
    // 위와 같은 이유(+용량 초과)로 무시. 저장에 실패해도 이 페이지의 캐시는 살아 있다.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getBookmarkSnapshot(): BookmarkSnapshot {
  cache ??= toSnapshot(parseBookmarks(readStorage()));
  return cache;
}

function handleStorage(event: StorageEvent): void {
  // key === null은 다른 탭의 localStorage.clear().
  if (event.key !== BOOKMARKS_STORAGE_KEY && event.key !== null) return;
  cache = null;
  emit();
}

/**
 * bfcache 복원 대비. 목록 → 상세(별 해제) → 뒤로가기에서 목록 페이지가 JS 힙째로 되살아나면
 * 캐시는 떠나기 전 값 그대로인데, 그 사이의 쓰기는 같은 탭이라 `storage` 이벤트로도
 * 오지 않는다(동결된 문서는 이벤트를 받지 못한다) — 복원 시점에 스토리지를 다시 읽는다.
 */
function handlePageShow(event: PageTransitionEvent): void {
  if (!event.persisted) return;
  cache = null;
  emit();
}

export function subscribeBookmarks(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pageshow", handlePageShow);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pageshow", handlePageShow);
    }
  };
}

/** 모든 쓰기의 단일 진입점 — 나중에 import가 목록을 통째로 교체할 때도 이것을 쓴다. */
export function replaceBookmarks(next: Bookmark[]): void {
  writeStorage(serializeBookmarks(next));
  cache = toSnapshot(next);
  emit();
}

export function toggleBookmarkInStore(isinCd: string, name: string | null): void {
  // 다른 탭이 방금 쓴 값을 덮어쓰지 않도록 캐시가 아니라 스토리지에서 다시 읽고 고친다.
  replaceBookmarks(toggleBookmark(parseBookmarks(readStorage()), isinCd, name));
}

/** 테스트 전용 — `localStorage.clear()`만으로는 모듈 캐시가 남는다(`tests/setup-browser.ts`). */
export function resetBookmarkStoreForTests(): void {
  cache = null;
  emit();
}
