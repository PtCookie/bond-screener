# 채권시세정보 — `GetBondSecuritiesInfoService`

공통 규약은 [README.md](./README.md)를 먼저 참고할 것.

## 서비스 개요

- API명(국문): 금융위원회_채권시세정보
- 서비스 URL: `https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService` (경로에 `/service/` **있음** — 채권기본정보와의 가장 흔한 실수 지점)
- 오퍼레이션: `getBondPriceInfo` (채권시세)
- 서비스 버전: 1.0.0
- 제공기관: 금융위원회 / 데이터 원천: 한국거래소(KRX)
- 데이터 포맷: JSON + XML
- 필수 파라미터 없음. 모든 조회 파라미터가 옵션(단 `serviceKey`는 필수)

국채전문유통시장(KTS), 일반채권시장, 소액채권시장의 시세 정보를 통합 제공한다.

## 요청 파라미터

필터 접두사 규약: `begin*`(≥), `end*`(<), `like*`(포함), 접두사 없음(정확히 일치). **접두사 조합은 필드마다 다르며, 아래 20개 파라미터만 실재한다** — 임의의 필드에 `begin`/`end`/`like`를 붙여 호출할 수 없다(예: `srtnCd`는 `likeSrtnCd`만 존재, 정확일치 파라미터는 없음).

| 영문명 | 국문명 | 크기 | 구분 | 샘플 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `serviceKey` | 서비스키 | 400 | 필수 | — | 공공데이터포털에서 받은 인증키(Decoded 값) |
| `numOfRows` | 한 페이지 결과 수 | 4 | 옵션 | `1` | 한 페이지 결과 수 |
| `pageNo` | 페이지 번호 | 4 | 옵션 | `1` | 페이지 번호 |
| `resultType` | 결과형식 | 4 | 옵션 | `xml` | 구분(xml, json). 기본값 `xml` |
| `basDt` | 기준일자 | 8 | 옵션 | `20220919` | 검색값과 기준일자가 일치하는 데이터를 검색 |
| `beginBasDt` | 기준일자 | 8 | 옵션 | `20220919` | 기준일자가 검색값보다 크거나 같은 데이터를 검색 |
| `endBasDt` | 기준일자 | 8 | 옵션 | `20220919` | 기준일자가 검색값보다 작은 데이터를 검색 |
| `likeBasDt` | 기준일자 | 8 | 옵션 | `20220919` | 기준일자값이 검색값을 포함하는 데이터를 검색 |
| `likeSrtnCd` | 단축코드 | 9 | 옵션 | `C01501D86` | 단축코드가 검색값을 포함하는 데이터를 검색 (`like`만 존재) |
| `isinCd` | ISIN코드 | 12 | 옵션 | `KR101501D868` | 검색값과 ISIN코드가 일치하는 데이터를 검색 |
| `likeIsinCd` | ISIN코드 | 12 | 옵션 | `KR101501D868` | ISIN코드가 검색값을 포함하는 데이터를 검색 |
| `itmsNm` | 종목명 | 120 | 옵션 | `국민주택1종18-06` | 검색값과 종목명이 일치하는 데이터를 검색 |
| `likeItmsNm` | 종목명 | 120 | 옵션 | `국민주택1종18-06` | 종목명이 검색값을 포함하는 데이터를 검색 |
| `mrktCtg` | 시장구분 | 60 | 옵션 | `일반채권` | 검색값과 시장구분이 일치하는 데이터를 검색 (정확일치만 — `begin`/`end`/`like` 없음) |
| `beginClprVs` | 종가_대비 | 12 | 옵션 | `0` | 종가_대비가 검색값보다 크거나 같은 데이터를 검색 |
| `endClprVs` | 종가_대비 | 12 | 옵션 | `0` | 종가_대비가 검색값보다 작은 데이터를 검색 |
| `beginClprBnfRt` | 종가_수익률 | 11 | 옵션 | `4.486` | 종가_수익률이 검색값보다 크거나 같은 데이터를 검색 |
| `endClprBnfRt` | 종가_수익률 | 11 | 옵션 | `4.486` | 종가_수익률이 검색값보다 작은 데이터를 검색 |
| `beginMkpBnfRt` | 시가_수익률 | 11 | 옵션 | `4.486` | 시가_수익률이 검색값보다 크거나 같은 데이터를 검색 |
| `endMkpBnfRt` | 시가_수익률 | 11 | 옵션 | `4.486` | 시가_수익률이 검색값보다 작은 데이터를 검색 |
| `beginTrqu` | 거래량 | 15 | 옵션 | `65000` | 거래량이 검색값보다 크거나 같은 데이터를 검색 |
| `endTrqu` | 거래량 | 15 | 옵션 | `65000` | 거래량이 검색값보다 작은 데이터를 검색 |
| `beginTrPrc` | 거래대금 | 21 | 옵션 | `68497` | 거래대금이 검색값보다 크거나 같은 데이터를 검색 |
| `endTrPrc` | 거래대금 | 21 | 옵션 | `68497` | 거래대금이 검색값보다 작은 데이터를 검색 |

`mrktCtg`(시장구분) 값: `KTS`(국채전문유통시장) / `일반채권` / `소액채권`

## 응답 필드

### 봉투(header/body)

