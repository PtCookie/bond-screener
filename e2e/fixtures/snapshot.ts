/**
 * `/api/snapshot/*` 응답을 `page.route()`로 모킹하는 E2E 픽스처. `pnpm seed:local`
 * (D1/R2 로컬 시딩, `.backfill/` 319MB 필요) 없이도 스크리너 화면을 결정론적으로
 * 검증하기 위함이다 — AGENTS.md "데이터 계층" 절 참고.
 *
 * `encodeSnapshot`을 그대로 import해서 페이로드를 만든다(손으로 흉내내지 않음) — 스냅샷
 * v2 포맷이 바뀌면 이 픽스처도 자동으로 따라간다. `src/lib/snapshot/encode.ts`는 `@/`
 * 별칭을 쓰지 않게 작성돼 있어(AGENTS.md) 이 파일처럼 Playwright 런타임(별도 tsconfig
 * paths 해석 없이 esbuild로 직접 변환)에서도 상대 경로로 문제없이 import된다. `SnapshotIndex`
 * 타입만 `import type`으로 가져온다 — 타입 전용 import는 완전히 소거되므로, 그 모듈이
 * 내부적으로 `@/` 별칭을 쓰더라도(`src/lib/r2/price-delta.ts`) 런타임에 실제로 로드되지
 * 않아 별칭 해석 문제와 무관하다.
 */
import type { Page } from "@playwright/test";
import { encodeSnapshot, type EncodeSnapshotInput } from "../../src/lib/snapshot/encode";
import type { SnapshotIndex } from "../../src/lib/r2/price-delta";

export interface MockBond {
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
  lastChgBasDt?: number;
}

const DEFAULT_BAS_DT = 20260828;

function buildPayload(bonds: MockBond[]) {
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
      last_chg_bas_dt: b.lastChgBasDt ?? DEFAULT_BAS_DT,
    })),
    stateRows: bonds.map((b) => ({ isin_cd: b.isinCd, bond_bal: b.bondBal ?? null, kis_grade: b.kisGrade ?? null })),
    codeLabelRows: [],
    latestPriceRows: [],
  };
  return encodeSnapshot(input);
}

/**
 * `/api/snapshot/index`·`/api/snapshot/bond/{basDt}`를 모킹한다. 델타는 항상 0건 —
 * 델타까지 필요한 시나리오는 없어서(스크리너 화면은 base만으로 충분히 검증 가능) 굳이
 * 채우지 않는다.
 */
export async function mockSnapshot(page: Page, bonds: MockBond[]): Promise<void> {
  const payload = buildPayload(bonds);
  const index: SnapshotIndex = {
    generatedAt: new Date(0).toISOString(),
    bond: { key: `snapshot/bond/${payload.basDt}.json`, basDt: payload.basDt, count: bonds.length },
    priceDeltas: [],
  };

  await page.route("**/api/snapshot/index", (route) => route.fulfill({ json: index }));
  await page.route(`**/api/snapshot/bond/${payload.basDt}`, (route) => route.fulfill({ json: payload }));
}

/** `/api/snapshot/index` 요청 자체를 실패시킨다 — 에러 화면 검증용. */
export async function mockSnapshotFailure(page: Page, status = 500): Promise<void> {
  await page.route("**/api/snapshot/index", (route) => route.fulfill({ status, body: "" }));
}

/** 이름이 겹치지 않는 30건 픽스처 — 검색/필터/정렬/페이지네이션 시나리오에 공용으로 쓴다. */
export function makeBonds(count = 30): MockBond[] {
  return Array.from({ length: count }, (_, i) => ({
    isinCd: `KR${String(i).padStart(10, "0")}`,
    isinCdNm: `유일채권${i}`,
    bondIsurNm: i % 2 === 0 ? "삼성전자" : "카카오뱅크",
    bondExprDt: 20270101 + i,
    bondSrfcInrt: 3 + i * 0.01,
    kisGrade: i < 20 ? "AAA" : "BBB",
    bondIntTcd: "01",
  }));
}
