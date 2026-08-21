/**
 * 공공데이터포털 금융위원회 채권 오픈API 2종(채권기본정보/채권시세정보)이 공유하는
 * 요청·응답 봉투 타입과 상수.
 *
 * 상세 규약은 `docs/api/README.md`를 참고. 이 파일은 와이어 포맷을 있는 그대로
 * 반영하는 타입만 정의하며, `"NULL"`/빈 문자열 정규화나 숫자·날짜 파싱은
 * 이 타입을 사용하는 클라이언트 계층의 책임이다.
 */

/** `resultType` 쿼리 파라미터. 기본값은 `xml`이며, JSON을 원하면 매 요청에 명시해야 한다. */
export type ResultType = "xml" | "json";

/** 와이어 상에서 문자열 또는 숫자로 올 수 있는 값(XML은 문자열, JSON은 API에 따라 숫자). */
export type NumericLike = string | number;

/** 두 API 공통 페이징 요청 파라미터. */
export interface PagingRequest {
  /** 한 페이지 결과 수 */
  numOfRows?: NumericLike;
  /** 페이지 번호 */
  pageNo?: NumericLike;
}

/**
 * 객체 타입 `T`에서 키 집합 `K` 중 최소 하나는 반드시 채워지도록 강제하는 유틸 타입.
 *
 * 채권기본정보 API의 "basDt/crno/isinCd 중 최소 하나 필수" 제약을 타입 수준에서 표현하는 데 쓴다.
 */
export type RequireAtLeastOne<T, K extends keyof T = keyof T> = Pick<T, Exclude<keyof T, K>> &
  {
    [P in K]-?: Required<Pick<T, P>> & Partial<Pick<T, Exclude<K, P>>>;
  }[K];

/** 응답 봉투의 `header`. */
export interface OpenApiHeader {
  /** 결과코드. `"00"`이면 정상. 그 외 코드는 {@link OPEN_API_RESULT_CODES} 참고. */
  resultCode: string;
  /** 결과메시지 */
  resultMsg: string;
}

/** 응답 봉투의 `body.items`. 조회 결과가 0건이면 객체가 아니라 빈 문자열로 온다. */
export interface OpenApiItems<TItem> {
  item: TItem[];
}

/** 응답 봉투의 `body`. */
export interface OpenApiBody<TItem> {
  /** 한 페이지 결과 수 */
  numOfRows: NumericLike;
  /** 페이지 번호 */
  pageNo: NumericLike;
  /** 전체 결과 수 */
  totalCount: NumericLike;
  /** 조회 결과가 0건이면 `""`(빈 문자열)로 온다. 접근 전 반드시 타입 가드를 거칠 것. */
  items: OpenApiItems<TItem> | "";
}

/** 두 API 공통 응답 봉투. */
export interface OpenApiResponse<TItem> {
  header: OpenApiHeader;
  body: OpenApiBody<TItem>;
}

/** 에러코드가 속한 분류. `legacy`는 docx 원본(2020~2021년 발행) 기준이며 현재는 사용되지 않는다. */
export type OpenApiResultCodeKind = "general" | "auth" | "legacy";

export interface OpenApiResultCodeInfo {
  code: string;
  message: string;
  description: string;
  kind: OpenApiResultCodeKind;
}

/**
 * 오픈API 에러코드 전체 목록 (`openapi.do` 포털의 현행 표 + docx 원본의 레거시 표).
 *
 * `code`가 유일하지 않다 — `"20"`이 서로 다른 메시지 3개에 중복 배정되어 있으므로,
 * `resultCode`만으로 원인을 분기하지 말고 `resultMsg`를 함께 확인할 것.
 * 자세한 내용은 `docs/api/README.md`의 "에러코드" 절 참고.
 */
export const OPEN_API_RESULT_CODES: readonly OpenApiResultCodeInfo[] = [
  {
    code: "01",
    message: "APPLICATION_ERROR",
    description: "GW 내부 처리 중 예기치 않은 오류가 발생했습니다.",
    kind: "general",
  },
  {
    code: "04",
    message: "HTTP_ERROR",
    description: "허용되지 않은 HTTP 요청이거나 기관 API 응답 처리에 실패했습니다.",
    kind: "general",
  },
  {
    code: "05",
    message: "SERVICETIMEOUT_ERROR",
    description: "기관 API 또는 GW 연계 서비스와의 연결에 실패했거나 응답 대기시간을 초과했습니다.",
    kind: "general",
  },
  {
    code: "10",
    message: "INVALID_REQUEST_PARAMETER_ERROR",
    description: "요청 파라미터의 값이나 형식이 올바르지 않습니다.",
    kind: "general",
  },
  {
    code: "12",
    message: "NO_OPENAPI_SERVICE_ERROR",
    description: "요청한 오픈API 서비스가 존재하지 않거나 폐기되었습니다.",
    kind: "general",
  },
  {
    code: "20",
    message: "SERVICE_KEY_IS_NULL",
    description: "요청에 API 인증키가 포함되지 않았습니다.",
    kind: "general",
  },
  {
    code: "20",
    message: "PERMISSION_DENIED",
    description: "GW 접근 권한 검사에서 요청이 거부되었습니다.",
    kind: "general",
  },
  {
    code: "20",
    message: "SERVICE_ACCESS_DENIED_ERROR",
    description: "해당 API 서비스에 대한 이용 권한이 확인되지 않습니다.",
    kind: "auth",
  },
  {
    code: "22",
    message: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
    description: "API 서비스의 일일 호출 허용량을 초과했습니다.",
    kind: "general",
  },
  {
    code: "23",
    message: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR",
    description: "짧은 시간에 많은 요청이 발생하여 초당 호출 허용량(30 TPS)을 초과했습니다.",
    kind: "general",
  },
  {
    code: "29",
    message: "BLACKLIST_IP_ACCESS_ERROR",
    description: "차단된 IP에서 호출한 요청입니다.",
    kind: "general",
  },
  {
    code: "30",
    message: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
    description: "등록되지 않은 API 인증키입니다.",
    kind: "auth",
  },
  {
    code: "31",
    message: "DEADLINE_HAS_EXPIRED_ERROR",
    description: "API 인증키의 사용 기한이 만료되었습니다.",
    kind: "auth",
  },
  // 아래는 docx 원본(2020~2021년) 기준 레거시 코드. 현행 목록에는 없으나 방어적으로 남겨둔다.
  {
    code: "32",
    message: "UNREGISTERED_IP_ERROR",
    description: "등록되지 않은 IP",
    kind: "legacy",
  },
  {
    code: "99",
    message: "UNKNOWN_ERROR",
    description: "기타에러",
    kind: "legacy",
  },
] as const;

/** 정상 처리를 나타내는 `resultCode` 값. */
export const OPEN_API_SUCCESS_CODE = "00";

/** 두 API 공통 제약. */
export const OPEN_API_LIMITS = {
  /** 초당 최대 호출 수 (TPS) */
  maxTps: 30,
  /** 개발계정 일일 호출 허용량. 운영계정은 활용사례 등록 시 증설 가능 */
  dailyQuotaDev: 10_000,
  /** 최대 메시지 사이즈 (byte) */
  maxMessageBytes: 4000,
  /** 평균 응답 시간 (ms) */
  avgResponseMs: 500,
} as const;
