/**
 * MCP 툴 3종 정의. 라우트(`src/pages/mcp.ts`)에는 로직을 두지 않는다 — workers vitest
 * 프로젝트가 Astro 라우트 파일 자체를 실행할 수 없어(`vitest.workers.config.ts` 주석
 * 참고) 테스트 가능한 로직은 전부 라우트 밖에 둔다는 이 저장소의 기존 규약을 그대로 따른다.
 *
 * 입력 검증(ISIN/단축코드 분기, 날짜·시장 파라미터)은 `/api/bond/*` 라우트와 같은
 * `src/lib/api/params.ts`의 헬퍼를 그대로 재사용한다 — 그 헬퍼들이 `URLSearchParams`를
 * 받으므로, 여기서는 zod가 파싱한 인자를 `URLSearchParams`로 한 번 감싸 넘긴다. 판정
 * 로직을 두 곳에 새로 만들지 않기 위한 어댑터일 뿐이다.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { parseBondRef, parseDateRange, parseMarket } from "@/lib/api/params";
import { resolveIsinCd, fetchBondDetail } from "@/lib/d1/detail-repo";
import { fetchBondPriceSeries } from "@/lib/d1/price-repo";
import { searchBonds } from "@/lib/d1/search-repo";
import type { BondSearchFilters } from "@/lib/d1/sql";
import { toBondDetailResponse } from "@/lib/bond/detail";
import { priceRowsForLlm, toBondSearchResultRows, toBondSummary } from "./format";

/**
 * HTTP 라우트(`PRICE_SERIES_LIMIT=3000`, `src/pages/api/bond/[id]/prices.ts`)보다 작게 잡는다 —
 * 그쪽은 클라이언트가 차트로 그리지만 여기는 LLM 컨텍스트에 그대로 들어가는 JSON 텍스트라
 * 토큰 예산이 더 빠듯하다. 1000행이면 일별 시세로 약 4년치.
 */
const MCP_PRICE_SERIES_LIMIT = 1000;

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 50;

