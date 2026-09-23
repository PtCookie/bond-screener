// 백필 전용 다중 VALUES INSERT 생성기.
//
// cron 파이프라인(src/lib/d1/sql.ts)은 json_each를 쓰지만, 여기서는 쓰지 않는다 —
// `wrangler d1 execute --file`은 Worker를 거치지 않아 쿼리 50개/invocation, bound parameter
// 100개/쿼리 제한이 애초에 적용되지 않으므로, 더 단순한 평범한 다중 VALUES 문이면 충분하다.

/** SQLite 리터럴로 값 하나를 이스케이프한다. */
function toLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  // 문자열: 작은따옴표를 두 배로 이스케이프.
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * rows를 다중 VALUES INSERT 문 여러 개로 직렬화한다. **행 개수가 아니라 statement의
 * 바이트 크기를 기준으로 나눈다** — D1의 "Maximum SQL statement length: 100,000 bytes"
 * 제한 때문이다. 컬럼이 많은 테이블(bond 47개)에서 고정 행 개수(예: 500행)로 나누면
 * 컬럼 수·필드 길이에 따라 187KB까지도 나와 실제로 "SQLITE_TOOBIG"이 났다(실측).
 * 컬럼 수가 다른 여러 테이블(bond/bond_state/bond_price/code_label)에 공통으로 안전하려면
 * 행 개수가 아니라 바이트 예산으로 잘라야 한다.
 *
 * @param {string} table
 * @param {readonly string[]} columns
 * @param {readonly (string|number|null)[][]} rows
 * @param {{ conflictClause?: string; maxStatementBytes?: number }} [options]
 * @returns {string} 세미콜론으로 끝나는 INSERT 문들을 개행으로 이은 문자열
 */
export function buildMultiValuesInsert(table, columns, rows, options = {}) {
  // 100,000 byte 한도의 80%만 채워 안전마진을 둔다 — 이스케이프로 늘어나는 문자열
  // (작은따옴표 두 배 처리)이나 예상보다 긴 필드값에 대비.
  const { conflictClause = "ON CONFLICT DO NOTHING", maxStatementBytes = 80_000 } = options;
  const colList = columns.join(", ");
  const prefix = `INSERT INTO ${table} (${colList})\nVALUES\n  `;
  const suffix = `\n${conflictClause};`;
  const overheadBytes = Buffer.byteLength(prefix, "utf8") + Buffer.byteLength(suffix, "utf8");

  const statements = [];
  let currentLiterals = [];
  let currentBytes = overheadBytes;

  const flush = () => {
    if (currentLiterals.length === 0) return;
    statements.push(prefix + currentLiterals.join(",\n  ") + suffix);
    currentLiterals = [];
    currentBytes = overheadBytes;
  };

  for (const row of rows) {
    const literal = `(${row.map(toLiteral).join(", ")})`;
    const literalBytes = Buffer.byteLength(literal, "utf8") + 4; // ",\n  " 구분자 근사치

    if (currentLiterals.length > 0 && currentBytes + literalBytes > maxStatementBytes) {
      flush();
    }
    currentLiterals.push(literal);
    currentBytes += literalBytes;

    if (currentBytes > maxStatementBytes) {
      // 행 하나가 예산을 넘는 극단적 케이스(매우 긴 텍스트 필드) — 그래도 그 행만은
      // 통째로 담아야 하므로 다음 행 전에 바로 flush한다.
      flush();
    }
  }
  flush();

  return statements.join("\n\n");
}

/**
 * `bond.srtn_cd`/`itms_nm`처럼 "NULL인 행에만 채우는" 조건부 UPDATE를 다중 행으로
 * 직렬화한다 — cron의 `BOND_FILL_SRTN_ITMS_SQL`(`src/lib/d1/sql.ts`)과 같은 의미이지만
 * `wrangler d1 execute --file`은 Worker의 `json_each(?1)` 바인딩 경로를 쓸 수 없으므로
 * `WITH j(...) AS (VALUES ...)`로 값을 인라인한다. `buildMultiValuesInsert`와 동일하게
 * 행 개수가 아니라 statement 바이트 크기로 나눈다(100,000바이트 `SQLITE_TOOBIG` 회피).
 *
 * @param {string} table
 * @param {string} keyColumn 매칭에 쓰는 컬럼(예: 'isin_cd')
 * @param {readonly string[]} fillColumns NULL일 때만 채울 컬럼들(예: ['srtn_cd', 'itms_nm'])
 * @param {readonly (string|number|null)[][]} rows 각 행은 `[keyValue, ...fillValues]` 순서
 * @param {{ maxStatementBytes?: number }} [options]
 * @returns {string}
 */
export function buildBulkFillUpdate(table, keyColumn, fillColumns, rows, options = {}) {
  const { maxStatementBytes = 80_000 } = options;
  const colList = [keyColumn, ...fillColumns].join(", ");
  const setClause = fillColumns.map((c) => `${c} = j.${c}`).join(", ");
  const prefix = `WITH j(${colList}) AS (\n  VALUES\n  `;
  const suffix =
    `\n)\nUPDATE ${table}\n` +
    `SET ${setClause}\n` +
    `FROM j\n` +
    `WHERE ${table}.${keyColumn} = j.${keyColumn} AND ${table}.${fillColumns[0]} IS NULL;`;
  const overheadBytes = Buffer.byteLength(prefix, "utf8") + Buffer.byteLength(suffix, "utf8");

  const statements = [];
  let currentLiterals = [];
  let currentBytes = overheadBytes;

  const flush = () => {
    if (currentLiterals.length === 0) return;
    statements.push(prefix + currentLiterals.join(",\n  ") + suffix);
    currentLiterals = [];
    currentBytes = overheadBytes;
  };

  for (const row of rows) {
    const literal = `(${row.map(toLiteral).join(", ")})`;
    const literalBytes = Buffer.byteLength(literal, "utf8") + 4;

    if (currentLiterals.length > 0 && currentBytes + literalBytes > maxStatementBytes) {
      flush();
    }
    currentLiterals.push(literal);
    currentBytes += literalBytes;

    if (currentBytes > maxStatementBytes) {
      flush();
    }
  }
  flush();

  return statements.join("\n\n");
}
