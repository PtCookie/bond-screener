/**
 * `/api/snapshot/*` 응답 픽스처. `encodeSnapshot`(`src/lib/snapshot/encode.ts`)을 그대로
 * 통과시켜 만들기 때문에 실제 스냅샷 v2 포맷과 항상 일치한다 — 포맷이 바뀌면 픽스처도
 * 자동으로 따라간다. `useScreenerData`/`snapshot/client.ts`/`BondScreener` 통합 테스트가
 * 공유한다.
 */
import { encodeSnapshot, type EncodeSnapshotInput } from "@/lib/snapshot/encode";
import type { SnapshotIndex } from "@/lib/r2/price-delta";
import type { SnapshotPayload } from "@/lib/snapshot/format";

export interface SnapshotFixtureBond {
  isinCd: string;
  isinCdNm: string;
  bondIsurNm: string;
  scrsItmsKcd?: string | null;
  bondIssuDt?: number | null;
  bondExprDt?: number | null;
  bondSrfcInrt?: number | null;
  bondIntTcd?: string | null;
  bondBal?: number | null;
  kisGrade?: string | null;
  lastChgBasDt: number;
}

const DEFAULT_BOND: SnapshotFixtureBond = {
  isinCd: "KR6000011D36",
  isinCdNm: "테스트채권",
  bondIsurNm: "테스트발행사",
  scrsItmsKcd: "01",
  bondIssuDt: 20200101,
  bondExprDt: 20250101,
  bondSrfcInrt: 3.5,
  bondIntTcd: "01",
  bondBal: 100_000_000_000,
  kisGrade: "AAA",
  lastChgBasDt: 20260828,
};

export function makeSnapshotPayload(bonds: SnapshotFixtureBond[] = [DEFAULT_BOND]): SnapshotPayload {
  const input: EncodeSnapshotInput = {
    bondRows: bonds.map((b) => ({
      isin_cd: b.isinCd,
      isin_cd_nm: b.isinCdNm,
      bond_isur_nm: b.bondIsurNm,
      scrs_itms_kcd: b.scrsItmsKcd ?? null,
      bond_issu_dt: b.bondIssuDt ?? null,
      bond_expr_dt: b.bondExprDt ?? null,
      bond_srfc_inrt: b.bondSrfcInrt ?? null,
      bond_int_tcd: b.bondIntTcd ?? null,
      last_chg_bas_dt: b.lastChgBasDt,
    })),
    stateRows: bonds.map((b) => ({ isin_cd: b.isinCd, bond_bal: b.bondBal ?? null, kis_grade: b.kisGrade ?? null })),
    codeLabelRows: [],
    latestPriceRows: [],
  };
  return encodeSnapshot(input);
}

export function makeSnapshotIndex(
  payload: SnapshotPayload,
  priceDeltas: SnapshotIndex["priceDeltas"] = [],
): SnapshotIndex {
  return {
    generatedAt: new Date(0).toISOString(),
    bond: { key: `snapshot/bond/${payload.basDt}.json`, basDt: payload.basDt, count: payload.cols[0]?.length ?? 0 },
    priceDeltas,
  };
}
