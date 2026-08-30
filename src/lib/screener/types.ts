import type { RowData, TableFeatures } from "@tanstack/react-table";

/**
 * 스크리너 화면에 표시할 채권 1건. `decodeSnapshot`(`src/lib/snapshot/decode.ts`)이
 * R2 스냅샷을 이 타입으로 푼다.
 *
 * 코드와 라벨을 함께 들고 가는 이유: `src/lib/screener/filters.ts`의 다중선택 필터가
 * 라벨 문자열이 아니라 코드로 비교하기 위함(라벨은 표시 전용).
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
  /** "KTS" | "일반채권" | "소액채권". 표에는 표시하지 않지만 시장구분 필터가 사용한다. */
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
