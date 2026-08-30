/**
 * `/api/bond/*` 라우트가 공유하는 입력 검증·응답 헬퍼. 파라미터화 쿼리라 SQL 인젝션
 * 위험은 없지만, 형식이 틀린 값으로 D1을 때리지 않기 위한 게이트다.
 */
import { BOND_MARKET_CATEGORIES, type BondMarketCategory } from "@/api";
import { marketCategoryToCode } from "@/lib/bond/market";
import { epochDayToYmd, ymdToEpochDay } from "@/lib/snapshot/format";
import type { BondRef } from "@/lib/d1/detail-repo";

const ISIN_RE = /^[A-Za-z0-9]{12}$/;
const SRTN_RE = /^[A-Za-z0-9]{9}$/;

/** URL 경로 세그먼트를 ISIN(12자리)/단축코드(9자리)로 분기한다. 둘 다 아니면 `null`(400 처리는 호출부 몫). */
export function parseBondRef(id: string | undefined): BondRef | null {
  if (!id) return null;
  if (ISIN_RE.test(id)) return { kind: "isin", value: id.toUpperCase() };
  if (SRTN_RE.test(id)) return { kind: "srtn", value: id.toUpperCase() };
  return null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const YMD_RE = /^\d{8}$/;
const DEFAULT_RANGE_DAYS = 365;

export interface DateRange {
  from: number;
  to: number;
}

function todayYmd(): number {
  const now = new Date();
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/**
 * `from`/`to` 쿼리 파라미터를 검증한다(YYYYMMDD 8자리). 생략 시 `to`는 오늘,
 * `from`은 `to`에서 1년 전이다. `epochDayToYmd`/`ymdToEpochDay`(`snapshot/format.ts`)를
 * 재사용한다 — YYYYMMDD ↔ 날짜 연산에 `Date`를 직접 쓰면 타임존 경계에서 하루가
 * 밀릴 수 있어 이미 검증된 로직을 두 곳에서 중복 구현하지 않는다.
 */
export function parseDateRange(searchParams: URLSearchParams): ParseResult<DateRange> {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (fromParam !== null && !YMD_RE.test(fromParam)) return { ok: false, error: "from은 YYYYMMDD 8자리여야 합니다." };
  if (toParam !== null && !YMD_RE.test(toParam)) return { ok: false, error: "to는 YYYYMMDD 8자리여야 합니다." };

  const to = toParam ? Number(toParam) : todayYmd();
  // `to`는 항상 number라 두 함수 모두 null을 반환할 수 없다(`null` 분기는 nullable YYYYMMDD
  // 필드를 다루는 snapshot 쪽 용도) — 그 사실을 타입으로 좁혀 준다.
  const toEpochDay = ymdToEpochDay(to) as number;
  const from = fromParam ? Number(fromParam) : (epochDayToYmd(toEpochDay - DEFAULT_RANGE_DAYS) as number);

  if (from > to) return { ok: false, error: "from은 to보다 클 수 없습니다." };
  return { ok: true, value: { from, to } };
}

/** `market` 쿼리 파라미터를 D1 `mrkt_ctg` 정수 코드로 변환한다. 생략 시 `null`(필터 없음). */
export function parseMarket(searchParams: URLSearchParams): ParseResult<number | null> {
  const raw = searchParams.get("market");
  if (raw === null) return { ok: true, value: null };
  if (!(BOND_MARKET_CATEGORIES as readonly string[]).includes(raw)) {
    return { ok: false, error: `market은 ${BOND_MARKET_CATEGORIES.join("/")} 중 하나여야 합니다.` };
  }
  return { ok: true, value: marketCategoryToCode(raw as BondMarketCategory) };
}

/** 두 라우트가 공유하는 캐시 정책 — 데이터가 하루 1회(영업일+1일 13시 이후) 갱신되므로 짧게 잡을 이유가 없다. */
export const DETAIL_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

export function jsonResponse(data: unknown, init?: { status?: number; cacheControl?: string }): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (init?.cacheControl) headers.set("cache-control", init.cacheControl);
  return new Response(JSON.stringify(data), { status: init?.status ?? 200, headers });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

/**
 * D1을 직접 때리는 라우트를 IP당 요청 수로 보호한다. 한도 초과 시 호출부가 그대로
 * 반환할 429 Response를, 통과 시 `null`을 돌려준다. `cf-connecting-ip`가 없는 경우
 * (로컬 개발 등) 모든 요청이 같은 키를 공유해 서로의 한도에 영향을 주지만, 프로덕션
 * Workers 런타임에서는 Cloudflare가 항상 이 헤더를 채운다.
 */
export async function checkRateLimit(limiter: RateLimit, request: Request): Promise<Response | null> {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key });
  if (success) return null;
  return errorResponse(429, "요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
}
