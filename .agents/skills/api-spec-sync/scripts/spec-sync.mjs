#!/usr/bin/env node
/**
 * docs/api/*.md 명세와 src/api/*.ts 타입이 1:1로 대응하는지 정적으로 검사한다.
 * 네트워크 호출 없음, 의존성 없음(Node 표준 라이브러리만 사용).
 *
 * 이 스크립트는 범용 마크다운/TS 파서가 아니라 이 리포지터리의 문서·코드
 * 컨벤션(테이블 컬럼 순서, 인터페이스 형태)에 맞춰 튜닝되어 있다. docs/api/
 * 또는 src/api/의 구조가 크게 바뀌면 이 스크립트도 함께 갱신해야 한다.
 *
 * exit 0: 불일치 없음 / exit 1: 불일치 있음 (findings를 stdout에 출력)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------- 마크다운 테이블 파싱 ----------

/** heading부터 다음 '## '/'### ' heading(또는 EOF) 전까지의 섹션 텍스트를 잘라낸다. */
function sliceSection(text, headingRegex) {
  const startMatch = headingRegex.exec(text);
  if (!startMatch) return null;
  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const nextHeading = /\n#{2,3} /.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

/**
 * 테이블 행에서 셀 배열을 뽑는다. 첫/끝 빈 셀(leading/trailing '|')은 제거.
 * 헤더 구분선(`| --- | --- |`)과 헤더 행 자체는 호출부에서 제외해야 한다.
 */
function parseTableRows(sectionText) {
  const lines = sectionText.split("\n").filter((l) => l.trim().startsWith("|"));
  const rows = [];
  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === ""));
    if (cells.length === 0) continue;
    if (/^-+$/.test(cells[0].replace(/[^-]/g, "") || "") && cells.every((c) => /^-+$/.test(c))) continue; // 구분선
    if (cells[0] === "영문명") continue; // 헤더 행
    rows.push(cells);
  }
  return rows;
}

/** 백틱으로 감싼 필드명(예: `` `basDt` ``)에서 순수 이름만 추출. 아니면 null. */
function fieldNameOf(cell) {
  const m = /^`([a-zA-Z0-9_]+)`$/.exec(cell);
  return m ? m[1] : null;
}

// ---------- TypeScript 인터페이스 파싱 ----------

/**
 * `interface <name> ... { ... }` (또는 `interface <name> extends X { ... }`) 본문을
 * 중괄호 깊이를 세어 잘라낸다. 제네릭·유니온 등 복잡한 형태는 지원하지 않는다.
 */
function extractInterfaceBody(text, name) {
  const headerRe = new RegExp(`interface\\s+${name}\\b[^{]*\\{`);
  const m = headerRe.exec(text);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth > 0 && i < text.length) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    i++;
  }
  return text.slice(start, i - 1);
}

/** 인터페이스 본문에서 `fieldName: Type;` 형태의 필드명·타입을 추출 (주석 라인 제외). */
function parseInterfaceFields(body) {
  const fields = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("/**") || line.startsWith("*") || line.startsWith("//")) continue;
    const m = /^(\w+)\??:\s*([^;]+);/.exec(line);
    if (m) fields.push({ name: m[1], type: m[2].trim() });
  }
  return fields;
}

// ---------- 데이터 로드 ----------

const issuMd = read("docs/api/bond-issu-info.md");
const priceMd = read("docs/api/bond-price-info.md");
const readmeMd = read("docs/api/README.md");
const issuTs = read("src/api/bond-issu-info.ts");
const priceTs = read("src/api/bond-price-info.ts");
const commonTs = read("src/api/common.ts");

const findings = [];

