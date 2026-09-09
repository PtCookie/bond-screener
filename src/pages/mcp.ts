/**
 * 채권 데이터 MCP(Model Context Protocol) 엔드포인트 — Claude(웹·데스크톱·모바일 앱 공통)의
 * 커스텀 커넥터에서 이 URL을 그대로 붙일 수 있다.
 *
 * `pages/api/`가 아니라 루트에 두는 이유: MCP 클라이언트 관행상 `/mcp`가 짧고 표준적인
 * 경로이고, 커넥터 등록 시 사용자가 직접 타이핑하는 URL이라 짧을수록 좋다.
 *
 * stateless Streamable HTTP(`@modelcontextprotocol/server`의 `createMcpHandler`) —
 * Durable Object도 세션도 없다. 툴 정의·D1 조회 로직은 전부 `src/lib/mcp/`에 있다(이
 * 파일은 라우팅 + CORS + rate limit만 담당) — workers vitest 프로젝트가 Astro 라우트
 * 파일 자체를 실행할 수 없어(`vitest.workers.config.ts` 주석 참고) 테스트 가능한 로직을
 * 전부 라우트 밖에 두는 이 저장소의 기존 규약을 그대로 따른다.
 *
 * **인증은 선택이고, 토큰은 rate limit 면제 키다** — 헤더 없이 부르면 `BOND_API_LIMITER`
 * (IP당 분당 30회)가 걸린 채 통과하고, `MCP_AUTH_TOKEN`(공유 시크릿, OAuth 아님)을 보내면
 * 한도가 면제된다. 틀린 토큰은 익명으로 강등하지 않고 401이지만 그때도 한도를 먼저 소비한다
 * (무차별 대입 방어). 정책 판단 전체와 그 근거는 `src/lib/mcp/auth.ts`의 `resolveMcpAccess`에
 * 있고 — 표 형태로 정리돼 있다 — 이 라우트는 그걸 호출만 한다.
 *
 * CORS는 Claude 커넥터(Anthropic 클라우드에서 서버-서버로 호출) 자체에는 불필요하지만,
 * 브라우저 기반 MCP Inspector로 로컬 검증할 때 필요해 얇게 얹는다.
 *
 * `env`는 `Astro.locals.runtime.env`가 아니라 `cloudflare:workers`에서 가져온다 — 설치된
 * `@astrojs/cloudflare`(Astro v6+ 대응)는 전자를 제거하고 접근 시 throw한다(AGENTS.md
 * "데이터 계층" 절 참고).
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createBondMcpServer } from "@/lib/mcp/server";
import { resolveMcpAccess, MCP_TOKEN_HEADER } from "@/lib/mcp/auth";

export const prerender = false;

// 모듈 스코프에서 한 번만 만든다. `createMcpHandler`에 넘긴 팩토리는 요청마다 호출되어
// (stateless 계약 — `src/lib/mcp/server.ts` 참고) 매 요청 독립된 McpServer 인스턴스를
// 만드므로, handler 객체 자체를 여러 요청이 공유해도 요청 간 상태가 섞이지 않는다.
const handler = createMcpHandler(() => createBondMcpServer(env.DB));

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": `content-type, accept, authorization, ${MCP_TOKEN_HEADER}, mcp-protocol-version, mcp-session-id`,
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

// 프리플라이트는 인증 헤더를 싣지 못하므로 게이트 앞에 둔다.
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS_HEADERS });

export const ALL: APIRoute = async ({ request }) => {
  const access = await resolveMcpAccess(request, env.MCP_AUTH_TOKEN, env.BOND_API_LIMITER);
  if (access.kind === "deny") return withCors(access.response);

  // SDK는 `authInfo`를 옵션으로 받아 핸들러에 그대로 흘려보낸다(헤더에서 유도하지 않는다) —
  // 익명 요청은 아예 넘기지 않는다.
  const extra = access.authInfo ? { authInfo: access.authInfo } : undefined;
  return withCors(await handler.fetch(request, extra));
};
