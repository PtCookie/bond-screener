/**
 * MCP 엔드포인트 통합 테스트. `createMcpHandler`가 만드는 핸들러는 웹 표준
 * `Request → Response`라 workerd 위에서 실제 HTTP 스택을 거치지 않고도(라우트 파일
 * 없이) `handler.fetch(request)`를 직접 호출해 검증할 수 있다. `src/pages/mcp.ts`는
 * 라우팅·CORS·rate limit만 하는 얇은 껍데기라 별도 테스트 대상이 아니다
 * (`vitest.workers.config.ts` 주석 참고 — Astro 라우트 파일 자체는 이 프로젝트에서 실행 불가).
 *
 * **이 테스트는 SDK(`@modelcontextprotocol/server`)가 workerd 런타임에서 실제로
 * 동작하는지(특히 `CfWorkerJsonSchemaValidator` 경유 JSON Schema 검증)까지 함께
 * 확인한다** — Node 전용 검증기(ajv, eval 의존)가 잘못 끌려오면 여기서 실패한다.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createBondMcpServer } from "@/lib/mcp/server";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { resetD1 } from "./helpers/reset-d1";
import { buildIssuItem } from "./helpers/envelope";

beforeEach(resetD1);

function jsonRpcRequest(body: Record<string, unknown>): Request {
  return new Request("https://bond-screener.ptcookie.net/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
}

/**
 * `responseMode: "auto"`(기본값)는 요청마다 일반 JSON 응답과 SSE 스트림 중 하나를
 * 고른다(실측: 이 서버에서 `tools/call`은 SSE로 응답했다) — 그러니 어느 쪽이 와도
 * 최종 JSON-RPC 결과만 뽑아낸다. SSE 프레임은 `data: {...}` 줄이고, 우리 툴은
 * 진행 알림을 보내지 않으므로 마지막 `data:` 줄이 곧 최종 result다.
 */
async function readJsonRpcResult<T>(response: Response): Promise<T> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const dataLines = text.split("\n").filter((line) => line.startsWith("data:"));
  const raw = contentType.includes("text/event-stream") ? dataLines[dataLines.length - 1].slice("data:".length) : text;
  const parsed = JSON.parse(raw) as { result: T };
  return parsed.result;
}

async function callTool(handler: { fetch: (request: Request) => Promise<Response> }, name: string, args: unknown) {
  const response = await handler.fetch(
    jsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  );
  expect(response.status).toBe(200);
  const result = await readJsonRpcResult<{ content: { type: string; text: string }[] }>(response);
  return JSON.parse(result.content[0]?.text ?? "null") as unknown;
}

describe("bond MCP server", () => {
  test("tools/list가 3종 툴을 노출한다", async () => {
    const handler = createMcpHandler(() => createBondMcpServer(env.DB));
    const response = await handler.fetch(jsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));

    expect(response.status).toBe(200);
    const result = await readJsonRpcResult<{ tools: { name: string }[] }>(response);
    expect(result.tools.map((t) => t.name).sort()).toEqual(["get_bond", "get_bond_prices", "search_bonds"]);
  });

  test("get_bond은 존재하지 않는 종목에 isError를 반환한다", async () => {
    const handler = createMcpHandler(() => createBondMcpServer(env.DB));
    const response = await handler.fetch(
      jsonRpcRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_bond", arguments: { id: "KRNOTFOUND12" } },
      }),
    );

    expect(response.status).toBe(200);
    const result = await readJsonRpcResult<{ isError?: boolean; content: { text: string }[] }>(response);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("종목을 찾을 수 없습니다");
  });

  test("get_bond은 id 형식이 틀리면 isError를 반환한다", async () => {
    const handler = createMcpHandler(() => createBondMcpServer(env.DB));
    const response = await handler.fetch(
      jsonRpcRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_bond", arguments: { id: "짧음" } },
      }),
    );
    const result = await readJsonRpcResult<{ isError?: boolean; content: { text: string }[] }>(response);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("12자리 ISIN 또는 9자리 단축코드");
  });

  test("search_bonds → get_bond → get_bond_prices 전체 흐름", async () => {
    const ISIN = "KR6000011D36";
    await writeBondPage(
      env.DB,
      [buildIssuItem({ isinCd: ISIN, bondIsurNm: "대한민국", kisScrsItmsKcdNm: "AAA" })],
      20260828,
    );
    const handler = createMcpHandler(() => createBondMcpServer(env.DB));

    const searchResult = (await callTool(handler, "search_bonds", { issuer: "대한민국", limit: 10 })) as {
      count: number;
      results: { isinCd: string }[];
    };
    expect(searchResult.count).toBe(1);
    expect(searchResult.results[0].isinCd).toBe(ISIN);

    const bond = (await callTool(handler, "get_bond", { id: ISIN })) as { isinCd: string; issuer: string };
    expect(bond.isinCd).toBe(ISIN);
    expect(bond.issuer).toBe("대한민국");

    const prices = (await callTool(handler, "get_bond_prices", { id: ISIN })) as { prices: unknown[] };
    expect(prices.prices).toEqual([]);
  });
});
