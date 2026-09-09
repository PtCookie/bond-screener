/**
 * `/mcp` 접근 정책 게이트(`src/lib/mcp/auth.ts`의 `resolveMcpAccess`) 테스트. workers
 * 프로젝트에 두는 이유는 게이트가 실제로 도는 런타임이 workerd이기 때문이다(토큰 비교가
 * `crypto.subtle.digest`를 타므로 Node에서도 돌긴 한다 — 굳이 옮길 이유가 없어 여기 둔다).
 * 시크릿과 리미터를 모두 함수 인자로 받으므로 miniflare 설정·바인딩은 건드리지 않는다.
 *
 * **리미터를 주입하는 것이 429 경로를 검증할 유일한 방법이다** — 로컬(Miniflare)에는 Workers
 * Rate Limiting 시뮬레이터가 아예 없어 실제 바인딩은 무엇을 해도 제한하지 않는다(AGENTS.md
 * 실측 기록). 가짜 리미터의 호출 횟수를 세서 "인증되면 한도를 면제한다"는 핵심 불변식도
 * 직접 확인한다.
 *
 * 라우트(`src/pages/mcp.ts`) 자체는 이 프로젝트에서 실행할 수 없어(`vitest.workers.config.ts`
 * 주석 참고) 게이트 함수만 직접 호출한다 — `tests/workers/mcp-server.test.ts`와 같은 방식이다.
 */
import { describe, expect, test } from "vitest";
import { resolveMcpAccess, MCP_TOKEN_HEADER, type McpAccess } from "@/lib/mcp/auth";

const SECRET = "s3cr3t-token-value";

function mcpRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://bond-screener.ptcookie.net/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

/** 호출 횟수를 세는 가짜 리미터. `success: false`면 항상 한도 초과로 답한다. */
function spyLimiter(success = true): RateLimit & { calls: number } {
  const limiter = {
    calls: 0,
    async limit() {
      limiter.calls += 1;
      return { success };
    },
  };
  return limiter;
}

function denied(access: McpAccess): Response {
  expect(access.kind).toBe("deny");
  return (access as Extract<McpAccess, { kind: "deny" }>).response;
}

describe("resolveMcpAccess", () => {
  describe("익명 요청 — 한도를 적용하고 통과시킨다", () => {
    test("자격 증명이 없고 한도 이내면 authInfo 없이 통과한다", async () => {
      const limiter = spyLimiter();
      const access = await resolveMcpAccess(mcpRequest(), SECRET, limiter);

      expect(access).toEqual({ kind: "allow" });
      expect(access.kind === "allow" && access.authInfo).toBeUndefined();
      expect(limiter.calls).toBe(1);
    });

    test("자격 증명이 없고 한도를 넘으면 429다", async () => {
      const access = await resolveMcpAccess(mcpRequest(), SECRET, spyLimiter(false));
      expect(denied(access).status).toBe(429);
    });
  });

  describe("유효한 토큰 — 한도를 면제한다", () => {
    test("올바른 Bearer 토큰은 통과하고 리미터를 아예 호출하지 않는다", async () => {
      const limiter = spyLimiter();
      const access = await resolveMcpAccess(mcpRequest({ authorization: `Bearer ${SECRET}` }), SECRET, limiter);

      expect(access.kind).toBe("allow");
      const authInfo = (access as Extract<McpAccess, { kind: "allow" }>).authInfo;
      expect(authInfo?.token).toBe(SECRET);
      // SDK가 만료 없는 토큰을 거부하므로 게이트가 합성 만료를 넣는다.
      expect(authInfo?.expiresAt).toBeGreaterThan(Date.now() / 1000);
      expect(limiter.calls).toBe(0);
    });

    test("한도가 이미 초과된 상태여도 유효한 토큰은 통과한다(면제가 우선)", async () => {
      const access = await resolveMcpAccess(
        mcpRequest({ authorization: `Bearer ${SECRET}` }),
        SECRET,
        spyLimiter(false),
      );
      expect(access.kind).toBe("allow");
    });

    test("대체 헤더(x-mcp-token)의 원문 토큰도 받는다", async () => {
      const limiter = spyLimiter();
      const access = await resolveMcpAccess(mcpRequest({ [MCP_TOKEN_HEADER]: SECRET }), SECRET, limiter);

      expect(access.kind).toBe("allow");
      expect(limiter.calls).toBe(0);
    });
  });

  describe("무효한 토큰 — 401이지만 한도는 소비한다", () => {
    test("토큰이 틀리면 길이와 무관하게 401 + WWW-Authenticate 챌린지다", async () => {
      for (const wrong of ["s3cr3t-token-valuX", "nope"]) {
        const access = await resolveMcpAccess(mcpRequest({ authorization: `Bearer ${wrong}` }), SECRET, spyLimiter());
        const response = denied(access);
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
      }
    });

    test("401을 내기 전에 한도를 먼저 소비한다(토큰 무차별 대입 방어)", async () => {
      const limiter = spyLimiter();
      await resolveMcpAccess(mcpRequest({ authorization: "Bearer wrong-token-value" }), SECRET, limiter);
      expect(limiter.calls).toBe(1);
    });

    test("틀린 토큰이 한도까지 넘겼으면 401 대신 429다", async () => {
      const access = await resolveMcpAccess(
        mcpRequest({ authorization: "Bearer wrong-token-value" }),
        SECRET,
        spyLimiter(false),
      );
      expect(denied(access).status).toBe(429);
    });

    test("Bearer 접두사가 없으면 401이다", async () => {
      const access = await resolveMcpAccess(mcpRequest({ authorization: SECRET }), SECRET, spyLimiter());
      expect(denied(access).status).toBe(401);
    });

    test("Authorization이 있으면 대체 헤더는 보지 않는다", async () => {
      const access = await resolveMcpAccess(
        mcpRequest({ authorization: "Bearer wrong-token-value", [MCP_TOKEN_HEADER]: SECRET }),
        SECRET,
        spyLimiter(),
      );
      expect(denied(access).status).toBe(401);
    });
  });

  describe("시크릿 미설정 — 공개는 유지, 면제는 불가", () => {
    test("자격 증명이 없으면 그대로 통과한다(503으로 막지 않는다)", async () => {
      for (const secret of [undefined, ""]) {
        const access = await resolveMcpAccess(mcpRequest(), secret, spyLimiter());
        expect(access).toEqual({ kind: "allow" });
      }
    });

    test("토큰을 제시하면 검증할 수 없으므로 401이다(익명으로 강등하지 않는다)", async () => {
      for (const secret of [undefined, ""]) {
        const access = await resolveMcpAccess(mcpRequest({ authorization: `Bearer ${SECRET}` }), secret, spyLimiter());
        expect(denied(access).status).toBe(401);
      }
    });

    test("빈 토큰이 빈/미설정 시크릿과 매칭되지 않는다", async () => {
      for (const secret of [undefined, ""]) {
        const cases: Record<string, string>[] = [{ authorization: "Bearer " }, { [MCP_TOKEN_HEADER]: "" }];
        for (const headers of cases) {
          const access = await resolveMcpAccess(mcpRequest(headers), secret, spyLimiter());
          // 빈 x-mcp-token은 자격 증명 없음으로 취급되어 익명 통과, Bearer 빈 토큰은 401 —
          // 어느 쪽이든 "인증됨"(authInfo 있음)으로는 절대 가지 않는 것이 핵심이다.
          expect(access.kind === "allow" && access.authInfo).toBeFalsy();
        }
      }
    });
  });
});
