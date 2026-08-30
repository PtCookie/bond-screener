/**
 * 종목 상세 조회. `id`는 12자리 ISIN 또는 9자리 단축코드 — `parseBondRef`가 분기하고
 * `idx_bond_srtn_cd`(partial UNIQUE, `migrations/0002_indexes.sql`)가 후자를 커버한다.
 *
 * 로직은 `src/lib/d1/detail-repo.ts`(D1 조회)와 `src/lib/bond/detail.ts`(응답 변환)에
 * 있다 — 이 파일은 파싱 → 조회 → 변환 → 응답만 한다. workers vitest 프로젝트는
 * `wrangler.jsonc`의 `main`을 참조하지 않아(Astro virtual module 해석 불가,
 * `vitest.workers.config.ts` 주석 참고) 라우트 파일 자체는 테스트할 수 없으므로,
 * 테스트 가능한 로직은 전부 이 파일 밖에 둔다.
 *
 * `env`는 `Astro.locals.runtime.env`가 아니라 `cloudflare:workers`에서 가져온다
 * (`src/pages/api/snapshot/[...path].ts`와 동일한 규약 — AGENTS.md "Cloudflare 배포" 절 참고).
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fetchBondDetail, resolveIsinCd } from "@/lib/d1/detail-repo";
import { toBondDetailResponse, type BondDetailApiResponse } from "@/lib/bond/detail";
import { checkRateLimit, DETAIL_CACHE_CONTROL, errorResponse, jsonResponse, parseBondRef } from "@/lib/api/params";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const limited = await checkRateLimit(env.BOND_API_LIMITER, request);
  if (limited) return limited;

  const ref = parseBondRef(params.id);
  if (!ref) return errorResponse(400, "id는 12자리 ISIN 또는 9자리 단축코드여야 합니다.");

  const isinCd = await resolveIsinCd(env.DB, ref);
  if (!isinCd) return errorResponse(404, "종목을 찾을 수 없습니다.");

  const source = await fetchBondDetail(env.DB, isinCd);
  if (!source) return errorResponse(404, "종목을 찾을 수 없습니다.");

  const detail = toBondDetailResponse(source);
  const payload: BondDetailApiResponse = {
    isinCd,
    srtnCd: (source.bond.srtn_cd as string | null) ?? null,
    ...detail,
  };
  return jsonResponse(payload, { cacheControl: DETAIL_CACHE_CONTROL });
};
