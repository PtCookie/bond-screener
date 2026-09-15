---
name: fingerprint-parity-check
description: src/lib/bond/fingerprint.ts와 scripts/lib/fingerprint.mjs의 지문 계산 로직이 동일한 입력에 대해 같은 값을 내는지 검증한다. 둘 중 하나라도 수정한 뒤, 또는 종목이 대량으로 "변경됨"으로 오판되는 등 지문 관련 이상이 의심될 때 사용.
---

# fingerprint-parity-check

`bond` 테이블 변경 감지용 지문(cyrb53 기반) 계산 로직이 두 곳에 중복 구현되어 있다:

- `src/lib/bond/fingerprint.ts` — cron/워커 코드가 쓰는 정본(TypeScript)
- `scripts/lib/fingerprint.mjs` — `scripts/backfill.mjs`가 쓰는 사본(plain JS, `node scripts/backfill.mjs`로 직접 실행돼야 해서 `@/` 별칭을 쓰는 TS를 import할 수 없어 중복 구현됨)

AGENTS.md가 명시하는 대로, **이 둘은 반드시 바이트 단위로 동일한 로직을 유지해야 한다.** 어긋나면 백필로 적재한 지문과 cron이 이후 계산하는 지문이 달라져 전 종목이 "변경됨"으로 오판된다 — 실제로 이 정합성이 깨진 채 배포될 뻔한 적이 있다.

이 스킬은 두 구현을 같은 샘플 입력 배열에 대해 돌려 출력이 정확히 일치하는지 확인한다. 네트워크 호출 없음, D1 접근 없음 — 순수 함수 비교.

## 실행

```
node .claude/skills/fingerprint-parity-check/scripts/check-parity.mjs
```

- exit 0: 모든 샘플에서 일치
- exit 1: 불일치 목록을 `ts (fingerprint.ts)` / `mjs (fingerprint.mjs)` 값과 함께 stdout에 출력

Node 24의 type-stripping을 이용해 `fingerprint.ts`를 빌드 없이 그대로 dynamic import한다(`scripts/build-snapshot.mjs`가 `src/lib/snapshot/format.ts` 등을 상대 경로로 직접 import하는 것과 같은 패턴, AGENTS.md "스크리너 스냅샷" 절 참고) — 단 `fingerprint.ts`가 `@/` 별칭이나 타입 스트리핑이 지우지 못하는 문법(enum 등)을 쓰게 되면 이 방식이 깨지니, 그 파일을 그런 방향으로 바꾸지 않도록 주의한다.

## 검사 케이스

빈 배열/단일 `null`/빈 문자열/`null`과 리터럴 문자열 `"NULL"`의 구분/구분자(` `) 없이 이어붙이면 충돌할 수 있는 문자열 쌍(`["ab","c"]` vs `["a","bc"]`)/공백을 포함한 값/유니코드(한글) 값/컬럼 30개 규모 배열/실제 bond 컬럼과 비슷한 혼합 배열을 포함한다.

## 불일치 발견 시 처리 절차

1. 어느 쪽을 최근에 수정했는지 git 이력으로 확인한다 — 보통 둘 중 하나만 고쳐서 어긋난 것이다.
2. `src/lib/bond/fingerprint.ts`와 `scripts/lib/fingerprint.mjs`를 나란히 놓고 `cyrb53` 본체·`SEPARATOR`·`null` 직렬화 규칙(`"NULL"` 리터럴)까지 전부 동일한지 줄 단위로 비교한다.
3. 둘 다 고쳐서 다시 이 스킬을 실행해 일치를 확인한다 — 한쪽만 고치고 끝내지 않는다.
4. 이미 프로덕션 D1에 잘못된 지문이 적재된 상태라면(과거 백필 결과 등), 코드를 맞춘 것만으로는 기존 행의 지문이 소급 정정되지 않는다 — 재백필 또는 `bond` 테이블의 지문 컬럼 재계산이 필요한지 사용자와 상의한다.
