/**
 * 종목 북마크의 localStorage 저장 포맷과 순수 조작 함수. 스토리지·React와 무관하다 —
 * 실제 보관과 구독은 `bookmark-store.ts`가 한다.
 *
 * 이 파일의 `sanitizeBookmarks`/`serializeBookmarks`는 나중에 붙일 북마크·필터 프리셋
 * export/import가 그대로 재사용할 공개 API다(`presets.ts`의 `sanitizePresets`와 짝).
 * 그래서 스토리지 문자열을 받는 `parseBookmarks`와, 이미 파싱된 임의 값을 받는
 * `sanitizeBookmarks`를 나눠 둔다 — 가져오기 파일은 봉투 모양이 다를 수 있다.
 *
 * `@/` alias를 쓰지 않는다(의존성 없음) — Node에서 바로 실행하는 스크립트가 가져다 쓸 여지를 남긴다.
 */

/** `bond-screener:<name>` — 다른 스토리지 키와 같은 접두사 규약. */
export const BOOKMARKS_STORAGE_KEY = "bond-screener:bookmarks";

/** 프리셋과 같은 이유로 버전 봉투를 둔다. 모르는 version은 조용히 빈 목록으로 폴백한다. */
const FORMAT_VERSION = 1;

export const MAX_BOOKMARKS = 500;

const ISIN_PATTERN = /^[A-Z0-9]{12}$/;

export interface Bookmark {
  isinCd: string;
  /**
   * 추가 시점의 종목명. 화면은 쓰지 않는다(목록·상세 모두 최신 이름을 따로 가지고 있다) —
   * export 파일을 사람이 읽을 수 있게 하려고 싣는다.
   */
  name: string | null;
  addedAt: number;
}

function isBookmark(value: unknown): value is Bookmark {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.isinCd === "string" &&
    ISIN_PATTERN.test(o.isinCd) &&
    (o.name === null || typeof o.name === "string") &&
    typeof o.addedAt === "number" &&
    Number.isFinite(o.addedAt)
  );
}

/**
 * 임의 값에서 유효한 북마크만 추린다. 배열이 아니면 빈 목록, 깨진 항목은 그 항목만 버리고,
 * 같은 isinCd가 여러 번 나오면 **먼저 나온 것**(= 최신)을 남긴다. 알 수 없는 필드는 떨군다.
 */
export function sanitizeBookmarks(value: unknown): Bookmark[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: Bookmark[] = [];
  for (const item of value) {
    if (!isBookmark(item) || seen.has(item.isinCd)) continue;
    seen.add(item.isinCd);
    result.push({ isinCd: item.isinCd, name: item.name, addedAt: item.addedAt });
    if (result.length >= MAX_BOOKMARKS) break;
  }
  return result;
}

/** 스토리지 문자열 → 목록. 파싱 실패·모양 불일치는 throw 없이 빈 목록으로 폴백한다. */
export function parseBookmarks(raw: string | null): Bookmark[] {
  if (raw === null || raw === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== FORMAT_VERSION) return [];
  return sanitizeBookmarks(envelope.bookmarks);
}

export function serializeBookmarks(bookmarks: Bookmark[]): string {
  return JSON.stringify({ version: FORMAT_VERSION, bookmarks });
}

/** 맨 앞(최신)에 추가한다. 이미 있으면 목록을 그대로(동일 참조로) 돌려준다. */
export function addBookmark(bookmarks: Bookmark[], isinCd: string, name: string | null): Bookmark[] {
  if (bookmarks.some((b) => b.isinCd === isinCd)) return bookmarks;
  return [{ isinCd, name, addedAt: Date.now() }, ...bookmarks].slice(0, MAX_BOOKMARKS);
}

export function removeBookmark(bookmarks: Bookmark[], isinCd: string): Bookmark[] {
  return bookmarks.filter((b) => b.isinCd !== isinCd);
}

export function toggleBookmark(bookmarks: Bookmark[], isinCd: string, name: string | null): Bookmark[] {
  return bookmarks.some((b) => b.isinCd === isinCd)
    ? removeBookmark(bookmarks, isinCd)
    : addBookmark(bookmarks, isinCd, name);
}
