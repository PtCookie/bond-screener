---
name: api-spec-sync
description: docs/api/*.md 명세와 src/api/*.ts 타입 간 필드·파라미터·에러코드 정합성을 정적으로 검사한다. API 문서나 타입을 수정한 뒤, 또는 정합성이 의심될 때 사용.
---

# api-spec-sync

`docs/api/`(전체 필드 명세)와 `src/api/`(TypeScript 타입)는 1:1로 대응하도록 유지해야 하는데, 필드가 채권기본정보 75개·채권시세정보 18개+파라미터 20개로 많아 사람이 눈으로 드리프트를 잡기 어렵다. 이 스킬은 정적 diff로 그 정합성을 검사한다. 네트워크 호출 없음.

## 실행

```
node .claude/skills/api-spec-sync/scripts/spec-sync.mjs
```

- exit 0: 불일치 없음
- exit 1: 불일치 목록 출력 (stdout)

## 검사 항목

1. **채권기본정보** — `docs/api/bond-issu-info.md`의 "아이템" 표 ↔ `src/api/bond-issu-info.ts`의 `BondBasiInfoItem` 필드명 양방향 diff
2. **채권시세정보 응답** — `docs/api/bond-price-info.md`의 "아이템" 표 ↔ `BondPriceInfoItem` 필드명 양방향 diff + Swagger `number` 타입 필드가 TS에서 `NumericLike`인지 교차검증 (반대 방향 — `string`인데 `NumericLike`로 과잉선언된 경우도 검사)
3. **채권시세정보 요청 파라미터** — 문서화된 20개 필터 파라미터(`serviceKey`/`numOfRows`/`pageNo`/`resultType` 제외)와 `BondPriceInfoRequest` 필드가 정확히 일치하는지. 임의로 `begin`/`end`/`like` 접두사를 일반화해 추가하지 않았는지 잡아낸다
4. **에러코드** — `docs/api/README.md`의 "현행" 표 ↔ `src/api/common.ts`의 `OPEN_API_RESULT_CODES`(legacy 제외) 개수·코드·메시지 일치

이 스크립트는 범용 파서가 아니라 이 리포지터리의 테이블 컬럼 순서·인터페이스 형태에 맞춰 튜닝돼 있다(스크립트 상단 주석 참고). `docs/api/`나 `src/api/`의 테이블/인터페이스 구조 자체를 바꾸면 스크립트도 함께 손봐야 한다.

## 불일치 발견 시 처리 절차

1. 어느 쪽이 정본인지 `docs/api/README.md`의 "정본과 우선순위" 절을 따른다: ① `openapi.do` Swagger UI(응답 스키마·URL 정본, 파라미터는 비어 있음) → ② 활용가이드 docx(요청 파라미터의 유일한 정본) → ③ 카탈로그 `openapi.json`(참고용, 파라미터·스키마 없음)
2. 실제 응답과 대조하고 싶으면 `probe-bond-api` 스킬로 실호출해 확인한다
3. 정본을 확인한 뒤 `docs/api/*.md`와 `src/api/*.ts` 양쪽을 함께 수정해 1:1 대응을 복원한다 — 한쪽만 고치지 않는다
4. 에러코드 불일치는 특히 주의: `20`이 서로 다른 메시지 3개(`SERVICE_KEY_IS_NULL`/`PERMISSION_DENIED`/`SERVICE_ACCESS_DENIED_ERROR`)에 중복 배정되어 있는 것은 **정상**이다 — 스크립트가 이를 오탐으로 잡으면 스크립트 버그이지 데이터 문제가 아니다
