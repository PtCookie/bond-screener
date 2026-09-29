/**
 * `src/hooks/useBookmarks.ts` + `src/lib/bookmark-store.ts`. 순수 조작은
 * `tests/bookmarks.test.ts`가 덮으므로 여기서는 스토어가 더하는 것만 본다:
 * 스토리지 복원, 쓰기 반영, 인스턴스 간 동기화, 다른 탭(storage 이벤트) 반영.
 *
 * `tests/setup-browser.ts`가 매 테스트 후 localStorage와 스토어 캐시를 함께 비운다.
 */
import { describe, expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useBookmarks } from "@/hooks/useBookmarks";
import { BOOKMARKS_STORAGE_KEY, parseBookmarks, serializeBookmarks } from "@/lib/bookmarks";

const ISIN = "KR103501GG62";

describe("useBookmarks", () => {
  test("localStorage에 저장된 목록을 읽는다", async () => {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, serializeBookmarks([{ isinCd: ISIN, name: "국고", addedAt: 1 }]));
    const { result } = await renderHook(() => useBookmarks());
    expect(result.current.bookmarkedIds.has(ISIN)).toBe(true);
    expect(result.current.bookmarks).toHaveLength(1);
  });

  test("toggle이 상태와 localStorage를 함께 갱신하고, 다른 훅 인스턴스도 같은 값을 본다", async () => {
    const a = await renderHook(() => useBookmarks());
    const b = await renderHook(() => useBookmarks());

    await a.act(() => {
      a.result.current.toggle(ISIN, "국고");
    });

    expect(a.result.current.bookmarkedIds.has(ISIN)).toBe(true);
    expect(b.result.current.bookmarkedIds.has(ISIN)).toBe(true);
    expect(parseBookmarks(localStorage.getItem(BOOKMARKS_STORAGE_KEY))).toEqual([
      expect.objectContaining({ isinCd: ISIN, name: "국고" }),
    ]);

    await a.act(() => {
      a.result.current.toggle(ISIN, "국고");
    });
    expect(b.result.current.bookmarks).toEqual([]);
  });

  test("다른 탭의 변경(storage 이벤트)을 반영한다", async () => {
    const { result, act } = await renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual([]);

    await act(() => {
      // 다른 탭이 쓴 것처럼: 스토리지를 직접 고치고 이벤트를 보낸다(같은 탭에선 이벤트가 자동으로 안 뜬다).
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, serializeBookmarks([{ isinCd: ISIN, name: null, addedAt: 1 }]));
      window.dispatchEvent(new StorageEvent("storage", { key: BOOKMARKS_STORAGE_KEY }));
    });

    expect(result.current.bookmarkedIds.has(ISIN)).toBe(true);
  });
});
