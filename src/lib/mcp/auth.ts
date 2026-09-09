/**
 * `/mcp` 접근 정책 게이트 — **인증은 선택**이고, 토큰의 역할은 접근 통제가 아니라
 * **rate limit 면제**다. 이 엔드포인트가 내보내는 데이터는 이미 스크리너 화면·`/api/bond/*`로
 * 공개돼 있어 익명 접근이 새로 정보를 새게 하지 않으므로, 공개를 기본으로 두고 토큰을 가진
 * 호출자에게만 한도를 풀어 준다.
 *
 * | 자격 증명 | 시크릿 설정 | 결과                                        |
 * | --------- | ----------- | ------------------------------------------- |
 * | 없음      | 무관        | 한도 적용 → 통과 시 익명 진행, 초과 시 429  |
 * | 유효      | 있음        | 한도 **면제** → 인증 진행                   |
 * | 무효      | 있음        | 한도 소비 → 초과면 429, 아니면 401          |
 * | 있음      | 없음        | 한도 소비 → 초과면 429, 아니면 401          |
 *
 * 두 가지 불변식이 이 표를 지탱한다:
 *
 * 1. **성공적으로 인증되지 않은 모든 요청이 한도를 소비한다.** 틀린 토큰을 익명으로 강등하지
 *    않고 401로 거부하는데(스테일 토큰·배포 누락이 "왜 자주 429가 나지"로 조용히 숨는 것보다
 *    호출자가 바로 알아차리는 편이 낫다), 그렇다고 401을 한도 밖에 두면 토큰 무차별 대입이
 *    무제한이 된다 — 그래서 401을 내기 **전에** 한도를 먼저 소비한다.
 * 2. **시크릿이 없으면 어떤 토큰도 유효할 수 없다.** 빈 문자열/`undefined` 시크릿을 제시된
 *    토큰과 비교하는 경로를 아예 만들지 않는다(빈 토큰이 매칭되는 사고 방지). 예전에는 "시크릿
 *    없으면 503" 분기가 이 역할을 겸했지만, 그 분기가 사라진 지금은 별도로 지켜야 한다.
 *
 * 인증 자체는 OAuth가 아니라 단일 공유 시크릿(`MCP_AUTH_TOKEN`)이다 — Claude 커스텀 커넥터의
 * "요청 헤더"(인증 방식 "없음"을 고른 뒤 API 키류 자격 증명을 헤더로 등록하는 칸)로 보낸다.
 *
 * 로직을 라우트(`src/pages/mcp.ts`) 밖에 두는 이유는 이 저장소의 기존 규약과 같다 —
 * workers vitest 프로젝트가 Astro 라우트 파일 자체를 실행할 수 없어(`vitest.workers.config.ts`
 * 주석 참고) 테스트 가능한 로직을 전부 라우트 밖으로 뺀다. 리미터를 바인딩에서 직접 읽지 않고
 * **인자로 받는** 것도 같은 이유다 — 로컬에는 Workers Rate Limiting 시뮬레이터가 아예 없어
 * (AGENTS.md 실측 기록) 가짜 리미터를 주입하는 것이 429 경로를 검증할 유일한 방법이다.
 *
 * 헤더 파싱·401 응답은 직접 만들지 않고 SDK의 `verifyBearerToken`/`bearerAuthChallengeResponse`
 * 짝을 쓴다. 같은 SDK의 `requireBearerAuth`(Request를 통째로 받는 fetch 게이트) 대신 이
 * 저수준 짝을 고른 이유는 아래 대체 헤더 정규화 때문이다 — 헤더 문자열을 직접 넘길 수 있어야
 * 가짜 Request를 만들지 않는다. 실패 시 SDK가 `401 + WWW-Authenticate: Bearer
 * error="invalid_token"`을 만들어 준다 — `resourceMetadataUrl`은 넘기지 않는다(OAuth
 * 디스커버리 포인터를 광고할 이유가 없다).
 */
