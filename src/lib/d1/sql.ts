/**
 * `columns.ts`의 컬럼 순서 정본으로부터 json_each 기반 벌크 UPSERT/INSERT SQL을 생성한다.
 *
 * 이 기법을 쓰는 이유: D1은 Worker invocation당 쿼리 50개, 쿼리당 bound parameter 100개로
 * 제한된다. `db.batch()`로 N개 statement를 보내도 N개 쿼리로 카운트되어 우회가 안 되지만,
 * `json_each(?1)`에 배열 하나를 통째로 실으면 **파라미터 1개**로 수백~수천 행을 한 쿼리에
 * 넣을 수 있다. D1(별도 Durable Object)이 JSON을 펼치는 비용은 Worker의 CPU 예산과 무관하다.
 *
 * SQL은 모듈 로드 시 한 번만 문자열로 조립되고 이후 상수로 재사용된다.
 */
import { BOND_COLUMNS, BOND_PRICE_COLUMNS, BOND_STATE_COLUMNS, CODE_LABEL_COLUMNS } from "@/lib/bond/columns";

function jsonEachExtracts(count: number): string {
  return Array.from({ length: count }, (_, i) => `json_extract(value, '$[${i}]')`).join(", ");
}

function buildInsertSelect(table: string, columns: readonly string[], tail: string): string {
  // `WHERE true`는 실제로 아무것도 거르지 않는 더미절이지만 없으면 안 된다 — SQLite 파서가
  // `FROM json_each(?1) ON CONFLICT ...`에서 FROM절이 끝나지 않은 것으로 보고
  // "near 'DO': syntax error"를 낸다(node:sqlite 3.53.1로 실측 확인, WHERE·GROUP BY 등으로
  // FROM절을 명시적으로 닫아야 다음 절 파싱이 시작됨). `INSERT ... SELECT ... FROM x ON CONFLICT`
  // 형태를 쓰는 모든 upsert에 공통되는 문법 함정이라 헬퍼 레벨에서 한 번만 방어한다.
  return (
    `INSERT INTO ${table} (${columns.join(", ")})\n` +
    `SELECT ${jsonEachExtracts(columns.length)}\n` +
    `FROM json_each(?1)\n` +
    `WHERE true\n` +
    tail
  );
}

/** `bond` UPSERT — `isin_cd` 충돌 시 `first_seen_bas_dt`와 `srtn_cd`/`itms_nm`은 덮어쓰지 않는다. */
export const BOND_UPSERT_SQL = buildInsertSelect(
  "bond",
  BOND_COLUMNS,
  `ON CONFLICT(isin_cd) DO UPDATE SET\n` +
    BOND_COLUMNS.filter(
      (col) => col !== "isin_cd" && col !== "first_seen_bas_dt" && col !== "srtn_cd" && col !== "itms_nm",
    )
      .map((col) => `  ${col} = excluded.${col}`)
      .join(",\n") +
    ";",
);

/** `bond_state` 삽입 — `(isin_cd, valid_from)` 충돌 시 아무것도 하지 않는다(같은 날 재실행 idempotent). */
export const BOND_STATE_INSERT_SQL = buildInsertSelect(
  "bond_state",
  BOND_STATE_COLUMNS,
  "ON CONFLICT(isin_cd, valid_from) DO NOTHING;",
);

/** `bond_price` 삽입 — 과거 시세는 사후 변경되지 않으므로 충돌 시 무시만 하면 idempotent. */
export const BOND_PRICE_INSERT_SQL = buildInsertSelect(
  "bond_price",
  BOND_PRICE_COLUMNS,
  "ON CONFLICT(isin_cd, bas_dt, mrkt_ctg) DO NOTHING;",
);

/** `code_label` 사전 충전 — 이미 있는 (domain, code)는 그대로 둔다. */
export const CODE_LABEL_INSERT_SQL = buildInsertSelect(
  "code_label",
  CODE_LABEL_COLUMNS,
  "ON CONFLICT(domain, code) DO UPDATE SET label = excluded.label;",
);

/**
 * `bond_state`의 현재 유효 행(`valid_to IS NULL`)을 마감한다.
 * `isinCds` 목록은 json_each로 넘기되 이 쿼리는 UPDATE라 SELECT 서브쿼리 형태로 쓴다.
 */
export const BOND_STATE_CLOSE_SQL =
  `UPDATE bond_state SET valid_to = ?2\n` +
  `WHERE valid_to IS NULL\n` +
  `  AND isin_cd IN (SELECT value FROM json_each(?1));`;

/** `bond` 지문 조회 — `?1`에 isin_cd 배열(JSON)을 실어 파라미터 1개로 다건 조회. */
export const BOND_FINGERPRINT_SELECT_SQL =
  `SELECT isin_cd, fp FROM bond\n` + `WHERE isin_cd IN (SELECT value FROM json_each(?1));`;

/** `bond_state`의 현재 유효 행 값 조회 — 변경분 비교용. */
export const BOND_STATE_CURRENT_SELECT_SQL =
  `SELECT ${BOND_STATE_COLUMNS.join(", ")} FROM bond_state\n` +
  `WHERE valid_to IS NULL AND isin_cd IN (SELECT value FROM json_each(?1));`;

