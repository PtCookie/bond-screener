/**
 * `bond` 테이블의 변경 감지용 지문(fingerprint).
 *
 * cyrb53을 쓰는 이유: 29,087행 규모에서 FNV-1a 같은 32비트 해시는 생일 문제로 충돌
 * 확률이 약 10%에 달해(29087^2 / 2 / 2^32 ≈ 0.098) 실제로 다른 두 행이 같은 지문을
 * 가질 수 있다. cyrb53은 53비트(SQLite `INTEGER`가 안전하게 담는 범위, JS
 * `Number.isSafeInteger`와도 맞음) 안전정수를 반환해 충돌 확률을 무시할 수 있는
 * 수준(약 29087^2 / 2 / 2^53 ≈ 2.2e-8)으로 낮춘다.
 *
 * 출처: cyrb53 (bryc, public domain) — 암호학적 해시가 아니라 변경 감지용 체크섬이다.
 */
function cyrb53(str: string, seed = 0): number {
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

/** 구분자. 없으면 `["ab","c"]`와 `["a","bc"]`가 같은 문자열로 이어져 지문이 충돌한다. */
const SEPARATOR = " ";

/**
 * 값 배열(`null`을 포함할 수 있음)의 지문을 계산한다. `null`과 빈 문자열을 구분하기 위해
 * `null`은 리터럴 `NULL`로, 나머지는 `String(value)`로 직렬화한다.
 */
export function fingerprintRow(values: readonly (string | number | null)[]): number {
  const serialized = values.map((v) => (v === null ? "NULL" : String(v))).join(SEPARATOR);
  return cyrb53(serialized);
}
