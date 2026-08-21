# 채권기본정보 — `GetBondIssuInfoService_V2`

공통 규약은 [README.md](./README.md)를 먼저 참고할 것.

## 서비스 개요

- API명(국문): 금융위원회_채권기본정보
- 서비스 URL: `https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2` (경로에 `/service/` 없음)
- 오퍼레이션: `getBondBasiInfo_V2` (채권기본정보조회)
- 서비스 버전: 1.0.0
- 제공기관: 금융위원회 / 데이터 원천: 한국예탁결제원(KSD)
- 데이터 포맷: JSON + XML

### 필수 파라미터 제약

`basDt`(기준일자) / `crno`(법인등록번호) / `isinCd`(ISIN코드) 중 **최소 하나**를 넘겨야 한다. 전부 생략하면 `basDt`가 자동으로 가장 최신 날짜로 설정되어 조회 시간이 오래 걸리고 timeout이 발생한다.

> **각주**: docx의 "요청 메시지 명세" 표에는 `isinCd` 행이 누락되어 있다. 그러나 같은 문서의 상세기능 설명문("basDt, crno, isinCd 중 하나의 파라미터라도 없이 조회 시…")과 `openapi.do` 포털의 서비스 설명("[서비스별 필수 파라미터 목록] 채권기본정보조회 : basDt, isinCd, crno")이 모두 `isinCd`를 조건에 포함하고 있으므로, 표의 누락으로 판단하고 `isinCd`를 요청 파라미터에 포함한다.

## 요청 파라미터

| 영문명 | 국문명 | 크기 | 구분 | 샘플 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `numOfRows` | 한 페이지 결과 수 | 4 | 필수 | `1` | 한 페이지 결과 수 |
| `pageNo` | 페이지 번호 | 4 | 필수 | `1` | 페이지 번호 |
| `resultType` | 결과형식 | 4 | 필수 | `xml` | 결과형식(xml/json). 기본값 `xml` |
| `serviceKey` | 서비스키 | 400 | 필수 | — | 공공데이터포털에서 받은 인증키(Decoded 값) |
| `basDt` | 기준일자 | 8 | 옵션* | `20200409` | 작업 또는 거래의 기준이 되는 일자(YYYYMMDD) |
| `crno` | 법인등록번호 | 13 | 옵션* | `1146710001456` | 법인등록번호 |
| `isinCd` | ISIN코드 | 12 | 옵션* | `KR350101G843` | 국제 채권 식별 번호 (docx 표 누락, 위 각주 참고) |
| `bondIsurNm` | 채권발행인명 | 100 | 옵션 | `한국전력공사` | 채권을 발행한 발행 회사의 명칭 |

\* `basDt`/`crno`/`isinCd`는 각각은 옵션이지만 셋 중 최소 하나는 필수.

## 응답 필드

### 봉투(header/body)

| 영문명 | 국문명 | 크기 | 구분 | 샘플 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `resultCode` | 결과코드 | 2 | 필수 | `00` | 결과코드 |
| `resultMsg` | 결과메시지 | 50 | 필수 | `NORMAL SERVICE.` | 결과메시지 |
| `numOfRows` | 한 페이지 결과 수 | 4 | 필수 | `1` | 한 페이지 결과 수 |
| `pageNo` | 페이지 번호 | 4 | 필수 | `1` | 페이지 번호 |
| `totalCount` | 전체 결과 수 | 10 | 필수 | `102` | 전체 결과 수 |

### 아이템 (`body.items.item[]`) — 75개 필드

모든 필드가 JSON·XML 공통으로 **문자열**이다(Swagger·docx 일치). 필수(1)로 표기된 것은 `basDt`, `crno`, `bondIsurNm` 3개뿐이며 나머지 72개는 옵션(0)으로 빈 문자열 또는 문자열 `"NULL"`이 올 수 있다.

