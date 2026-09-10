---
name: probe-bond-api
description: 채권기본정보/채권시세정보 오픈API를 실제로 호출해 응답을 정규화 출력하고 resultCode를 검증한다. 사용자가 직접 트리거할 때만 실행(일일 호출 쿼터 소모).
disable-model-invocation: true
---

# probe-bond-api

공공데이터포털 금융위원회 채권 오픈API 2종을 실제로 호출해서, `docs/api/`의 명세와 `src/api/`의 타입이 실응답과 맞는지 확인하는 스킬. 실호출이라 일일 10,000건(개발계정) 쿼터를 소모하므로 사용자가 명시적으로 요청할 때만 쓴다.

## 사용법

```
.claude/skills/probe-bond-api/scripts/probe.sh <issu|price> [--raw] key=value ...
```

- `issu` — 채권기본정보 (`GetBondIssuInfoService_V2` / `getBondBasiInfo_V2`, 경로에 `/service/` **없음**). `basDt=`/`crno=`/`isinCd=` 중 최소 하나 필수 — 스크립트가 호출 전에 강제한다.
- `price` — 채권시세정보 (`GetBondSecuritiesInfoService` / `getBondPriceInfo`, 경로에 `/service/` **있음**). 모든 파라미터 옵션.
- `--raw` — 가공 없이 원문 JSON 그대로 출력.

예:

```
probe.sh price basDt=20260820 numOfRows=1
probe.sh issu isinCd=KR101501D868
probe.sh price mrktCtg=KTS numOfRows=5 --raw
```

시세정보의 파라미터 접두사(`begin*`/`end*`/`like*`)는 필드마다 다르며 `docs/api/bond-price-info.md`에 문서화된 20개만 실재한다 — 임의로 조합하지 말 것.

## 인증키

`.dev.vars`(우선) 또는 `.env`에서 `BOND_API_SERVICE_KEY`를 읽는다. 둘 다 없으면 스크립트가 등록 방법을 안내하고 종료한다. **이 파일들은 `.claude/settings.json`의 시크릿 차단 훅으로 Read/Edit/Write/Grep이 막혀 있으므로, Claude가 대신 만들거나 값을 확인해 줄 수 없다 — 사용자가 직접 만들어야 한다.** 키 값은 스크립트 출력에 노출되지 않는다.

## 스크립트가 고정하는 규약

| 항목 | 처리 |
|---|---|
| 베이스 URL | API별로 하드코딩 (`/service/` 유무 실수 원천 차단) |
| 인증키 이중 인코딩 | `curl --data-urlencode`로 Decoded 키를 정확히 한 번만 인코딩 |
| `resultType` | 항상 `json` 강제 주입 |
| issu 필수조건 | 식별자 파라미터 없으면 호출 자체를 거부 (전체조회 timeout 방지) |

## 출력 해석

1. **HTTP 상태가 200이 아님** → GW 레벨 오류. `src/api/common.ts`의 `OpenApiGatewayErrorResponse` 타입(`OpenAPI_ServiceResponse.cmmMsgHeader.{returnReasonCode,errMsg,returnAuthMsg}`) 형태로 온다. 정상/API 레벨 오류 봉투(`response.header`/`response.body`)와는 완전히 다른 형태다 — 예를 들어 `serviceKey` 누락 시 `HTTP 401` + `returnReasonCode: "20"`. 자세한 내용은 `docs/api/README.md`의 "공통 응답 규약" 절.
2. **`response.header.resultCode !== "00"`** → 코드·메시지 출력. `20`은 서로 다른 메시지 3개(`SERVICE_KEY_IS_NULL`/`PERMISSION_DENIED`/`SERVICE_ACCESS_DENIED_ERROR`)에 중복 배정되어 있으니 반드시 `resultMsg`로 구분한다. 전체 코드 표는 `docs/api/README.md`의 "에러코드" 절.
3. **`response.body.items`가 빈 문자열** → 조회 결과 0건. `items.item`에 접근하면 안 된다.
4. **정상** → `totalCount` + 첫 아이템의 필드 목록 + 값이 `""`/`"NULL"`인 필드 목록을 출력한다.

## 결과를 타입과 대조하기

호출 결과를 받은 뒤에는 `src/api/bond-issu-info.ts`(`BondBasiInfoItem`) 또는 `src/api/bond-price-info.ts`(`BondPriceInfoItem`)와 필드 목록을 비교해서:

- 응답에는 있는데 타입에 없는 필드 (미문서화 필드 추가 가능성)
- 타입에는 있는데 응답에 없는 필드 (필드 폐기 또는 옵션 파라미터에 따라 응답 안 옴)

가 있으면 보고한다. 구조적으로 같은 검사를 정적으로 하려면 `api-spec-sync` 스킬을 쓴다.
