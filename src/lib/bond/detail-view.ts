/**
 * 상세 페이지의 47개 채권기본정보 필드를 화면용으로 큐레이션·포맷하는 순수 함수 계층.
 * 핵심 필드는 `DETAIL_SECTIONS`로 섹션화하고, 나머지는 "전체 항목" 접이식 영역
 * (`BondAllFields.tsx`)에서 데이터 손실 없이 전부 노출한다.
 *
 * 라벨 정본은 `docs/api/bond-issu-info.md`의 국문명 컬럼. 값 포맷은 새로 만들지 않고
 * `src/lib/screener/format.ts`(fmtYmd/fmtRate/fmtAmount/DASH)를 그대로 재사용한다.
 */
import { DASH, fmtAmount, fmtRate, fmtYmd } from "@/lib/screener/format";
import type { BondDetailField, CodeLabelField } from "./detail";

export type FieldKind = "text" | "ymd" | "rate" | "amount" | "bool" | "codeLabel";

/** 어느 응답 객체(`bond` 정적 필드 vs `state` SCD 이력)에서 값을 꺼내는지. */
export type FieldSource = "bond" | "state";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  source: FieldSource;
}

function bond(key: string, label: string, kind: FieldKind): FieldSpec {
  return { key, label, kind, source: "bond" };
}

function state(key: string, label: string, kind: FieldKind): FieldSpec {
  return { key, label, kind, source: "state" };
}

export interface DetailSection {
  title: string;
  fields: FieldSpec[];
}

/**
 * 핵심 큐레이션 섹션. `state`(SCD Type 2 이력)에서 오는 필드(신용등급 4종, 잔액, 차기·직전
 * 이표일)는 `bond`에는 없는 값이라 `source: "state"`로 명시한다.
 */
export const DETAIL_SECTIONS: DetailSection[] = [
  {
    title: "발행 개요",
    fields: [
      bond("isinCdNm", "ISIN코드명", "text"),
      bond("bondIsurNm", "채권발행인명", "text"),
      bond("srtnCd", "단축코드", "text"),
      bond("itmsNm", "종목명", "text"),
      bond("scrsItmsKcd", "유가증권종목종류", "codeLabel"),
      bond("sicNm", "표준산업분류명", "text"),
      bond("crno", "법인등록번호", "text"),
    ],
  },
  {
    title: "기간·이율",
    fields: [
      bond("bondIssuDt", "채권발행일자", "ymd"),
      bond("bondExprDt", "채권만기일자", "ymd"),
      bond("lstgDt", "상장일자", "ymd"),
      bond("bondSrfcInrt", "채권표면이율", "rate"),
      bond("bondIntTcd", "채권이자유형", "codeLabel"),
      bond("intPayCyclCtt", "이자지급주기", "text"),
      state("nxtmCopnDt", "차기이표일자", "ymd"),
      state("rbfCopnDt", "직전이표일자", "ymd"),
    ],
  },
  {
    title: "금액",
    fields: [
      bond("bondIssuAmt", "채권발행금액", "amount"),
      bond("bondPymtAmt", "채권납입금액", "amount"),
      state("bondBal", "채권잔액", "amount"),
    ],
  },
  {
    title: "신용등급",
    fields: [
      state("kisGrade", "한국신용평가(KIS)", "text"),
      state("kbpGrade", "한국자산평가(KBP)", "text"),
      state("niceGrade", "NICE평가정보", "text"),
      state("fnGrade", "FN", "text"),
    ],
  },
  {
    title: "조건",
    fields: [
      bond("grnDcd", "보증구분", "codeLabel"),
      bond("bondRnknDcd", "채권순위구분", "codeLabel"),
      bond("txtnDcd", "과세구분", "codeLabel"),
      bond("optnTcd", "옵션유형", "codeLabel"),
      bond("pamtRdptMcd", "원금상환방법", "codeLabel"),
      bond("bondOffrMcd", "채권모집방법", "codeLabel"),
    ],
  },
];

/** `DETAIL_SECTIONS`에 이미 노출된 `bond` 소스 키 — "전체 항목"에서 중복 제외용. */
export const CURATED_BOND_KEYS: ReadonlySet<string> = new Set(
  DETAIL_SECTIONS.flatMap((s) => s.fields)
    .filter((f) => f.source === "bond")
    .map((f) => f.key),
);

/**
 * `bond` 응답의 나머지 전체 필드 라벨·종류 — `isinCd`(헤더에 이미 표시)와 `fp`
 * (`toBondDetailFields`가 응답에서 이미 제외)만 빠져 있다. `CURATED_BOND_KEYS`와 합치면
 * `src/lib/bond/columns.ts`의 `BOND_COLUMNS`(fp 제외 46개)와 정확히 일치해야 한다
 * (`tests/bond-detail-view.test.ts`가 교차 검증).
 */
