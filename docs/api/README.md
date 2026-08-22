# 공공데이터포털 금융위원회 채권 오픈API

이 디렉터리는 이 프로젝트가 사용하는 오픈API 2종의 명세를 정리한다.

- [채권기본정보 — `GetBondIssuInfoService_V2`](./bond-issu-info.md)
- [채권시세정보 — `GetBondSecuritiesInfoService`](./bond-price-info.md)

대응하는 TypeScript 타입은 `src/api/`에 있다. 이 문서와 `src/api/`는 1:1로 대응하도록 유지한다.

## 정본(source of truth)과 우선순위

같은 API를 설명하는 소스가 세 곳 있고, 서로 내용이 어긋나는 지점이 있다. 신뢰 우선순위는 다음과 같다.

1. **`openapi.do` 페이지의 Swagger UI** (`https://www.data.go.kr/data/15059592/openapi.do`, `https://www.data.go.kr/data/15094784/openapi.do`) — 포털이 실시간으로 갱신하는 명세. 응답 스키마(필드명·타입·설명)와 서비스 URL의 최신 정본. 단, **두 API 모두 Swagger의 `parameters`가 비어 있어 요청 파라미터 정보는 담고 있지 않다.**
2. **`오픈API 활용가이드` docx** (리포지터리 루트의 `GetBondIssuInfoService_V2.docx`, `GetBondSecuritiesInfoService.docx`) — **요청 파라미터의 유일한 정본.** 응답 필드 설명도 담고 있으나 Swagger보다 갱신이 늦을 수 있다.
3. **카탈로그 `openapi.json`** (`https://www.data.go.kr/catalog/15059592/openapi.json`, `.../15094784/openapi.json`) — 데이터셋 메타데이터(제목·설명·라이선스 등)일 뿐 파라미터·응답 스키마는 담고 있지 않다. 참고용으로만 사용한다.

두 API 모두 `openapi.do` 최종 수정일은 기본정보 2026-06-05, 시세정보 2025-07-17이다. docx 발행 이후 포털 쪽 명세(특히 에러코드)가 개편되었으므로, docx와 Swagger가 어긋나면 아래 각 문서의 각주를 확인할 것.

## 공통 요청 규약

- 인증: 쿼리스트링 `serviceKey`. 공공데이터포털에서 발급받은 인증키의 **Decoded 값**을 `URLSearchParams`에 넣을 것 — Encoded 값을 그대로 넣으면 이중 인코딩되어 인증에 실패한다.
- `resultType` 기본값은 **`xml`**. JSON 응답을 원하면 매 요청에 `resultType=json`을 명시해야 한다.
- 두 API 모두 스킴은 `https`(Swagger 기준 `http`도 지원하지만 https 사용을 권장).
- 페이징: `pageNo`, `numOfRows`.

## 공통 응답 규약

- **API 레벨 오류는 HTTP 200으로 응답한다.** 반드시 `response.header.resultCode === "00"`을 확인할 것.
- **단, GW(게이트웨이) 레벨 오류는 HTTP 200이 아니며 완전히 다른 봉투로 온다.** `serviceKey` 누락·미등록·만료 등 인증 단계에서 요청이 거부되면, 관찰된 HTTP 상태(401, 403 등)와 함께 아래 형태로 응답한다. **이 형태는 Swagger·docx 어디에도 문서화되어 있지 않고 실호출로만 확인됐다.**

  ```json
  {
    "OpenAPI_ServiceResponse": {
      "cmmMsgHeader": {
        "errMsg": "SERVICE_KEY_IS_NULL",
        "returnAuthMsg": "서비스 접근거부",
        "returnReasonCode": "20"
      }
    }
  }
  ```

  `errMsg`/`returnReasonCode`는 아래 "에러코드" 절의 `메시지`/`코드`와 같은 값 공간을 쓴다(단 `returnAuthMsg`는 아래 표의 `설명` 문구와 정확히 일치하지 않을 수 있어 분기 로직에는 쓰지 말 것). 클라이언트는 응답을 파싱하기 전에 HTTP 상태를 먼저 확인해야 한다. 타입은 `src/api/common.ts`의 `OpenApiGatewayErrorResponse` 참고.
- 정상/API 레벨 오류 응답 봉투: `response.header{resultCode,resultMsg}` + `response.body{numOfRows,pageNo,totalCount,items.item[]}`. 최상위 `response` 키를 포함한 전체 형태는 `src/api/common.ts`의 `OpenApiEnvelope<TItem>` 참고 — `OpenApiResponse<TItem>`은 `response` 키 안쪽(`header`/`body`)만 표현한다.
- **조회 결과가 0건이면 `items`가 객체가 아니라 빈 문자열(`""`)로 온다.** `items.item`에 바로 접근하지 말고 타입 가드를 거칠 것 (`src/api/common.ts`의 `OpenApiBody.items: { item: T[] } | ""` 참고).
- 모든 응답 필드는 기본적으로 **문자열**이며, 빈 값은 `""` 또는 문자열 `"NULL"`로 온다. 단, **채권시세정보의 가격·수익률·거래량 계열 11개 필드는 Swagger 스키마상 `number`(JSON 기준)로 선언되어 있다.** 실제 파싱·정규화 처리는 `src/api/` 타입이 아니라 이 타입을 사용하는 클라이언트 계층의 책임이다.