| 영문명 | 국문명 | 크기 | 구분 | 샘플 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `basDt` | 기준일자 | 8 | 필수 | `20200409` | 작업 또는 거래의 기준이 되는 일자(년월일) |
| `crno` | 법인등록번호 | 13 | 필수 | `1146710001456` | 법인등록번호 |
| `isinCd` | ISIN코드 | 12 | 옵션 | `KR350101G843` | 국제 채권 식별 번호. 유가증권(채권)의 국제인증 고유번호 |
| `isinCdNm` | ISIN코드명 | 200 | 옵션 | `한국전력공사채권 937` | 유가증권 국제인증 고유번호 코드 이름 |
| `scrsItmsKcd` | 유가증권종목종류코드 | 4 | 옵션 | `1103` | 해당 유가증권의 종목종류(ex, 우선주, 보통주)를 관리하는 코드 |
| `scrsItmsKcdNm` | 유가증권종목종류코드명 | 100 | 옵션 | `특수채` | 해당 유가증권의 종목종류를 관리하는 코드의 명칭 |
| `bondIssuCurCd` | 채권발행통화코드 | 3 | 옵션 | `KRW` | 채권발행시 해당 채권의 각국 통화를 관리하는 코드 |
| `bondIssuCurCdNm` | 채권발행통화코드명 | 100 | 옵션 | `KRW` | 채권발행시 해당 채권의 각국 통화를 관리하는 코드의 명칭 |
| `bondIsurNm` | 채권발행인명 | 100 | 필수 | `한국전력공사` | 채권을 발행한 발행 회사의 명칭 |
| `sicNm` | 표준산업분류명 | 1000 | 옵션 | `전기업` | 산업 주체들이 모든 산업활동을 그 성질에 따라 유형화한 분류 이름 |
| `bondIssuDt` | 채권발행일자 | 8 | 옵션 | `20180410` | 채권을 발행한 일자 |
| `bondExprDt` | 채권만기일자 | 8 | 옵션 | `20200410` | 채권의 만기일자(상환된 경우, 상환 일자) |
| `irtChngDcd` | 금리변동구분코드 | 1 | 옵션 | `NULL` | 변동금리, 고정금리등 금리를 구분하는 코드 |
| `irtChngDcdNm` | 금리변동구분코드명 | 100 | 옵션 | `고정-이표` | 변동금리, 고정금리등 금리를 구분하는 코드의 명칭 |
| `bondSrfcInrt` | 채권표면이율 | 15,10 | 옵션 | `2.19` | 채권에 대한 표면 이자율 |
| `grnDcd` | 보증구분코드 | 1 | 옵션 | `2` | 보증의 종류를 구분하는 코드 |
| `grnDcdNm` | 보증구분코드명 | 100 | 옵션 | `무보증` | 보증의 종류를 구분하는 코드의 명칭 |
| `bondRnknDcd` | 채권순위구분코드 | 1 | 옵션 | `1` | 채권의 우선순위를 관리하는 코드 |
| `bondRnknDcdNm` | 채권순위구분코드명 | 100 | 옵션 | `선순위` | 채권의 우선순위를 관리하는 코드의 명칭 |
| `optnTcd` | 옵션유형코드 | 4 | 옵션 | `0000` | Call, Put 등 옵션의 유형을 관리하는 코드 |
| `optnTcdNm` | 옵션유형코드명 | 100 | 옵션 | `옵션해당사항없음` | Call, Put 등 옵션의 유형을 관리하는 코드의 명칭 |
| `pclrBondKcd` | 특이채권종류코드 | 1 | 옵션 | `9` | 전환, 교환등 특이 채권의 종류를 관리하는 코드 |
| `pclrBondKcdNm` | 특이채권종류코드명 | 100 | 옵션 | `주식관련해당사항없음` | 전환, 교환등 특이 채권의 종류를 관리하는 코드의 명칭 |
| `bondIssuAmt` | 채권발행금액 | 18,3 | 옵션 | `200000000000` | 채권에 대한 최초발행금액 |
| `bondPymtAmt` | 채권납입금액 | 22,3 | 옵션 | `200000000000` | 채권에 대한 납입금액 |
| `bondBal` | 채권잔액 | 18,3 | 옵션 | `200000000000` | 채권 발행 잔액 |
| `bondOffrMcd` | 채권모집방법코드 | 2 | 옵션 | `11` | 채권 모집시 모집 방법에 대한 코드 |
| `bondOffrMcdNm` | 채권모집방법코드명 | 100 | 옵션 | `공모` | 채권 모집시 모집 방법에 대한 코드의 명칭 |
| `lstgDt` | 상장일자 | 8 | 옵션 | `20180504` | 종목상장 적용일자(상장일자) |
| `txtnDcd` | 과세구분코드 | 1 | 옵션 | `1` | 과세, 비과세, 부분과세등 과세 종류를 구분하는 코드 |
| `txtnDcdNm` | 과세구분코드명 | 100 | 옵션 | `과세` | 과세, 비과세, 부분과세등 과세 종류를 구분하는 코드의 명칭 |
| `pamtRdptMcd` | 원금상환방법코드 | 2 | 옵션 | `11` | 원금 상환시 상환 방법에 따라 분류한 코드 |
| `pamtRdptMcdNm` | 원금상환방법코드명 | 100 | 옵션 | `만기상환` | 원금 상환시 상환 방법에 따라 분류한 코드의 명칭 |
| `stripsPsblYn` | 스트립스채권가능여부 | 1 | 옵션 | `N` | 스트립스채권(원금부분과 이자부분으로 나누어 각각 유통되는 채권)이 가능한지의 여부 |
| `stripsNm` | 스트립스채권명 | 100 | 옵션 | `해당사항없음` | 스트립스채권의 명칭 |
| `prisLnkgBondYn` | 물가연동채권여부 | 1 | 옵션 | `N` | 물가지수를 연동하여 물가지수연동계수, 물가지수연동원금이 적용되는 채권인지 여부 |
| `piamPayInstNm` | 원리금지급기관명 | 100 | 옵션 | `농협은행` | 원금과 이자를 지급하는 금융기관의 명칭 |
| `piamPayBrofNm` | 원리금지급지점명 | 100 | 옵션 | `나주혁신도시` | 원금과 이자를 지급하는 금융기관의 지점 이름 |
| `cptUsgeDcd` | 자금용도구분코드 | 2 | 옵션 | `NULL` | 자금의 용도가 시설자금인지, 운영자금인지등을 구분하는 코드 |
| `cptUsgeDcdNm` | 자금용도구분코드명 | 100 | 옵션 | `NULL` | 자금의 용도가 시설자금인지, 운영자금인지등을 구분하는 코드의 명칭 |
| `bondRegInstDcd` | 채권등록기관구분코드 | 2 | 옵션 | `01` | 채권을 등록하는 기관을 구분하는 코드 |
| `bondRegInstDcdNm` | 채권등록기관구분코드명 | 100 | 옵션 | `KSD` | 채권을 등록하는 기관을 구분하는 코드의 명칭 |
| `issuDptyNm` | 발행대리인명 | 1000 | 옵션 | `NULL` | 발행 대리인(주간사)의 명칭 |
| `bondUndtInstNm` | 채권인수기관명 | 1000 | 옵션 | `NULL` | 채권의 인수기관 명칭 |
| `bondGrnInstNm` | 채권보증기관명 | 1000 | 옵션 | `0` | 채권에 대한 보증기관 명칭 |
| `cpbdMngCmpyNm` | 사채관리회사명 | 1000 | 옵션 | `NULL` | 회사채 관리 회사명 |
| `crfndYn` | 크라우드펀딩여부 | 1 | 옵션 | `NULL` | 크라우드펀딩인지의 여부 |
| `prmncBondYn` | 영구채권여부 | 1 | 옵션 | `N` | 영구채권(만기가 정해져 있지 않는 자본증권)인지의 여부 |
| `qibTrgtScrtYn` | QIB대상증권여부 | 1 | 옵션 | `N` | 적격기관투자자 대상 여부 |
| `prmncBondTmnDt` | 영구채권해지일자 | 8 | 옵션 | `NULL` | 영구채권의 해지 일자 |
| `rgtExertMnbdDcd` | 권리행사주체구분코드 | 1 | 옵션 | `1` | 권리행사시 권리를 행사하는 주체를 구분하는 코드 |
| `rgtExertMnbdDcdNm` | 권리행사주체구분코드명 | 100 | 옵션 | `KSD` | 권리행사시 권리를 행사하는 주체를 구분하는 코드의 명칭 |
| `intCmpuMcd` | 이자산정방법코드 | 1 | 옵션 | `1` | 이자 산정시 산출 방법을 관리하는 코드 |
| `intCmpuMcdNm` | 이자산정방법코드명 | 100 | 옵션 | `정형` | 이자 산정시 산출 방법을 관리하는 코드의 명칭 |
| `qibTmnDt` | QIB해지일자 | 8 | 옵션 | `NULL` | 적격기관투자자의 해지 일자 |
| `bondIntTcd` | 채권이자유형코드 | 1 | 옵션 | `1` | 채권별 이자 유형이 이표채인지, 할인채인지등을 관리하는 코드 |
| `bondIntTcdNm` | 채권이자유형코드명 | 100 | 옵션 | `이표채` | 채권별 이자 유형이 이표채인지, 할인채인지등을 관리하는 코드의 명칭 |
| `intPayCyclCtt` | 이자지급주기내용 | 100 | 옵션 | `6개월` | 이자 지급의 주기 일수 |
| `nxtmCopnDt` | 차기이표일자 | 8 | 옵션 | `20200410` | 다음 차수의 이표 일자 |
| `rbfCopnDt` | 직전이표일자 | 8 | 옵션 | `20191010` | 직전의 이표 일자 |
| `bnkHldyIntPydyDcd` | 은행휴일이자지급일구분코드 | 1 | 옵션 | `2` | 이자 지급일이 은행휴일인경우, 실제 이자를 지급할 날짜를 관리하는 코드(익영업일 혹은 전영업일등) |
| `bnkHldyIntPydyDcdNm` | 은행휴일이자지급일구분코드명 | 100 | 옵션 | `직후영업일` | 위 코드의 명칭 |
| `sttrHldyIntPydyDcd` | 법정휴일이자지급일구분코드 | 1 | 옵션 | `2` | 이자 지급일이 휴일인경우, 실제 이자를 지급할 날짜를 관리하는 코드 |
| `sttrHldyIntPydyDcdNm` | 법정휴일이자지급일구분코드명 | 100 | 옵션 | `직후영업일` | 위 코드의 명칭 |
| `intPayMmntDcd` | 이자지급시기구분코드 | 2 | 옵션 | `01` | 이자 지급시, 지급시기를 관리하는 코드 |
| `intPayMmntDcdNm` | 이자지급시기구분코드명 | 100 | 옵션 | `후급` | 이자 지급시, 지급시기를 관리하는 코드의 명칭 |
| `elpsIntPayYn` | 경과이자지급여부 | 1 | 옵션 | `N` | 경과 이자의 지급 여부 |
| `kisScrsItmsKcd` | 한국신용평가유가증권종목종류코드 | 4 | 옵션 | `110` | 한국신용평가(KIS) 기준 유가증권 종목종류 코드 |
| `kisScrsItmsKcdNm` | 한국신용평가유가증권종목종류코드명 | 100 | 옵션 | `AAA` | 위 코드의 명칭(신용등급) |
| `kbpScrsItmsKcd` | 한국자산평가유가증권종목종류코드 | 4 | 옵션 | `110` | 한국자산평가(KBP) 기준 유가증권 종목종류 코드 |
| `kbpScrsItmsKcdNm` | 한국자산평가유가증권종목종류코드명 | 100 | 옵션 | `AAA` | 위 코드의 명칭(신용등급) |
| `niceScrsItmsKcd` | NICE평가정보유가증권종목종류코드 | 4 | 옵션 | `110` | NICE평가정보 기준 유가증권 종목종류 코드 |
| `niceScrsItmsKcdNm` | NICE평가정보유가증권종목종류코드명 | 100 | 옵션 | `AAA` | 위 코드의 명칭(신용등급) |
| `fnScrsItmsKcd` | FN유가증권종목종류코드 | 4 | 옵션 | `110` | FN 기준 유가증권 종목종류 코드 |
| `fnScrsItmsKcdNm` | FN유가증권종목종류코드명 | 100 | 옵션 | `AAA` | 위 코드의 명칭(신용등급) |