/**
 * 시세 sync가 신규 상장 종목의 `srtn_cd`/`itms_nm`을 NULL일 때만 채우는 UPDATE.
 * `?1`에 `[isin_cd, srtn_cd, itms_nm]` 3중 배열의 배열(JSON)을 실어 페이지 전체를
 * **쿼리 1개**로 처리한다 — 종목마다 별도 UPDATE를 보내면 시세 1페이지(332건)만으로도
 * invocation당 쿼리 50개 예산을 넘긴다.
 */
export const BOND_FILL_SRTN_ITMS_SQL =
  `UPDATE bond\n` +
  `SET srtn_cd = j.srtn_cd, itms_nm = j.itms_nm\n` +
  `FROM (\n` +
  `  SELECT json_extract(value, '$[0]') AS isin_cd,\n` +
  `         json_extract(value, '$[1]') AS srtn_cd,\n` +
  `         json_extract(value, '$[2]') AS itms_nm\n` +
  `  FROM json_each(?1)\n` +
  `) AS j\n` +
  `WHERE bond.isin_cd = j.isin_cd AND bond.srtn_cd IS NULL;`;

// ---------------------------------------------------------------------------
// 종목 상세 · 시계열 조회 (읽기 전용). 위 상수들은 cron 쓰기 경로용이고, 아래는
// `src/lib/d1/detail-repo.ts`/`price-repo.ts`의 `fetchBondPriceSeries`가 쓴다.
// ---------------------------------------------------------------------------

/** `bond` 단건 조회 — ISIN 정확일치. `?1`에 isin_cd. */
export const BOND_BY_ISIN_SQL = `SELECT ${BOND_COLUMNS.join(", ")} FROM bond WHERE isin_cd = ?1;`;

/** 단축코드(srtnCd) → isin_cd 해석. `idx_bond_srtn_cd`(partial UNIQUE)를 탄다. `?1`에 srtn_cd. */
export const BOND_ISIN_BY_SRTN_SQL = `SELECT isin_cd FROM bond WHERE srtn_cd = ?1;`;

/** `bond_state` 이력 전체 — `valid_from` 내림차순(최신이 먼저). `?1`에 isin_cd. */
export const BOND_STATE_HISTORY_SQL =
  `SELECT ${BOND_STATE_COLUMNS.join(", ")} FROM bond_state\n` + `WHERE isin_cd = ?1\n` + `ORDER BY valid_from DESC;`;

/**
 * 종목의 "최신" 시세 — 최신 `bas_dt` 하루치 전부(같은 날 KTS·일반채권 두 시장에
 * 동시 존재하는 사례가 있어(`0001_init.sql`의 `bond_price` PK 주석) 여러 행일 수 있다).
 * `?1`에 isin_cd.
 */
export const BOND_LATEST_PRICE_SQL =
  `SELECT ${BOND_PRICE_COLUMNS.join(", ")} FROM bond_price\n` +
  `WHERE isin_cd = ?1 AND bas_dt = (SELECT MAX(bas_dt) FROM bond_price WHERE isin_cd = ?1);`;

/**
 * 종목 시계열 — 날짜 범위(포함) + 선택적 시장 필터. `bond_price` PK가
 * `(isin_cd, bas_dt, mrkt_ctg)`라 `isin_cd` 등호 + `bas_dt` 범위는 보조 인덱스 없이
 * PK 레인지 스캔이 된다(`0002_indexes.sql` 주석 참고). `LIMIT`은 호출부가 상수로 건다.
 *
 * `?1`=isin_cd, `?2`=from(bas_dt), `?3`=to(bas_dt), `?4`=limit.
 */
export const BOND_PRICE_SERIES_SQL =
  `SELECT ${BOND_PRICE_COLUMNS.join(", ")} FROM bond_price\n` +
  `WHERE isin_cd = ?1 AND bas_dt BETWEEN ?2 AND ?3\n` +
  `ORDER BY bas_dt ASC, mrkt_ctg ASC\n` +
  `LIMIT ?4;`;

/** `BOND_PRICE_SERIES_SQL`에 시장 필터(`mrkt_ctg` 정수 코드)를 추가한 변형. `?4`=mrkt_ctg, `?5`=limit. */
export const BOND_PRICE_SERIES_BY_MARKET_SQL =
  `SELECT ${BOND_PRICE_COLUMNS.join(", ")} FROM bond_price\n` +
  `WHERE isin_cd = ?1 AND bas_dt BETWEEN ?2 AND ?3 AND mrkt_ctg = ?4\n` +
  `ORDER BY bas_dt ASC, mrkt_ctg ASC\n` +
  `LIMIT ?5;`;

/**
 * `code_label` 다건 조회 — `(domain, code)` 쌍 배열을 `json_each(?1)`로 파라미터 1개에
 * 실어 조회한다. `BOND_FILL_SRTN_ITMS_SQL`과 같은 `json_extract(value, '$[n]')` 패턴.
 * `?1`에 `[[domain, code], ...]` 형태의 JSON 배열.
 */
export const CODE_LABEL_BY_PAIRS_SQL =
  `SELECT cl.domain, cl.code, cl.label\n` +
  `FROM code_label cl\n` +
  `JOIN (\n` +
  `  SELECT json_extract(value, '$[0]') AS domain, json_extract(value, '$[1]') AS code\n` +
  `  FROM json_each(?1)\n` +
  `) AS j ON cl.domain = j.domain AND cl.code = j.code;`;