function toolError(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function toolJson(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

const YMD_DESCRIPTION = "YYYYMMDD 8자리";

export function registerBondTools(server: McpServer, db: D1Database): void {
  server.registerTool(
    "search_bonds",
    {
      title: "채권 검색",
      description:
        "발행인명·종목명·만기·표면이율·신용등급·발행잔액 조건으로 국내 상장채권을 검색한다. " +
        "데이터는 영업일+1일 오후 1시 이후 갱신되며, 신용등급은 KIS(한국신용평가) 기준이다.",
      inputSchema: z.object({
        issuer: z.string().optional().describe("발행인명 부분일치 검색어(예: '한국전력공사')"),
        name: z.string().optional().describe("종목명 부분일치 검색어"),
        maturityFrom: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe(`만기일 하한(${YMD_DESCRIPTION}, 포함)`),
        maturityTo: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe(`만기일 상한(${YMD_DESCRIPTION}, 포함)`),
        couponMin: z.number().optional().describe("표면이율(%) 하한(포함)"),
        couponMax: z.number().optional().describe("표면이율(%) 상한(포함)"),
        grade: z
          .array(z.string())
          .max(20)
          .optional()
          .describe("KIS 신용등급 화이트리스트(예: ['AAA', 'AA+'], 최대 20개)"),
        balanceMin: z.number().optional().describe("발행잔액 하한(원, 포함)"),
        sort: z
          .enum(["exprDt", "bondBal", "coupon"])
          .optional()
          .describe("정렬 기준 — exprDt(만기 임박순, 기본값) / bondBal(잔액 큰 순) / coupon(표면이율 높은 순)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SEARCH_LIMIT_MAX)
          .optional()
          .describe(`최대 반환 건수(기본 ${SEARCH_LIMIT_DEFAULT}, 최대 ${SEARCH_LIMIT_MAX})`),
      }),
    },
    async ({ issuer, name, maturityFrom, maturityTo, couponMin, couponMax, grade, balanceMin, sort, limit }) => {
      const filters: BondSearchFilters = {
        issuer,
        name,
        exprFrom: maturityFrom ? Number(maturityFrom) : undefined,
        exprTo: maturityTo ? Number(maturityTo) : undefined,
        couponMin,
        couponMax,
        grade,
        balMin: balanceMin,
        sort,
        limit: limit ?? SEARCH_LIMIT_DEFAULT,
      };
      const { rows, latestPrices } = await searchBonds(db, filters);
      const results = toBondSearchResultRows(rows, latestPrices);
      return toolJson({ count: results.length, results });
    },
  );

  server.registerTool(
    "get_bond",
    {
      title: "채권 상세 조회",
      description:
        "ISIN 또는 단축코드로 종목 하나의 발행조건·신용등급·최신 시세를 조회한다. " +
        "verbose=true면 신용등급 변경 이력을 포함한 전체 발행조건(75개 필드)을 반환한다.",
      inputSchema: z.object({
        id: z.string().describe("12자리 ISIN 코드 또는 9자리 단축코드(srtnCd)"),
        verbose: z.boolean().optional().describe("true면 신용등급 이력·전체 발행조건을 포함(기본 false: 핵심 필드만)"),
      }),
    },
    async ({ id, verbose }) => {
      const ref = parseBondRef(id);
      if (!ref) return toolError("id는 12자리 ISIN 또는 9자리 단축코드여야 합니다.");

      const isinCd = await resolveIsinCd(db, ref);
      if (!isinCd) return toolError("종목을 찾을 수 없습니다.");

      const source = await fetchBondDetail(db, isinCd);
      if (!source) return toolError("종목을 찾을 수 없습니다.");

      const srtnCd = (source.bond.srtn_cd as string | null) ?? null;
      const detail = toBondDetailResponse(source);
      const payload = verbose ? { isinCd, srtnCd, ...detail } : toBondSummary(isinCd, srtnCd, detail);
      return toolJson(payload);
    },
  );

  server.registerTool(
    "get_bond_prices",
    {
      title: "채권 시세 시계열 조회",
      description: "ISIN 또는 단축코드로 종목 하나의 일별 시세 시계열을 기간·시장구분으로 조회한다.",
      inputSchema: z.object({
        id: z.string().describe("12자리 ISIN 코드 또는 9자리 단축코드(srtnCd)"),
        from: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe(`조회 시작일(${YMD_DESCRIPTION}). 생략 시 to로부터 1년 전`),
        to: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe(`조회 종료일(${YMD_DESCRIPTION}). 생략 시 오늘`),
        market: z.string().optional().describe("시장구분(KTS / 일반채권 / 소액채권). 생략 시 전체"),
      }),
    },
    async ({ id, from, to, market }) => {
      const ref = parseBondRef(id);
      if (!ref) return toolError("id는 12자리 ISIN 또는 9자리 단축코드여야 합니다.");

      const dateParams = new URLSearchParams();
      if (from) dateParams.set("from", from);
      if (to) dateParams.set("to", to);
      const range = parseDateRange(dateParams);
      if (!range.ok) return toolError(range.error);

      const marketParams = new URLSearchParams();
      if (market) marketParams.set("market", market);
      const marketResult = parseMarket(marketParams);
      if (!marketResult.ok) return toolError(marketResult.error);

      const isinCd = await resolveIsinCd(db, ref);
      if (!isinCd) return toolError("종목을 찾을 수 없습니다.");

      const { rows, truncated } = await fetchBondPriceSeries(db, isinCd, {
        from: range.value.from,
        to: range.value.to,
        marketCode: marketResult.value,
        limit: MCP_PRICE_SERIES_LIMIT,
      });

      return toolJson({
        isinCd,
        from: range.value.from,
        to: range.value.to,
        truncated,
        prices: priceRowsForLlm(rows),
      });
    },
  );
}
