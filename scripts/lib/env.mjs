// .dev.vars(우선) 또는 .env에서 BOND_API_SERVICE_KEY를 읽는다.
// .claude/skills/probe-bond-api/scripts/probe.sh와 정확히 같은 규약(우선순위, 인코딩)을 따른다.
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

/** @returns {string} Decoded 인증키. 찾지 못하면 안내 메시지를 출력하고 프로세스를 종료한다. */
export function loadServiceKey() {
  for (const filename of [".dev.vars", ".env"]) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    const match = content
      .split("\n")
      .reverse() // 여러 줄에 같은 키가 있으면 마지막 것을 우선(probe.sh의 tail -n1과 동일 동작)
      .find((line) => line.startsWith("BOND_API_SERVICE_KEY="));
    if (match) {
      let value = match.slice("BOND_API_SERVICE_KEY=".length).trim();
      value = value.replace(/^["']|["']$/g, "");
      if (value) return value;
    }
  }
  console.error(`BOND_API_SERVICE_KEY를 찾을 수 없습니다.

프로젝트 루트에 .dev.vars 파일을 만들고 아래 형식으로 넣으세요:
  BOND_API_SERVICE_KEY="발급받은 인증키(Decoded 값)"

공공데이터포털에서 Decoded 값을 사용해야 합니다 — Encoded 값을 넣으면 이중 인코딩되어 인증에 실패합니다.`);
  process.exit(1);
}
