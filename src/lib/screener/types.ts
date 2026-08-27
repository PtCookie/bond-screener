import type { RowData, TableFeatures } from "@tanstack/react-table";

/**
 * 스크리너 화면에 표시할 채권 1건. 실 데이터 연동 전까지는 mock.ts의 리터럴로만 채워진다.
 *
 * 코드와 라벨을 함께 들고 가는 이유: 지금은 필터가 비활성 껍데기라 안 쓰지만, 나중에
 * 필터가 살아날 때 라벨 문자열 매칭이 아니라 코드로 비교하게 하기 위함(라벨은 표시 전용).
 */
export interface ScreenerRow {
  /** ISIN 코드. React key(getRowId)로도 사용. */
  isinCd: string;
  isinCdNm: string | null;
  bondIsurNm: string | null;
  scrsItmsKcd: string | null;
  scrsItmsKcdNm: string | null;
  /** YYYYMMDD 정수. */
  bondIssuDt: number | null;
  bondExprDt: number | null;
  /** 표면이율(%). 0이 유효값이므로 null과 반드시 구분해야 한다. */
  bondSrfcInrt: number | null;
  kisGrade: string | null;
  bondBal: number | null;
  bondIntTcd: string | null;
  bondIntTcdNm: string | null;
  /** "KTS" | "일반채권" | "소액채권". 향후 시장별 뷰 확장 대비 — 이번 UI에는 표시하지 않음. */
  mrktCtg: string | null;
  clprPrc: number | null;
  clprVs: number | null;
  clprBnfRt: number | null;
  trqu: number | null;
}

// 원본 ColumnMeta 시그니처와 제네릭을 맞추기 위한 선언 병합. 본문(align)은 제네릭을 쓰지 않는다.
/* eslint-disable @typescript-eslint/no-unused-vars */
declare module "@tanstack/react-table" {
  interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue = unknown> {
    /** 숫자 컬럼의 정렬 방향을 헤더/셀에 함께 전달하기 위한 표시용 메타. */
    align?: "start" | "end";
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
