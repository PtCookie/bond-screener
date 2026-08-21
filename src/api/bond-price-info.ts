/**
 * 채권시세정보 — `GetBondSecuritiesInfoService` / `getBondPriceInfo`.
 *
 * 상세 명세는 `docs/api/bond-price-info.md` 참고. 이 파일의 타입은 그 문서와 1:1로 대응한다.
 */
import type { NumericLike, OpenApiResponse, PagingRequest, ResultType } from "./common";

/** 서비스 URL. 경로에 `/service/`가 **있다** (채권기본정보와 가장 흔히 혼동되는 지점). */
export const BOND_PRICE_INFO_BASE_URL = "https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService";

/** 오퍼레이션명(국문: 채권시세). */
export const BOND_PRICE_INFO_OPERATION = "getBondPriceInfo";

/** 시장구분(`mrktCtg`) 값. */
export const BOND_MARKET_CATEGORIES = ["KTS", "일반채권", "소액채권"] as const;

/** 시장구분 값 타입. `KTS`는 국채전문유통시장. */
export type BondMarketCategory = (typeof BOND_MARKET_CATEGORIES)[number];

/**
 * `getBondPriceInfo` 요청 파라미터.
 *
 * 필터 접두사 규약: `begin*`(≥), `end*`(<), `like*`(포함), 접두사 없음(정확히 일치).
 * **접두사 조합은 필드마다 다르며, 아래에 선언된 20개 필터 파라미터만 실재한다.**
 * 예: `srtnCd`는 `likeSrtnCd`만 존재(정확일치 파라미터 없음), `mrktCtg`는 정확일치만 존재.
 */
export interface BondPriceInfoRequest extends PagingRequest {
  /** 결과형식. 기본값 `xml` */
  resultType?: ResultType;
  /** 공공데이터포털 인증키 (Decoded 값) */
  serviceKey: string;

  /** 기준일자(YYYYMMDD) 정확일치 */
  basDt?: string;
  /** 기준일자 ≥ */
  beginBasDt?: string;
  /** 기준일자 < */
  endBasDt?: string;
  /** 기준일자 포함검색 */
  likeBasDt?: string;

  /** 단축코드(9자리) 포함검색. 정확일치·begin·end 파라미터는 존재하지 않는다. */
  likeSrtnCd?: string;

  /** ISIN코드(12자리) 정확일치 */
  isinCd?: string;
  /** ISIN코드 포함검색 */
  likeIsinCd?: string;

  /** 종목명 정확일치 */
  itmsNm?: string;
  /** 종목명 포함검색 */
  likeItmsNm?: string;

  /** 시장구분. 정확일치만 존재한다 (begin/end/like 없음). */
  mrktCtg?: BondMarketCategory;

  /** 종가_대비 ≥ */
  beginClprVs?: NumericLike;
  /** 종가_대비 < */
  endClprVs?: NumericLike;

  /** 종가_수익률 ≥ */
  beginClprBnfRt?: NumericLike;
  /** 종가_수익률 < */
  endClprBnfRt?: NumericLike;

  /** 시가_수익률 ≥ */
  beginMkpBnfRt?: NumericLike;
  /** 시가_수익률 < */
  endMkpBnfRt?: NumericLike;

  /** 거래량 ≥ */
  beginTrqu?: NumericLike;
  /** 거래량 < */
  endTrqu?: NumericLike;

  /** 거래대금 ≥ */
  beginTrPrc?: NumericLike;
  /** 거래대금 < */
  endTrPrc?: NumericLike;
}

/**
 * `getBondPriceInfo` 응답 아이템. 18개 필드.
 *
 * docx는 모든 응답 필드를 문자열로 기술하지만, `openapi.do`의 Swagger 스키마는
 * 가격·수익률·거래량 계열 11개 필드를 JSON 기준 `number`로 선언한다. 아래 타입은
 * 두 표현을 모두 수용하는 {@link NumericLike}(`string | number`)를 사용한다.
 */
export interface BondPriceInfoItem {
  /** 기준일자(YYYYMMDD) */
  basDt: string;
  /** 단축코드(9자리) */
  srtnCd: string;
  /** ISIN코드(12자리) */
  isinCd: string;
  /** 종목명 */
  itmsNm: string;
  /** 시장구분 */
  mrktCtg: BondMarketCategory;
  /** 만기년수 (KTS만 허용) */
  xpYrCnt: string;
  /** 종목구분: 지표/경과 (KTS만 허용) */
  itmsCtg: string;

  /** 종가_가격 */
  clprPrc: NumericLike;
  /** 종가_대비(전일 대비 등락) */
  clprVs: NumericLike;
  /** 종가_수익률 */
  clprBnfRt: NumericLike;

  /** 시가_가격 */
  mkpPrc: NumericLike;
  /** 시가_수익률 */
  mkpBnfRt: NumericLike;

  /** 고가_가격 */
  hiprPrc: NumericLike;
  /** 고가_수익률 */
  hiprBnfRt: NumericLike;

  /** 저가_가격 */
  loprPrc: NumericLike;
  /** 저가_수익률 */
  loprBnfRt: NumericLike;

  /** 거래량(체결수량의 누적 합계) */
  trqu: NumericLike;
  /** 거래대금(체결가격 × 체결수량의 누적 합계) */
  trPrc: NumericLike;
}

/** `getBondPriceInfo` 응답. */
export type BondPriceInfoResponse = OpenApiResponse<BondPriceInfoItem>;
