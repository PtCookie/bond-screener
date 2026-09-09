/**
 * `/mcp` 공유 시크릿 인증 게이트. Claude 커스텀 커넥터의 "요청 헤더"(인증 방식 "없음"을
 * 고른 뒤 API 키류 자격 증명을 헤더로 등록하는 칸)로 들어오는 토큰을 `MCP_AUTH_TOKEN`
 * 시크릿과 대조한다 — OAuth 전체 구현이 아니라 단일 공유 시크릿이다.
 *
 * 로직을 라우트(`src/pages/mcp.ts`) 밖에 두는 이유는 이 저장소의 기존 규약과 같다 —
 * workers vitest 프로젝트가 Astro 라우트 파일 자체를 실행할 수 없어(`vitest.workers.config.ts`
 * 주석 참고) 테스트 가능한 로직을 전부 라우트 밖으로 뺀다.
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
import { errorResponse } from "@/lib/api/params";

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
 * 요청을 인증한다. 통과하면 `AuthInfo`(호출부가 `handler.fetch(request, { authInfo })`로
 * 그대로 넘긴다), 거부하면 그대로 반환할 `Response`를 돌려준다 — SDK 게이트와 같은 계약이다.
 *
 * `secret`이 비어 있으면 **503으로 막는다(fail-closed)**. 배포에서 `wrangler secret put`을
 * 빠뜨린 사고가 "인증 없이 공개"로 조용히 남는 것보다 낫다.
 */
export async function authorizeMcpRequest(request: Request, secret: string | undefined): Promise<AuthInfo | Response> {
  if (!secret) {
    return errorResponse(503, "MCP 인증이 구성되지 않았습니다.");
  }

  // 대체 헤더는 표준 형식으로 정규화해서 넘긴다.
  const fallbackToken = request.headers.get(MCP_TOKEN_HEADER);
  const authorization = request.headers.get("authorization") ?? (fallbackToken ? `Bearer ${fallbackToken}` : null);

  try {
    return await verifyBearerToken(authorization, { verifier: createSharedSecretVerifier(secret) });
  } catch (error) {
    return bearerAuthChallengeResponse(error);
  }
}
