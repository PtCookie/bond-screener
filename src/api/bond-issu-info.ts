/**
 * 채권기본정보 — `GetBondIssuInfoService_V2` / `getBondBasiInfo_V2`.
 *
 * 상세 명세는 `docs/api/bond-issu-info.md` 참고. 이 파일의 타입은 그 문서와 1:1로 대응한다.
 */
import type { OpenApiResponse, PagingRequest, RequireAtLeastOne, ResultType } from "./common";

/** 서비스 URL. 경로에 `/service/`가 없다 (채권시세정보와 가장 흔히 혼동되는 지점). */
export const BOND_ISSU_INFO_BASE_URL = "https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2";

/** 오퍼레이션명(국문: 채권기본정보조회). */
export const BOND_ISSU_INFO_OPERATION = "getBondBasiInfo_V2";

/**
 * `basDt`/`crno`/`isinCd` 중 최소 하나는 반드시 지정해야 한다.
 *
 * docx의 요청 메시지 명세 표에는 `isinCd` 행이 누락되어 있으나, 같은 문서의 상세기능
 * 설명문과 `openapi.do` 포털 설명은 모두 `isinCd`를 이 제약에 포함한다.
 * 전부 생략하면 `basDt`가 최신 날짜로 자동 설정되어 timeout이 발생한다.
 */
interface BondBasiInfoIdentifierParams {
  /** 기준일자(YYYYMMDD) */
  basDt?: string;
  /** 법인등록번호(13자리) */
  crno?: string;
  /** ISIN코드(12자리) */
  isinCd?: string;
}

/** `getBondBasiInfo_V2` 요청 파라미터. */
export type BondBasiInfoRequest = PagingRequest &
  RequireAtLeastOne<BondBasiInfoIdentifierParams, "basDt" | "crno" | "isinCd"> & {
    /** 결과형식. 기본값 `xml` */
    resultType?: ResultType;
    /** 공공데이터포털 인증키 (Decoded 값) */
    serviceKey: string;
    /** 채권발행인명(최대 100자) */
    bondIsurNm?: string;
  };

/**
 * `getBondBasiInfo_V2` 응답 아이템. 75개 필드 전부 문자열이다(Swagger·docx 일치).
 *
 * 필수(응답에 항상 값이 채워짐)로 표기된 것은 `basDt`/`crno`/`bondIsurNm` 3개뿐이며,
 * 나머지는 옵션으로 빈 문자열 또는 문자열 `"NULL"`이 올 수 있다.
 */