import {
  bearerAuthChallengeResponse,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { checkRateLimit } from "@/lib/api/params";

/**
 * `Authorization`을 예약어로 막는 클라이언트를 위한 대체 헤더. 값은 `Bearer` 접두사 없는
 * 원문 토큰이다. `Authorization`이 없을 때만 본다.
 */
export const MCP_TOKEN_HEADER = "x-mcp-token";

/**
 * 합성 만료 시각(초). `verifyBearerToken`은 `AuthInfo.expiresAt`이 없거나 지난 토큰을
 * 무조건 거부하는데(SDK `dist/index.mjs`의 "Token has no expiration time"), 공유 시크릿에는
 * 만료 개념이 없다 — 검증을 통과시키기 위한 형식적인 값이라 짧게 잡는다(요청 처리 중에만
 * 유효하면 된다).
 */
const SYNTHETIC_TTL_SECONDS = 60;

const encoder = new TextEncoder();

/**
 * 상수시간 비교. 원문 대신 SHA-256 다이제스트를 비교한다 — 길이가 항상 32바이트로 같아
 * 조기 종료 없이 전체를 XOR로 훑을 수 있고, 토큰 길이 차이조차 타이밍으로 새지 않는다.
 * (workerd에는 `crypto.subtle.timingSafeEqual`도 있지만 Workers 전용 확장이라 이 저장소의
 * 타입 설정에서는 `SubtleCrypto`에 잡히지 않는다 — 캐스팅으로 우회하는 대신 표준 API만 쓴다.)
 */
async function tokensMatch(presented: string, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(presented)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function createSharedSecretVerifier(secret: string): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (!(await tokensMatch(token, secret))) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid token");
      }
      return {
        token,
        clientId: "mcp-shared-secret",
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + SYNTHETIC_TTL_SECONDS,
      };
    },
  };
}

/**
 * 제시된 자격 증명을 표준 `Authorization` 헤더 형식으로 정규화한다. 둘 다 없으면 `null`
 * (= 익명 요청). `Authorization`이 있으면 대체 헤더는 보지 않는다.
 */
function presentedAuthorization(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) return authorization;
  const fallbackToken = request.headers.get(MCP_TOKEN_HEADER);
  return fallbackToken ? `Bearer ${fallbackToken}` : null;
}

/** `resolveMcpAccess`의 결정. `allow`에 `authInfo`가 있으면 인증된 요청, 없으면 익명이다. */
export type McpAccess = { kind: "allow"; authInfo?: AuthInfo } | { kind: "deny"; response: Response };

/**
 * 요청의 접근 권한을 판정한다 — 파일 상단의 정책표가 이 함수의 명세다. `deny`의 `response`는
 * 호출부가 그대로 반환하면 되고, `allow`의 `authInfo`는 있을 때만
 * `handler.fetch(request, { authInfo })`로 넘긴다.
 */
export async function resolveMcpAccess(
  request: Request,
  secret: string | undefined,
  limiter: RateLimit,
): Promise<McpAccess> {
  const authorization = presentedAuthorization(request);

  // 자격 증명이 있고 시크릿도 설정돼 있을 때만 검증을 시도한다 — 불변식 2.
  if (authorization !== null && secret) {
    try {
      const authInfo = await verifyBearerToken(authorization, { verifier: createSharedSecretVerifier(secret) });
      return { kind: "allow", authInfo };
    } catch (error) {
      // 검증 실패도 한도를 소비한다(불변식 1) — 한도를 이미 넘겼으면 429가 401을 대신한다.
      const limited = await checkRateLimit(limiter, request);
      return { kind: "deny", response: limited ?? bearerAuthChallengeResponse(error) };
    }
  }

  const limited = await checkRateLimit(limiter, request);
  if (limited) return { kind: "deny", response: limited };

  // 자격 증명을 제시했는데 시크릿이 없어 검증할 수 없었던 경우: 익명으로 강등하지 않고 거부한다.
  if (authorization !== null) {
    return {
      kind: "deny",
      response: bearerAuthChallengeResponse(new OAuthError(OAuthErrorCode.InvalidToken, "Invalid token")),
    };
  }

  return { kind: "allow" };
}
