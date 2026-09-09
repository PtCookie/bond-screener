/**
 * `/mcp` 공유 시크릿 게이트(`src/lib/mcp/auth.ts`) 테스트. workers 프로젝트에 두는 이유는
 * 상수시간 비교에 쓰는 `crypto.subtle.timingSafeEqual`이 workerd 전용 API라서다. 시크릿은
 * 바인딩이 아니라 함수 인자로 넘기므로 miniflare 설정은 건드리지 않는다.
 *
 * 라우트(`src/pages/mcp.ts`) 자체는 이 프로젝트에서 실행할 수 없어(`vitest.workers.config.ts`
 * 주석 참고) 게이트 함수만 직접 호출한다 — `tests/workers/mcp-server.test.ts`와 같은 방식이다.
 */
import { describe, expect, test } from "vitest";
import { authorizeMcpRequest, MCP_TOKEN_HEADER } from "@/lib/mcp/auth";

const SECRET = "s3cr3t-token-value";

function mcpRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://bond-screener.ptcookie.net/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("authorizeMcpRequest", () => {
  test("시크릿이 설정되지 않으면 503으로 막는다(fail-closed)", async () => {
    for (const secret of [undefined, ""]) {
      const result = await authorizeMcpRequest(mcpRequest({ authorization: `Bearer ${SECRET}` }), secret);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(503);
    }
  });

  test("Authorization 헤더가 없으면 401 + WWW-Authenticate 챌린지를 낸다", async () => {
    const result = await authorizeMcpRequest(mcpRequest(), SECRET);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  test("토큰이 틀리면 길이와 무관하게 401이다", async () => {
    for (const wrong of ["s3cr3t-token-valuX", "nope"]) {
      const result = await authorizeMcpRequest(mcpRequest({ authorization: `Bearer ${wrong}` }), SECRET);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
    }
  });

  test("Bearer 접두사가 없으면 401이다", async () => {
    const result = await authorizeMcpRequest(mcpRequest({ authorization: SECRET }), SECRET);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  test("올바른 Bearer 토큰은 AuthInfo를 반환한다", async () => {
    const result = await authorizeMcpRequest(mcpRequest({ authorization: `Bearer ${SECRET}` }), SECRET);

    expect(result).not.toBeInstanceOf(Response);
    const authInfo = result as Exclude<typeof result, Response>;
    expect(authInfo.token).toBe(SECRET);
    // SDK가 만료 없는 토큰을 거부하므로 게이트가 합성 만료를 넣는다.
    expect(authInfo.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  test("대체 헤더(x-mcp-token)의 원문 토큰도 받는다", async () => {
    const result = await authorizeMcpRequest(mcpRequest({ [MCP_TOKEN_HEADER]: SECRET }), SECRET);

    expect(result).not.toBeInstanceOf(Response);
  });

  test("Authorization이 있으면 대체 헤더는 보지 않는다", async () => {
    const result = await authorizeMcpRequest(
      mcpRequest({ authorization: "Bearer wrong-token-value", [MCP_TOKEN_HEADER]: SECRET }),
      SECRET,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});
