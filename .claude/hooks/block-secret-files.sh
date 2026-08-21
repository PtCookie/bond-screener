#!/usr/bin/env bash
# PreToolUse hook: Read/Edit/Write/Grep 도구가 .dev.vars* 또는 .env* 파일에
# 접근하는 것을 차단한다. serviceKey 등 시크릿이 대화 컨텍스트나 커밋 diff로
# 유출되는 것을 막기 위함. 자세한 배경은 AGENTS.md의 "Cloudflare 배포" 절 참고.
set -euo pipefail

input="$(cat)"

file_path="$(jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // empty' <<<"$input")"

if [[ -z "$file_path" ]]; then
  exit 0
fi

if [[ "$file_path" =~ (^|/)\.dev\.vars(\.|$) ]] || [[ "$file_path" =~ (^|/)\.env(\.|$) ]]; then
  echo "차단됨: '$file_path'는 시크릿 파일입니다 (serviceKey 등이 평문으로 저장됨)." >&2
  echo "이 파일을 직접 읽거나 수정할 수 없습니다. 값이 필요하면 사용자에게 직접 확인을 요청하세요." >&2
  echo "새 시크릿 파일 생성이 필요하면 사용자가 직접 만들도록 안내하세요 (.dev.vars 형식은 AGENTS.md 참고)." >&2
  exit 2
fi

exit 0
