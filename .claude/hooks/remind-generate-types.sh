#!/usr/bin/env bash
# PostToolUse hook: wrangler.jsonc가 Edit/Write로 변경되면 pnpm generate-types를
# 잊지 않도록 알린다. worker-configuration.d.ts는 자동 갱신되지 않으며,
# lefthook의 tsc --noEmit(staged 파일 기준)도 이 드리프트를 잡지 못한다.
set -euo pipefail

input="$(cat)"

file_path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"

if [[ -z "$file_path" ]]; then
  exit 0
fi

if [[ "$file_path" =~ wrangler\.jsonc$ ]]; then
  echo "wrangler.jsonc가 변경되었습니다. 'pnpm generate-types'로 worker-configuration.d.ts를 갱신하세요." >&2
  exit 2
fi

exit 0
