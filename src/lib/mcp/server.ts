/**
 * 채권 데이터 MCP 서버 팩토리. `createMcpHandler`(`@modelcontextprotocol/server`)는
 * stateless — 요청마다 이 팩토리를 다시 호출해 새 `McpServer` 인스턴스를 만든다
 * (Durable Object도 세션도 없다). `src/pages/mcp.ts`가 이 팩토리를 넘긴다.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { registerBondTools } from "./tools";

/**
 * JSON Schema validator를 명시적으로 지정한다. SDK는 기본적으로 런타임을 감지해
 * Node에서는 ajv, workerd/브라우저에서는 `@cfworker/json-schema`를 자동 선택하지만,
 * Astro/Vite 번들링을 거친 뒤에도 그 감지가 실제 Workers 런타임(및 `astro dev`가
 * 로컬에서 띄우는 workerd)에서 올바르게 풀리는지는 별도로 보장되지 않는다 — ajv는
 * `new Function`(eval 계열)에 의존해 Workers에서 실패할 수 있으므로, 자동 감지에
 * 기대지 않고 워커 전용 validator를 강제한다.
 */
const JSON_SCHEMA_VALIDATOR = new CfWorkerJsonSchemaValidator();

const SERVER_INSTRUCTIONS = `
이 서버는 공공데이터포털(data.go.kr) 금융위원회 채권 오픈API 2종(채권기본정보·채권시세정보)을
매 영업일 수집해 제공하는 국내 상장채권 데이터베이스다.

- 모든 날짜는 YYYYMMDD 8자리 정수/문자열이다.
- 시장구분(mrktCtg)은 KTS(국채전문유통시장) / 일반채권 / 소액채권 세 가지다.
- 데이터는 기준일자 기준 영업일+1일 오후 1시 이후 반영된다 — 오늘 또는 최근 1영업일 데이터는
  아직 없을 수 있다.
- 신용등급(grade)은 KIS(한국신용평가) 기준만 노출한다.
- 종목 식별자는 12자리 ISIN 코드 또는 9자리 단축코드(srtnCd) 둘 다 받는다.
- 채권기본정보는 공공누리 제2유형(출처표시, 상업적 이용금지) 라이선스를 따른다 — 이 데이터를
  이용해 상업적 서비스를 만들 때는 그 제약을 사용자에게 알릴 것.
`.trim();

/** 요청마다 새로 호출되는 팩토리. `db`는 `env.DB` — 호출자(`src/pages/mcp.ts`)가 넘긴다. */
export function createBondMcpServer(db: D1Database): McpServer {
  const server = new McpServer(
    { name: "bond-screener", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS, jsonSchemaValidator: JSON_SCHEMA_VALIDATOR },
  );
  registerBondTools(server, db);
  return server;
}
