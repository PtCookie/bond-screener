/**
 * R2 스냅샷 오브젝트를 클라이언트에 스트리밍 패스스루하는 프록시. Worker CPU를 쓰지 않도록
 * `object.body`를 그대로 응답 body에 넘기고, 재직렬화하지 않는다.
 *
 * 압축은 여기서 하지 않는다 — R2에는 평문 JSON을 저장하고, Cloudflare 엣지가 실제
 * 클라이언트 `Accept-Encoding`에 맞춰 gzip/brotli를 자동 적용한다(`src/lib/r2/keys.ts`의
 * `snapshotBondKey` 주석 참고. 한때 R2에 압축 변형을 직접 올려두고 여기서 골라 서빙하려
 * 했으나, 로컬 dev(Miniflare)에서 `request.headers.get("accept-encoding")`이 항상
 * 플랫폼이 정규화한 값만 보여주고 `R2Object.writeHttpMetadata()`의 `Content-Encoding`도
 * 응답에 반영되지 않는 것을 실측으로 확인해 걷어냈다).
 *
 * 요청 경로는 화이트리스트(`resolveTarget`)로만 R2 키를 만든다 — 사용자 입력이 직접 키
 * 문자열에 들어가는 경로가 없어 임의 오브젝트 조회가 불가능하다.
 *
 * `env`는 `Astro.locals.runtime.env`가 아니라 `cloudflare:workers`에서 가져온다 —
 * 설치된 `@astrojs/cloudflare`(Astro v6+ 대응)는 전자를 제거하고 접근 시 throw한다
 * (AGENTS.md "데이터 계층" 절 참고).
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { SNAPSHOT_INDEX_KEY, snapshotBondKey, snapshotPriceDeltaKey } from "@/lib/r2/keys";

export const prerender = false;

interface SnapshotTarget {
  key: string;
  cacheControl: string;
}

const INDEX_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const BOND_PATH_RE = /^bond\/(\d{8})$/;
const PRICE_PATH_RE = /^price\/(\d{8})$/;

function resolveTarget(path: string): SnapshotTarget | null {
  if (path === "index") {
    return { key: SNAPSHOT_INDEX_KEY, cacheControl: INDEX_CACHE_CONTROL };
  }

  const bondMatch = BOND_PATH_RE.exec(path);
  if (bondMatch) {
    return { key: snapshotBondKey(Number(bondMatch[1])), cacheControl: IMMUTABLE_CACHE_CONTROL };
  }

  const priceMatch = PRICE_PATH_RE.exec(path);
  if (priceMatch) {
    return { key: snapshotPriceDeltaKey(Number(priceMatch[1])), cacheControl: IMMUTABLE_CACHE_CONTROL };
  }

  return null;
}

export const GET: APIRoute = async ({ params }) => {
  const target = resolveTarget(params.path ?? "");
  if (!target) return new Response("Not Found", { status: 404 });

  const object = await env.ARCHIVE.get(target.key);
  if (!object) return new Response("Not Found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", target.cacheControl);

  return new Response(object.body, { headers });
};
