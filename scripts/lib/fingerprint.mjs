// src/lib/bond/fingerprint.ts와 동일한 cyrb53 구현 (스크립트는 TS를 import할 수 없어 중복).
// 고치면 반드시 src/lib/bond/fingerprint.ts도 같이 확인할 것 — 둘이 다른 지문을 내면
// 백필로 적재한 행과 cron이 이후에 계산하는 지문이 어긋나 모든 종목이 "변경됨"으로 오판된다.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const SEPARATOR = " ";

export function fingerprintRow(values) {
  const serialized = values.map((v) => (v === null ? "NULL" : String(v))).join(SEPARATOR);
  return cyrb53(serialized);
}