## 에러코드

포털이 표시하는 에러코드는 두 API 문서(2020~2021년 발행 docx)가 정리한 목록과 현재(2026년) `openapi.do` 페이지가 보여주는 목록이 다르다. **현재 API가 실제로 반환하는 코드는 아래 "현행" 표를 기준으로 판단할 것.**

### 현행 (openapi.do 기준, 2종 API 공통)

| 코드 | 메시지 | 설명 |
| --- | --- | --- |
| `01` | APPLICATION_ERROR | GW 내부 처리 중 예기치 않은 오류. 잠시 후 재호출, 반복 시 활용지원센터 문의 |
| `04` | HTTP_ERROR | 허용되지 않은 HTTP 요청이거나 기관 API 응답 처리 실패. 요청 방식·호출 URL 확인 |
| `05` | SERVICETIMEOUT_ERROR | 기관 API/GW 연계 서비스 연결 실패 또는 응답 대기시간 초과. 잠시 후 재호출 |
| `10` | INVALID_REQUEST_PARAMETER_ERROR | 요청 파라미터 값·형식 오류 |
| `12` | NO_OPENAPI_SERVICE_ERROR | 요청한 오픈API 서비스가 없거나 폐기됨. 호출 URL 오타 확인 |
| `20` | SERVICE_KEY_IS_NULL | 요청에 인증키가 포함되지 않음 |
| `20` | PERMISSION_DENIED | GW 접근 권한 검사에서 요청 거부 |
| `20` | SERVICE_ACCESS_DENIED_ERROR | 해당 API 서비스 이용 권한 미확인 (활용신청 승인/일시중지 상태 확인) |
| `22` | LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR | 일일 호출 허용량 초과 |
| `23` | LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR | 초당 호출 허용량(30 TPS) 초과 |
| `29` | BLACKLIST_IP_ACCESS_ERROR | 차단된 IP에서 호출 |
| `30` | SERVICE_KEY_IS_NOT_REGISTERED_ERROR | 등록되지 않은 인증키 |
| `31` | DEADLINE_HAS_EXPIRED_ERROR | 인증키 사용 기한 만료 |

> **주의**
> - **코드 `20`이 서로 다른 메시지 3개에 중복 배정되어 있다.** `resultCode`만으로 원인을 분기할 수 없으므로 반드시 `resultMsg`를 함께 확인한다.
> - **`23`은 초당 30 TPS 제한을 초과했을 때** 나오는 코드다. 클라이언트에서 rate limit을 걸 때의 근거로 삼는다.
> - 위 목록에 없는 코드가 오면(예: 아래 레거시 표의 `32`, `99`) 방어적으로 처리하고 `resultMsg`를 그대로 노출한다.

### docx 원본 (2020~2021년, 레거시 참고용)

| 에러코드 | 에러메시지 | 설명 |
| --- | --- | --- |
| `1` | APPLICATION_ERROR | 어플리케이션 에러 |
| `10` | INVALID_REQUEST_PARAMETER_ERROR | 잘못된 요청 파라메터 에러 |
| `12` | NO_OPENAPI_SERVICE_ERROR | 해당 오픈API서비스가 없거나 폐기됨 |
| `20` | SERVICE_ACCESS_DENIED_ERROR | 서비스 접근거부 |
| `22` | LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR | 서비스 요청제한횟수 초과에러 |
| `30` | SERVICE_KEY_IS_NOT_REGISTERED_ERROR | 등록되지 않은 서비스키 |
| `31` | DEADLINE_HAS_EXPIRED_ERROR | 기한만료된 서비스키 |
| `32` | UNREGISTERED_IP_ERROR | 등록되지 않은 IP |
| `99` | UNKNOWN_ERROR | 기타에러 |

## 공통 제약

- 초당 최대 30 TPS
- 일일 호출량: 개발계정 10,000건, 운영계정은 활용사례 등록 시 증설 신청 가능
- 최대 메시지 사이즈 4000 byte
- 평균 응답시간 500ms

## 데이터 갱신

- 갱신주기: 일 1회
- **갱신 시점: 기준일자 기준 영업일 +1일 오후 1시 이후.** 예: 금요일 데이터는 차주 월요일에 반영(월요일이 공휴일이면 다음 영업일). 즉 데이터는 실시간이 아니며 최신 기준일자라도 최대 며칠 전 데이터일 수 있다.

## 라이선스 (공공누리)

- **채권기본정보**: 공공누리 제2유형 — 출처표시 + **상업적 이용금지**. 상업적으로 활용하려면 데이터 원천 소유자인 한국예탁결제원(KSD)과 별도 정보이용계약이 필요 (portal@ksd.or.kr).
- **채권시세정보**: 이용허락범위 제한 없음.
- 서비스를 공개/수익화할 경우 기본정보 쪽 라이선스 제약을 먼저 확인할 것.