## 요청/응답 예제

요청:

```
https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2/getBondBasiInfo_V2?pageNo=1&numOfRows=1&resultType=xml&basDt=20200409&crno=1146710001456&serviceKey=인증키
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
        <totalCount>102</totalCount>
        <items>
            <item>
                <basDt>20200409</basDt>
                <bnkHldyIntPydyDcd>2</bnkHldyIntPydyDcd>
                <bnkHldyIntPydyDcdNm>직후영업일</bnkHldyIntPydyDcdNm>
                <bondBal>200000000000</bondBal>
                <bondExprDt>20200410</bondExprDt>
                <bondGrnInstNm>0</bondGrnInstNm>
                <bondIntTcd>1</bondIntTcd>
                <bondIntTcdNm>이표채</bondIntTcdNm>
                <bondIssuAmt>200000000000</bondIssuAmt>
                <bondIssuCurCd>KRW</bondIssuCurCd>
                <bondIssuCurCdNm>KRW</bondIssuCurCdNm>
                <bondIssuDt>20180410</bondIssuDt>
                <bondIsurNm>한국전력공사</bondIsurNm>
                <bondOffrMcd>11</bondOffrMcd>
                <bondOffrMcdNm>공모</bondOffrMcdNm>
                <bondPymtAmt>200000000000</bondPymtAmt>
                <bondRegInstDcd>01</bondRegInstDcd>
                <bondRegInstDcdNm>KSD</bondRegInstDcdNm>
                <bondRnknDcd>1</bondRnknDcd>
                <bondRnknDcdNm>선순위</bondRnknDcdNm>
                <bondSrfcInrt>2.19</bondSrfcInrt>
                <bondUndtInstNm></bondUndtInstNm>
                <cpbdMngCmpyNm></cpbdMngCmpyNm>
                <cptUsgeDcd></cptUsgeDcd>
                <cptUsgeDcdNm></cptUsgeDcdNm>
                <crfndYn></crfndYn>
                <crno>1146710001456</crno>
                <elpsIntPayYn>N</elpsIntPayYn>
                <fnScrsItmsKcd>110</fnScrsItmsKcd>
                <fnScrsItmsKcdNm>AAA</fnScrsItmsKcdNm>
                <grnDcd>2</grnDcd>
                <grnDcdNm>무보증</grnDcdNm>
                <intCmpuMcd>1</intCmpuMcd>
                <intCmpuMcdNm>정형</intCmpuMcdNm>
                <intPayCyclCtt>6개월</intPayCyclCtt>
                <intPayMmntDcd>01</intPayMmntDcd>
                <intPayMmntDcdNm>후급</intPayMmntDcdNm>
                <irtChngDcd></irtChngDcd>
                <irtChngDcdNm>고정-이표</irtChngDcdNm>
                <isinCd>KR350101G843</isinCd>
                <isinCdNm>한국전력공사채권 937</isinCdNm>
                <issuDptyNm></issuDptyNm>
                <kbpScrsItmsKcd>110</kbpScrsItmsKcd>
                <kbpScrsItmsKcdNm>AAA</kbpScrsItmsKcdNm>
                <kisScrsItmsKcd>110</kisScrsItmsKcd>
                <kisScrsItmsKcdNm>AAA</kisScrsItmsKcdNm>
                <lstgDt>20180504</lstgDt>
                <niceScrsItmsKcd>110</niceScrsItmsKcd>
                <niceScrsItmsKcdNm>AAA</niceScrsItmsKcdNm>
                <nxtmCopnDt>20200410</nxtmCopnDt>
                <optnTcd>0000</optnTcd>
                <optnTcdNm>옵션해당사항없음</optnTcdNm>
                <pamtRdptMcd>11</pamtRdptMcd>
                <pamtRdptMcdNm>만기상환</pamtRdptMcdNm>
                <pclrBondKcd>9</pclrBondKcd>
                <pclrBondKcdNm>주식관련해당사항없음</pclrBondKcdNm>
                <piamPayBrofNm>나주혁신도시</piamPayBrofNm>
                <piamPayInstNm>농협은행</piamPayInstNm>
                <prisLnkgBondYn>N</prisLnkgBondYn>
                <prmncBondTmnDt></prmncBondTmnDt>
                <prmncBondYn>N</prmncBondYn>
                <qibTmnDt></qibTmnDt>
                <qibTrgtScrtYn>N</qibTrgtScrtYn>
                <rbfCopnDt>20191010</rbfCopnDt>
                <rgtExertMnbdDcd>1</rgtExertMnbdDcd>
                <rgtExertMnbdDcdNm>KSD</rgtExertMnbdDcdNm>
                <scrsItmsKcd>1103</scrsItmsKcd>
                <scrsItmsKcdNm>특수채</scrsItmsKcdNm>
                <sicNm>전기업</sicNm>
                <stripsNm>해당사항없음</stripsNm>
                <stripsPsblYn>N</stripsPsblYn>
                <sttrHldyIntPydyDcd>2</sttrHldyIntPydyDcd>
                <sttrHldyIntPydyDcdNm>직후영업일</sttrHldyIntPydyDcdNm>
                <txtnDcd>1</txtnDcd>
                <txtnDcdNm>과세</txtnDcdNm>
            </item>
        </items>
    </body>
</response>
```

에러코드는 [README.md의 에러코드 표](./README.md#에러코드)를 참고.