| 영문명 | 국문명 | 크기 | 구분 | 샘플 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `resultCode` | 결과코드 | 2 | 필수 | `00` | 결과코드 |
| `resultMsg` | 결과메시지 | 50 | 필수 | `NORMAL SERVICE.` | 결과메시지 |
| `numOfRows` | 한 페이지 결과 수 | 4 | 필수 | `1` | 한 페이지 결과 수 |
| `pageNo` | 페이지 번호 | 4 | 필수 | `1` | 페이지 번호 |
| `totalCount` | 전체 결과 수 | 10 | 필수 | `138774` | 전체 결과 수 |

### 아이템 (`body.items.item[]`) — 18개 필드

docx는 모든 응답 필드를 문자열로 기술하지만, `openapi.do`의 Swagger 스키마는 가격·수익률·거래량 계열 11개 필드를 JSON 기준 `number`로 선언한다. 아래 "타입" 열은 Swagger 기준이며, 실제 클라이언트는 XML/JSON 어느 쪽으로 받든 문자열일 가능성을 함께 대비해야 한다(`src/api/common.ts`의 `NumericLike` 참고).

| 영문명 | 국문명 | 크기 | 구분 | 타입(Swagger) | 샘플 | 설명 |
| --- | --- | --- | --- | --- | --- | --- |
| `basDt` | 기준일자 | 8 | 옵션 | string | `20220919` | YYYYMMDD 기준일자 |
| `srtnCd` | 단축코드 | 9 | 옵션 | string | `C01501D86` | 종목 코드보다 짧으면서 유일성이 보장되는 코드(9자리) |
| `isinCd` | ISIN코드 | 12 | 옵션 | string | `KR101501D868` | 국제 채권 식별 번호 |
| `itmsNm` | 종목명 | 120 | 옵션 | string | `국민주택1종18-06` | 종목명 |
| `mrktCtg` | 시장구분 | 60 | 옵션 | string | `일반채권` | 시장 구분(`KTS`/`일반채권`/`소액채권` 중 1) |
| `xpYrCnt` | 만기년수 | 60 | 옵션 | string | — | 년 단위 만기기간 (**KTS만 허용**) |
| `itmsCtg` | 종목구분 | 60 | 옵션 | string | — | 지표/경과 (**KTS만 허용**) |
| `clprPrc` | 종가_가격 | 12 | 옵션 | number | `10538.1` | 정규시장의 매매시간종료시까지 형성되는 최종가격 |
| `clprVs` | 종가_대비 | 12 | 옵션 | number | `0` | 종가의 전일 대비 등락 |
| `clprBnfRt` | 종가_수익률 | 11 | 옵션 | number | `4.486` | 종가로 체결된 경우의 수익률 |
| `mkpPrc` | 시가_가격 | 12 | 옵션 | number | `10538.1` | 정규시장의 매매시간 개시 후 형성되는 최초가격 |
| `mkpBnfRt` | 시가_수익률 | 11 | 옵션 | number | `4.486` | 시가로 체결된 경우의 수익률 |
| `hiprPrc` | 고가_가격 | 12 | 옵션 | number | `10538.1` | 하루 중 가격의 최고치 |
| `hiprBnfRt` | 고가_수익률 | 11 | 옵션 | number | `4.486` | 고가로 체결된 경우의 수익률 |
| `loprPrc` | 저가_가격 | 12 | 옵션 | number | `10538.1` | 하루 중 가격의 최저치 |
| `loprBnfRt` | 저가_수익률 | 11 | 옵션 | number | `4.486` | 저가로 체결된 경우의 수익률 |
| `trqu` | 거래량 | 12 | 옵션 | number | `65000` | 체결수량의 누적 합계 |
| `trPrc` | 거래대금 | 21 | 옵션 | number | `68497` | 거래건 별 체결가격 × 체결수량의 누적 합계 |

## 요청/응답 예제

요청:

```
https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService/getBondPriceInfo?serviceKey=인증키&pageNo=1&numOfRows=1&resultType=xml
```

응답:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<response>
    <header>
        <resultCode>00</resultCode>
        <resultMsg>NORMAL SERVICE.</resultMsg>
    </header>
    <body>
        <numOfRows>1</numOfRows>
        <pageNo>1</pageNo>
        <totalCount>138774</totalCount>
        <items>
            <item>
                <basDt>20220919</basDt>
                <srtnCd>C01501D86</srtnCd>
                <isinCd>KR101501D868</isinCd>
                <itmsNm>국민주택1종18-06</itmsNm>
                <mrktCtg>일반채권</mrktCtg>
                <xpYrCnt> </xpYrCnt>
                <itmsCtg> </itmsCtg>
                <clprPrc>10538.1</clprPrc>
                <clprVs>0</clprVs>
                <clprBnfRt>4.486</clprBnfRt>
                <mkpPrc>10538.1</mkpPrc>
                <mkpBnfRt>4.486</mkpBnfRt>
                <hiprPrc>10538.1</hiprPrc>
                <hiprBnfRt>4.486</hiprBnfRt>
                <loprPrc>10538.1</loprPrc>
                <loprBnfRt>4.486</loprBnfRt>
                <trqu>65000</trqu>
                <trPrc>68497</trPrc>
            </item>
        </items>
    </body>
</response>
```

에러코드는 [README.md의 에러코드 표](./README.md#에러코드)를 참고.
