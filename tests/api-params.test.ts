import { describe, expect, test } from "vitest";
import {
  checkRateLimit,
  errorResponse,
  jsonResponse,
  parseBondRef,
  parseDateRange,
  parseMarket,
} from "@/lib/api/params";

describe("parseBondRef", () => {
  test("12자리 영숫자는 ISIN으로 분류된다", () => {
    expect(parseBondRef("KR6000011D36")).toEqual({ kind: "isin", value: "KR6000011D36" });
  });

  test("9자리 영숫자는 단축코드로 분류된다", () => {
    expect(parseBondRef("000001D36")).toEqual({ kind: "srtn", value: "000001D36" });
  });

  test("소문자는 대문자로 정규화된다", () => {
    expect(parseBondRef("kr6000011d36")).toEqual({ kind: "isin", value: "KR6000011D36" });
  });

  test("12/9자리가 아니면 null", () => {
    expect(parseBondRef("SHORT")).toBeNull(); // 5자리
    expect(parseBondRef("ELEVENCHAR1")).toBeNull(); // 11자리
    expect(parseBondRef("WAYTOOLONGFORBOTH")).toBeNull(); // 17자리
  });

  test("undefined는 null", () => {
    expect(parseBondRef(undefined)).toBeNull();
  });

  test("영숫자가 아닌 문자가 섞이면 null", () => {
    expect(parseBondRef("KR6000011D-6")).toBeNull();
  });
});

describe("parseDateRange", () => {
  test("from/to 생략 시 오늘까지 최근 1년 범위를 기본값으로 준다", () => {
    const result = parseDateRange(new URLSearchParams());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.to).toBeGreaterThan(20250101);
    expect(result.value.from).toBeLessThan(result.value.to);
  });

  test("from/to를 지정하면 그대로 반영된다", () => {
    const result = parseDateRange(new URLSearchParams({ from: "20250101", to: "20250630" }));
    expect(result).toEqual({ ok: true, value: { from: 20250101, to: 20250630 } });
  });

  test("8자리가 아닌 from은 오류", () => {
    const result = parseDateRange(new URLSearchParams({ from: "2025-01-01" }));
    expect(result.ok).toBe(false);
  });

  test("from이 to보다 크면 오류", () => {
    const result = parseDateRange(new URLSearchParams({ from: "20260101", to: "20250101" }));
    expect(result.ok).toBe(false);
  });

  test("from만 지정하면 to는 오늘로 채워진다", () => {
    const result = parseDateRange(new URLSearchParams({ from: "20200101" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.from).toBe(20200101);
  });
});

describe("parseMarket", () => {
  test("생략 시 null(필터 없음)", () => {
    expect(parseMarket(new URLSearchParams())).toEqual({ ok: true, value: null });
  });

  test("유효한 시장구분은 정수 코드로 변환된다", () => {
    expect(parseMarket(new URLSearchParams({ market: "KTS" }))).toEqual({ ok: true, value: 1 });
    expect(parseMarket(new URLSearchParams({ market: "일반채권" }))).toEqual({ ok: true, value: 2 });
    expect(parseMarket(new URLSearchParams({ market: "소액채권" }))).toEqual({ ok: true, value: 3 });
  });

  test("유효하지 않은 값은 오류", () => {
    const result = parseMarket(new URLSearchParams({ market: "코스피" }));
    expect(result.ok).toBe(false);
  });
});

describe("jsonResponse", () => {
  test("기본 상태 코드는 200이고 Content-Type이 application/json이다", async () => {
    const res = jsonResponse({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.json()).toEqual({ a: 1 });
  });

  test("status를 지정하면 그대로 반영된다", () => {
    const res = jsonResponse({}, { status: 201 });
    expect(res.status).toBe(201);
  });

  test("cacheControl을 지정하면 헤더가 설정되고, 생략하면 설정되지 않는다", () => {
    const withCache = jsonResponse({}, { cacheControl: "public, max-age=60" });
    expect(withCache.headers.get("cache-control")).toBe("public, max-age=60");

    const withoutCache = jsonResponse({});
    expect(withoutCache.headers.has("cache-control")).toBe(false);
  });
});

describe("errorResponse", () => {
  test("{error: message} 본문과 지정한 status를 담은 JSON 응답을 만든다", async () => {
    const res = errorResponse(404, "찾을 수 없습니다.");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "찾을 수 없습니다." });
  });
});

describe("checkRateLimit", () => {
  function makeRequest(ip: string | null): Request {
    const headers = new Headers();
    if (ip !== null) headers.set("cf-connecting-ip", ip);
    return new Request("https://example.com", { headers });
  }

  test("한도 이내면 null을 반환한다(통과)", async () => {
    const limiter: RateLimit = { limit: async () => ({ success: true }) };
    const result = await checkRateLimit(limiter, makeRequest("1.2.3.4"));
    expect(result).toBeNull();
  });

  test("한도 초과면 429 Response를 반환한다", async () => {
    const limiter: RateLimit = { limit: async () => ({ success: false }) };
    const result = await checkRateLimit(limiter, makeRequest("1.2.3.4"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(await result?.json()).toEqual({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
  });

  test("cf-connecting-ip가 없으면 'unknown' 키로 조회한다(로컬 개발 등)", async () => {
    let seenKey: string | undefined;
    const limiter: RateLimit = {
      limit: async (options) => {
        seenKey = options.key;
        return { success: true };
      },
    };
    await checkRateLimit(limiter, makeRequest(null));
    expect(seenKey).toBe("unknown");
  });
});