export interface BondBasiInfoItem {
  /** 기준일자(YYYYMMDD) — 필수 */
  basDt: string;
  /** 법인등록번호(13자리) — 필수 */
  crno: string;
  /** ISIN코드(12자리) */
  isinCd: string;
  /** ISIN코드명 */
  isinCdNm: string;
  /** 유가증권종목종류코드 */
  scrsItmsKcd: string;
  /** 유가증권종목종류코드명 (예: 특수채) */
  scrsItmsKcdNm: string;
  /** 채권발행통화코드 (예: KRW) */
  bondIssuCurCd: string;
  /** 채권발행통화코드명 */
  bondIssuCurCdNm: string;
  /** 채권발행인명 — 필수 */
  bondIsurNm: string;
  /** 표준산업분류명 */
  sicNm: string;
  /** 채권발행일자(YYYYMMDD) */
  bondIssuDt: string;
  /** 채권만기일자(YYYYMMDD, 상환된 경우 상환일자) */
  bondExprDt: string;
  /** 금리변동구분코드 */
  irtChngDcd: string;
  /** 금리변동구분코드명 (예: 고정-이표) */
  irtChngDcdNm: string;
  /** 채권표면이율 (자릿수 15,10) */
  bondSrfcInrt: string;
  /** 보증구분코드 */
  grnDcd: string;
  /** 보증구분코드명 (예: 무보증) */
  grnDcdNm: string;
  /** 채권순위구분코드 */
  bondRnknDcd: string;
  /** 채권순위구분코드명 (예: 선순위) */
  bondRnknDcdNm: string;
  /** 옵션유형코드 */
  optnTcd: string;
  /** 옵션유형코드명 */
  optnTcdNm: string;
  /** 특이채권종류코드 */
  pclrBondKcd: string;
  /** 특이채권종류코드명 */
  pclrBondKcdNm: string;
  /** 채권발행금액 (자릿수 18,3) */
  bondIssuAmt: string;
  /** 채권납입금액 (자릿수 22,3) */
  bondPymtAmt: string;
  /** 채권잔액 (자릿수 18,3) */
  bondBal: string;
  /** 채권모집방법코드 */
  bondOffrMcd: string;
  /** 채권모집방법코드명 (예: 공모) */
  bondOffrMcdNm: string;
  /** 상장일자(YYYYMMDD) */
  lstgDt: string;
  /** 과세구분코드 */
  txtnDcd: string;
  /** 과세구분코드명 (예: 과세) */
  txtnDcdNm: string;
  /** 원금상환방법코드 */
  pamtRdptMcd: string;
  /** 원금상환방법코드명 (예: 만기상환) */
  pamtRdptMcdNm: string;
  /** 스트립스채권가능여부(Y/N) */
  stripsPsblYn: string;
  /** 스트립스채권명 */
  stripsNm: string;
  /** 물가연동채권여부(Y/N) */
  prisLnkgBondYn: string;
  /** 원리금지급기관명 */
  piamPayInstNm: string;
  /** 원리금지급지점명 */
  piamPayBrofNm: string;
  /** 자금용도구분코드 */
  cptUsgeDcd: string;
  /** 자금용도구분코드명 */
  cptUsgeDcdNm: string;
  /** 채권등록기관구분코드 */
  bondRegInstDcd: string;
  /** 채권등록기관구분코드명 (예: KSD) */
  bondRegInstDcdNm: string;
  /** 발행대리인명 */
  issuDptyNm: string;
  /** 채권인수기관명 */
  bondUndtInstNm: string;
  /** 채권보증기관명 */
  bondGrnInstNm: string;
  /** 사채관리회사명 */
  cpbdMngCmpyNm: string;
  /** 크라우드펀딩여부(Y/N) */
  crfndYn: string;
  /** 영구채권여부(Y/N) */
  prmncBondYn: string;
  /** QIB(적격기관투자자)대상증권여부(Y/N) */
  qibTrgtScrtYn: string;
  /** 영구채권해지일자(YYYYMMDD) */
  prmncBondTmnDt: string;
  /** 권리행사주체구분코드 */
  rgtExertMnbdDcd: string;
  /** 권리행사주체구분코드명 (예: KSD) */
  rgtExertMnbdDcdNm: string;
  /** 이자산정방법코드 */
  intCmpuMcd: string;
  /** 이자산정방법코드명 (예: 정형) */
  intCmpuMcdNm: string;
  /** QIB해지일자(YYYYMMDD) */
  qibTmnDt: string;
  /** 채권이자유형코드 (이표채/할인채 구분) */
  bondIntTcd: string;
  /** 채권이자유형코드명 (예: 이표채) */
  bondIntTcdNm: string;
  /** 이자지급주기내용 (예: 6개월) */
  intPayCyclCtt: string;
  /** 차기이표일자(YYYYMMDD) */
  nxtmCopnDt: string;
  /** 직전이표일자(YYYYMMDD) */
  rbfCopnDt: string;
  /** 은행휴일이자지급일구분코드 */
  bnkHldyIntPydyDcd: string;
  /** 은행휴일이자지급일구분코드명 (예: 직후영업일) */
  bnkHldyIntPydyDcdNm: string;
  /** 법정휴일이자지급일구분코드 */
  sttrHldyIntPydyDcd: string;
  /** 법정휴일이자지급일구분코드명 (예: 직후영업일) */
  sttrHldyIntPydyDcdNm: string;
  /** 이자지급시기구분코드 */
  intPayMmntDcd: string;
  /** 이자지급시기구분코드명 (예: 후급) */
  intPayMmntDcdNm: string;
  /** 경과이자지급여부(Y/N) */
  elpsIntPayYn: string;
  /** 한국신용평가(KIS) 유가증권종목종류코드 */
  kisScrsItmsKcd: string;
  /** 한국신용평가(KIS) 유가증권종목종류코드명 (신용등급, 예: AAA) */
  kisScrsItmsKcdNm: string;
  /** 한국자산평가(KBP) 유가증권종목종류코드 */
  kbpScrsItmsKcd: string;
  /** 한국자산평가(KBP) 유가증권종목종류코드명 (신용등급) */
  kbpScrsItmsKcdNm: string;
  /** NICE평가정보 유가증권종목종류코드 */
  niceScrsItmsKcd: string;
  /** NICE평가정보 유가증권종목종류코드명 (신용등급) */
  niceScrsItmsKcdNm: string;
  /** FN 유가증권종목종류코드 */
  fnScrsItmsKcd: string;
  /** FN 유가증권종목종류코드명 (신용등급) */
  fnScrsItmsKcdNm: string;
}

/** `getBondBasiInfo_V2` 응답. */
export type BondBasiInfoResponse = OpenApiResponse<BondBasiInfoItem>;
