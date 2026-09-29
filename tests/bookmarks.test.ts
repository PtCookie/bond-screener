import { describe, expect, test } from "vitest";
import {
  MAX_BOOKMARKS,
  addBookmark,
  parseBookmarks,
  removeBookmark,
  sanitizeBookmarks,
  serializeBookmarks,
  toggleBookmark,
  type Bookmark,
} from "@/lib/bookmarks";

const A: Bookmark = { isinCd: "KR103501GG62", name: "국고채권", addedAt: 2 };
const B: Bookmark = { isinCd: "KR6011171G49", name: null, addedAt: 1 };

describe("parse/serialize", () => {
  test("라운드트립된다", () => {
    expect(parseBookmarks(serializeBookmarks([A, B]))).toEqual([A, B]);
  });

  test.each([null, "", "{망가진", "[]", "null", JSON.stringify({ version: 2, bookmarks: [A] })])(
    "깨졌거나 모르는 봉투(%s)는 빈 목록으로 폴백한다",
    (raw) => {
      expect(parseBookmarks(raw)).toEqual([]);
    },
  );
});

describe("sanitizeBookmarks", () => {
  test("배열이 아니면 빈 목록", () => {
    expect(sanitizeBookmarks({ bookmarks: [A] })).toEqual([]);
  });

  test("깨진 항목만 버리고 나머지는 살린다", () => {
    const input = [A, { isinCd: "short", name: null, addedAt: 1 }, { isinCd: "KR6011171G49" }, "x", null, B];
    expect(sanitizeBookmarks(input)).toEqual([A, B]);
  });

  test("같은 isinCd는 먼저 나온 것(최신)만 남긴다", () => {
    expect(sanitizeBookmarks([A, { ...A, name: "옛 이름", addedAt: 0 }])).toEqual([A]);
  });

  test("알 수 없는 필드는 떨군다", () => {
    expect(sanitizeBookmarks([{ ...A, extra: 1 }])).toEqual([A]);
  });

  test(`최대 ${MAX_BOOKMARKS}개로 자른다`, () => {
    const many = Array.from({ length: MAX_BOOKMARKS + 5 }, (_, i) => ({
      isinCd: `KR${String(i).padStart(10, "0")}`,
      name: null,
      addedAt: i,
    }));
    expect(sanitizeBookmarks(many)).toHaveLength(MAX_BOOKMARKS);
  });
});

describe("조작", () => {
  test("addBookmark는 맨 앞에 추가하고, 이미 있으면 동일 참조를 돌려준다", () => {
    const list = [B];
    const next = addBookmark(list, A.isinCd, A.name);
    expect(next.map((b) => b.isinCd)).toEqual([A.isinCd, B.isinCd]);
    expect(addBookmark(next, A.isinCd, "다른 이름")).toBe(next);
  });

  test("removeBookmark", () => {
    expect(removeBookmark([A, B], A.isinCd)).toEqual([B]);
  });

  test("toggleBookmark는 추가와 제거를 오간다", () => {
    const added = toggleBookmark([], A.isinCd, A.name);
    expect(added.map((b) => b.isinCd)).toEqual([A.isinCd]);
    expect(toggleBookmark(added, A.isinCd, A.name)).toEqual([]);
  });
});