export const ALL_BOND_FIELD_SPECS: Readonly<Record<string, FieldSpec>> = Object.fromEntries(
  (
    [
      bond("isinCdNm", "ISIN코드명", "text"),
      bond("crno", "법인등록번호", "text"),
      bond("bondIsurNm", "채권발행인명", "text"),
      bond("srtnCd", "단축코드", "text"),
      bond("itmsNm", "종목명", "text"),
      bond("sicNm", "표준산업분류명", "text"),
      bond("scrsItmsKcd", "유가증권종목종류", "codeLabel"),
      bond("bondIssuCurCd", "채권발행통화", "codeLabel"),
      bond("bondIssuDt", "채권발행일자", "ymd"),
      bond("bondExprDt", "채권만기일자", "ymd"),
      bond("lstgDt", "상장일자", "ymd"),
      bond("bondSrfcInrt", "채권표면이율", "rate"),
      bond("irtChngDcdNm", "금리변동구분", "text"),
      bond("grnDcd", "보증구분", "codeLabel"),
      bond("bondRnknDcd", "채권순위구분", "codeLabel"),
      bond("optnTcd", "옵션유형", "codeLabel"),
      bond("pclrBondKcd", "특이채권종류", "codeLabel"),
      bond("bondOffrMcd", "채권모집방법", "codeLabel"),
      bond("txtnDcd", "과세구분", "codeLabel"),
      bond("pamtRdptMcd", "원금상환방법", "codeLabel"),
      bond("bondIntTcd", "채권이자유형", "codeLabel"),
      bond("intCmpuMcd", "이자산정방법", "codeLabel"),
      bond("bondRegInstDcd", "채권등록기관구분", "codeLabel"),
      bond("rgtExertMnbdDcd", "권리행사주체구분", "codeLabel"),
      bond("bnkHldyIntPydyDcd", "은행휴일이자지급일구분", "codeLabel"),
      bond("sttrHldyIntPydyDcd", "법정휴일이자지급일구분", "codeLabel"),
      bond("intPayMmntDcd", "이자지급시기구분", "codeLabel"),
      bond("intPayCyclCtt", "이자지급주기", "text"),
      bond("bondIssuAmt", "채권발행금액", "amount"),
      bond("bondPymtAmt", "채권납입금액", "amount"),
      bond("stripsPsblYn", "스트립스채권가능여부", "bool"),
      bond("stripsNm", "스트립스채권명", "text"),
      bond("prisLnkgBondYn", "물가연동채권여부", "bool"),
      bond("crfndYn", "크라우드펀딩여부", "bool"),
      bond("prmncBondYn", "영구채권여부", "bool"),
      bond("qibTrgtScrtYn", "QIB대상증권여부", "bool"),
      bond("elpsIntPayYn", "경과이자지급여부", "bool"),
      bond("piamPayInstNm", "원리금지급기관명", "text"),
      bond("piamPayBrofNm", "원리금지급지점명", "text"),
      bond("issuDptyNm", "발행대리인명", "text"),
      bond("bondUndtInstNm", "채권인수기관명", "text"),
      bond("bondGrnInstNm", "채권보증기관명", "text"),
      bond("cpbdMngCmpyNm", "사채관리회사명", "text"),
      bond("firstSeenBasDt", "최초 확인일", "ymd"),
      bond("lastChgBasDt", "최종 변경일", "ymd"),
    ] satisfies FieldSpec[]
  ).map((spec) => [spec.key, spec]),
);

/** `codeLabel` kind의 값 형태 — `src/lib/bond/detail.ts`의 `CodeLabelField`와 동일. */
function isCodeLabelField(v: unknown): v is CodeLabelField {
  return typeof v === "object" && v !== null && "code" in v;
}

/**
 * 필드 값 1개를 화면 문자열로 바꾼다. `bool`은 0/1이 아니라 이미 `toBondDetailFields`가
 * boolean으로 변환해 둔 값을 받는다("예"/"아니오"로 표시 — `Y`/`N` 원문 대신 한글 표기).
 */
export function formatDetailField(
  value: BondDetailField | string | number | null | undefined,
  kind: FieldKind,
): string {
  if (value === null || value === undefined) return DASH;
  switch (kind) {
    case "ymd":
      return fmtYmd(value as number);
    case "rate":
      return fmtRate(value as number);
    case "amount":
      return fmtAmount(value as number);
    case "bool":
      return value ? "예" : "아니오";
    case "codeLabel":
      return isCodeLabelField(value) ? (value.label ?? value.code) : DASH;
    case "text":
    default:
      return String(value);
  }
}
