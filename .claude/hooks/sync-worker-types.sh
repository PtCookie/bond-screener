#!/usr/bin/env bash
# PostToolUse hook: worker-configuration.d.ts는 wrangler가 생성하는 파일이라 소스를
# 고쳐도 자동으로 따라오지 않는다. 아래 세 가지 변경 뒤에 pnpm generate-types를 직접
# 돌려 드리프트를 막는다.
#   - wrangler.jsonc  : 바인딩(D1/R2/ratelimit 등) 추가·변경
#   - .dev.vars/.env  : 시크릿 이름 변경 (NodeJS.ProcessEnv의 Pick 목록에 반영됨)
#   - 의존성 설치·갱신: wrangler 버전이 바뀌면 workerd 런타임 타입도 함께 바뀐다
# lefthook의 tsc --noEmit은 staged 파일만 보므로 이 드리프트를 잡지 못하고, 실제로
# MCP_AUTH_TOKEN 추가분이 한 커밋 늦게 반영된 적이 있다.
set -euo pipefail

input="$(cat)"
project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
types_file="$project_dir/worker-configuration.d.ts"

tool_name="$(jq -r '.tool_name // empty' <<<"$input")"
needs_regen=0

case "$tool_name" in
  Edit | Write | MultiEdit | NotebookEdit)
    file_path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    if [[ "$file_path" =~ wrangler\.jsonc$ ]] ||
      [[ "$file_path" =~ (^|/)\.dev\.vars(\.|$) ]] ||
      [[ "$file_path" =~ (^|/)\.env(\.|$) ]]; then
      needs_regen=1
    fi
    ;;
  Bash)
    command="$(jq -r '.tool_input.command // empty' <<<"$input")"
    # pnpm add/install/remove/update 계열만. generate-types 자신은 걸리지 않는다.
    if [[ "$command" =~ pnpm[[:space:]]+(add|install|i|remove|rm|up|update|dedupe)([[:space:]]|$) ]]; then
      needs_regen=1
    fi
    ;;
esac

[[ "$needs_regen" -eq 1 ]] || exit 0
[[ -f "$types_file" ]] || exit 0

before="$(shasum -a 256 "$types_file" | cut -d' ' -f1)"

if ! output="$(cd "$project_dir" && WRANGLER_SEND_METRICS=false pnpm generate-types 2>&1)"; then
  {
    echo "pnpm generate-types 실패 — worker-configuration.d.ts가 낡았을 수 있습니다."
    echo "직접 실행해 원인을 확인하세요. 마지막 출력:"
    tail -5 <<<"$output"
  } >&2
  exit 2
fi

after="$(shasum -a 256 "$types_file" | cut -d' ' -f1)"

if [[ "$before" != "$after" ]]; then
  jq -nc '{
    systemMessage: "worker-configuration.d.ts를 자동 갱신했습니다 (pnpm generate-types).",
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: "worker-configuration.d.ts가 pnpm generate-types로 갱신되었습니다. 이번 변경과 함께 커밋하세요."
    }
  }'
fi

exit 0