// ---------- 1. 채권기본정보 응답 아이템 필드 diff ----------
{
  const section = sliceSection(issuMd, /### 아이템[^\n]*\n/);
  const docFields = new Set(parseTableRows(section).map((c) => fieldNameOf(c[0])).filter(Boolean));

  const body = extractInterfaceBody(issuTs, "BondBasiInfoItem");
  const tsFields = new Set(parseInterfaceFields(body ?? "").map((f) => f.name));

  for (const f of docFields) if (!tsFields.has(f)) findings.push(`[issu] docs에는 있는데 BondBasiInfoItem에 없음: ${f}`);
  for (const f of tsFields) if (!docFields.has(f)) findings.push(`[issu] BondBasiInfoItem에는 있는데 docs에 없음: ${f}`);
}

// ---------- 2. 채권시세정보 응답 아이템 필드 diff + NumericLike 검사 ----------
{
  const section = sliceSection(priceMd, /### 아이템[^\n]*\n/);
  const rows = parseTableRows(section);
  const docFields = new Map(); // name -> swaggerType
  for (const cells of rows) {
    const name = fieldNameOf(cells[0]);
    if (name) docFields.set(name, cells[4]); // 컬럼: 영문명|국문명|크기|구분|타입(Swagger)|샘플|설명
  }

  const body = extractInterfaceBody(priceTs, "BondPriceInfoItem");
  const tsFields = new Map((parseInterfaceFields(body ?? "")).map((f) => [f.name, f.type]));

  for (const f of docFields.keys()) if (!tsFields.has(f)) findings.push(`[price] docs에는 있는데 BondPriceInfoItem에 없음: ${f}`);
  for (const f of tsFields.keys()) if (!docFields.has(f)) findings.push(`[price] BondPriceInfoItem에는 있는데 docs에 없음: ${f}`);

  for (const [name, swaggerType] of docFields) {
    const tsType = tsFields.get(name);
    if (tsType === undefined) continue;
    if (swaggerType === "number" && tsType !== "NumericLike") {
      findings.push(`[price] ${name}은 Swagger상 number인데 타입이 NumericLike가 아님 (현재: ${tsType})`);
    }
    if (swaggerType === "string" && tsType === "NumericLike") {
      findings.push(`[price] ${name}은 Swagger상 string인데 NumericLike로 선언됨 (과잉 일반화 가능성)`);
    }
  }
}

// ---------- 3. 채권시세정보 요청 파라미터 — 문서화된 20개 필터 파라미터와 정확히 일치 ----------
{
  const section = sliceSection(priceMd, /## 요청 파라미터\n/);
  const rows = parseTableRows(section);
  const commonParams = new Set(["serviceKey", "numOfRows", "pageNo", "resultType"]);
  const docFilterParams = new Set(
    rows.map((c) => fieldNameOf(c[0])).filter((n) => n && !commonParams.has(n)),
  );

  const body = extractInterfaceBody(priceTs, "BondPriceInfoRequest");
  const allTsFields = new Set(parseInterfaceFields(body ?? "").map((f) => f.name));
  const tsFilterParams = new Set([...allTsFields].filter((n) => !commonParams.has(n)));

  for (const f of docFilterParams) if (!tsFilterParams.has(f)) findings.push(`[price] docs 요청 파라미터에는 있는데 BondPriceInfoRequest에 없음: ${f}`);
  for (const f of tsFilterParams) if (!docFilterParams.has(f)) findings.push(`[price] BondPriceInfoRequest에는 있는데 docs 요청 파라미터에 없음: ${f}`);

  if (docFilterParams.size !== 20) {
    findings.push(`[price] docs 요청 파라미터표의 필터 파라미터 수가 20개가 아님 (현재 ${docFilterParams.size}개) — AGENTS.md/README.md 서술과 불일치 가능`);
  }
}

// ---------- 4. 에러코드 — README.md 현행 표 ↔ common.ts OPEN_API_RESULT_CODES(legacy 제외) ----------
{
  const section = sliceSection(readmeMd, /### 현행 \(openapi\.do 기준, 2종 API 공통\)\n/);
  const rows = parseTableRows(section).filter((c) => c.length >= 2 && /^`.+`$/.test(c[0]));
  const docCodes = rows.map((c) => ({
    code: c[0].replace(/`/g, ""),
    message: c[1].trim(),
  }));

  const arrayMatch = /OPEN_API_RESULT_CODES:[^=]*=\s*\[([\s\S]*?)\]\s*as const;/.exec(commonTs);
  const tsEntries = [];
  if (arrayMatch) {
    const entryRe = /\{\s*code:\s*"([^"]+)",\s*message:\s*"([^"]+)",[\s\S]*?kind:\s*"([^"]+)",?\s*\}/g;
    let m;
    while ((m = entryRe.exec(arrayMatch[1]))) {
      tsEntries.push({ code: m[1], message: m[2], kind: m[3] });
    }
  }
  const tsCurrent = tsEntries.filter((e) => e.kind !== "legacy");

  if (docCodes.length !== tsCurrent.length) {
    findings.push(`[error-codes] README.md 현행 표 ${docCodes.length}건 vs common.ts 현행(non-legacy) ${tsCurrent.length}건 — 개수 불일치`);
  }
  const tsSet = new Set(tsCurrent.map((e) => `${e.code}:${e.message}`));
  for (const d of docCodes) {
    const key = `${d.code}:${d.message}`;
    if (!tsSet.has(key)) findings.push(`[error-codes] README.md에는 있는데 common.ts에 없음(또는 kind가 legacy로 잘못 분류): ${key}`);
  }
}

// ---------- 결과 ----------
if (findings.length === 0) {
  console.log("불일치 없음 — docs/api/*.md ↔ src/api/*.ts 정합성 OK");
  process.exit(0);
} else {
  console.log(`불일치 ${findings.length}건 발견:\n`);
  for (const f of findings) console.log(`  - ${f}`);
  process.exit(1);
}
