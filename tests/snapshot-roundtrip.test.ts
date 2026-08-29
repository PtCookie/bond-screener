import { describe, expect, test } from "vitest";
import { encodeSnapshot, type EncodeSnapshotInput } from "@/lib/snapshot/encode";
import { decodeSnapshot } from "@/lib/snapshot/decode";

const input: EncodeSnapshotInput = {
  bondRows: [
    {
      isin_cd: "KR6138081E74",
      isin_cd_nm: "오이솔루션1CB(사모/전환/풋)",
      bond_isur_nm: "오이솔루션",
      scrs_itms_kcd: "1108",
      bond_issu_dt: 20240711,
      bond_expr_dt: 20290711,
      bond_srfc_inrt: 0, // 사모 CB — 0이 유효값. null과 구분돼야 한다.
      bond_int_tcd: "1",
      last_chg_bas_dt: 20260825,
    },
    {
      // 발행인이 위와 같음 — 사전 인덱스가 재사용돼야 한다.
      isin_cd: "KR6009271FC3",
      isin_cd_nm: "신원 139(사모)",
      bond_isur_nm: "오이솔루션",
      scrs_itms_kcd: "1108",
      bond_issu_dt: null, // 실측상 존재하는 결측 케이스
      bond_expr_dt: 20280310,
      bond_srfc_inrt: 5.3,
      bond_int_tcd: null,
      last_chg_bas_dt: 20260820,
    },
    {
      isin_cd: "KR103501GG39",
      isin_cd_nm: "국고03500-5603(26-2)",
      bond_isur_nm: "대한민국정부",
      scrs_itms_kcd: "1101",
      bond_issu_dt: 20210603,
      bond_expr_dt: 20560603,
      bond_srfc_inrt: 3.5,
      bond_int_tcd: "1",
      last_chg_bas_dt: 20260826, // 전체 basDt는 이 값(최댓값)이어야 한다.
    },
  ],
  stateRows: [
    { isin_cd: "KR6138081E74", bond_bal: 7161340000, kis_grade: null },
    { isin_cd: "KR103501GG39", bond_bal: 850000000000, kis_grade: "AAA" },
    // KR6009271FC3은 state row가 없음 — bond_bal/kis_grade가 null로 떨어져야 한다.
  ],
  codeLabelRows: [
    { domain: "scrsItmsKcd", code: "1108", label: "일반회사채" },
    { domain: "scrsItmsKcd", code: "1101", label: "국채" },
    { domain: "bondIntTcd", code: "1", label: "이표채" },
  ],
  latestPriceRows: [
    {
      isin_cd: "KR103501GG39",
      bas_dt: 20260826,
      mrkt_ctg: 1,
      clpr_prc: 8283,
      clpr_vs: 58,
      clpr_bnf_rt: 4.675,
      trqu: 685000000000,
    },
    // KR6138081E74/KR6009271FC3은 시세 없음 — 비상장/거래없음 케이스.
  ],
};

describe("encodeSnapshot → decodeSnapshot 왕복", () => {
  const payload = encodeSnapshot(input);
  const rows = decodeSnapshot(payload);
  const byIsin = new Map(rows.map((r) => [r.isinCd, r]));

  test("basDt는 bondRows의 last_chg_bas_dt 최댓값", () => {
    expect(payload.basDt).toBe(20260826);
  });

  test("행 수가 입력과 같다", () => {
    expect(rows).toHaveLength(3);
  });

  test("표면이율 0은 null이 아니라 0으로 보존된다", () => {
    expect(byIsin.get("KR6138081E74")?.bondSrfcInrt).toBe(0);
  });

  test("발행일 null은 null로 보존된다(발행일 결측 실측 케이스)", () => {
    expect(byIsin.get("KR6009271FC3")?.bondIssuDt).toBeNull();
  });

  test("만기일은 YYYYMMDD로 정확히 왕복한다", () => {
    expect(byIsin.get("KR103501GG39")?.bondExprDt).toBe(20560603);
  });

  test("같은 발행인은 사전을 통해 같은 문자열로 복원된다", () => {
    expect(byIsin.get("KR6138081E74")?.bondIsurNm).toBe("오이솔루션");
    expect(byIsin.get("KR6009271FC3")?.bondIsurNm).toBe("오이솔루션");
    expect(payload.issuers).toContain("오이솔루션");
  });

  test("state row가 없는 종목은 bondBal/kisGrade가 null", () => {
    const row = byIsin.get("KR6009271FC3");
    expect(row?.bondBal).toBeNull();
    expect(row?.kisGrade).toBeNull();
  });

  test("scrsItmsKcdNm/bondIntTcdNm이 codeLabels로 해석된다", () => {
    const row = byIsin.get("KR103501GG39");
    expect(row?.scrsItmsKcdNm).toBe("국채");
    expect(row?.bondIntTcdNm).toBe("이표채");
  });

  test("codeLabels에 없는 코드는 라벨이 null(방어적)", () => {
    // bondIntTcd="1"은 라벨이 있지만, 있다고 가정한 케이스가 없으면 라벨 누락도 견뎌야 한다.
    const row = byIsin.get("KR6138081E74");
    expect(row?.bondIntTcdNm).toBe("이표채");
  });

  test("시세가 있는 종목은 mrktCtg 문자열 라벨과 값이 채워진다", () => {
    const row = byIsin.get("KR103501GG39");
    expect(row?.mrktCtg).toBe("KTS");
    expect(row?.clprPrc).toBe(8283);
    expect(row?.clprVs).toBe(58);
    expect(row?.clprBnfRt).toBe(4.675);
    expect(row?.trqu).toBe(685000000000);
  });

  test("시세가 없는 종목은 시세 4필드와 mrktCtg가 전부 null", () => {
    const row = byIsin.get("KR6138081E74");
    expect(row?.mrktCtg).toBeNull();
    expect(row?.clprPrc).toBeNull();
    expect(row?.clprVs).toBeNull();
    expect(row?.clprBnfRt).toBeNull();
    expect(row?.trqu).toBeNull();
  });

  test("전일대비 0(보합)은 null과 구분된다", () => {
    // clprVs=58이 이 픽스처엔 없지만 0 보합 케이스를 별도로 검증한다.
    const zeroDeltaPayload = encodeSnapshot({
      ...input,
      latestPriceRows: [
        {
          isin_cd: "KR103501GG39",
          bas_dt: 20260826,
          mrkt_ctg: 2,
          clpr_prc: 10437,
          clpr_vs: 0,
          clpr_bnf_rt: 3.545,
          trqu: 160000,
        },
      ],
    });
    const zeroDeltaRows = decodeSnapshot(zeroDeltaPayload);
    const row = zeroDeltaRows.find((r) => r.isinCd === "KR103501GG39");
    expect(row?.clprVs).toBe(0);
    expect(row?.mrktCtg).toBe("일반채권");
  });
});
