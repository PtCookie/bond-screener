#!/usr/bin/env bash
# 채권기본정보/채권시세정보 오픈API를 실제로 호출하고 응답을 정규화해서 보여준다.
#
# 사용법:
#   probe.sh issu  [--raw] key=value ...   (basDt=, crno=, isinCd= 중 최소 하나 필요)
#   probe.sh price [--raw] key=value ...   (모든 파라미터 옵션)
#
# 예:
#   probe.sh price basDt=20260820 numOfRows=1
#   probe.sh issu isinCd=KR101501D868
#
# .dev.vars(우선) 또는 .env 에서 BOND_API_SERVICE_KEY 값을 읽는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

usage() {
  cat >&2 <<'EOF'
사용법: probe.sh <issu|price> [--raw] key=value ...

  issu   채권기본정보 (GetBondIssuInfoService_V2 / getBondBasiInfo_V2)
         basDt=, crno=, isinCd= 중 최소 하나 필수
  price  채권시세정보 (GetBondSecuritiesInfoService / getBondPriceInfo)
         모든 파라미터 옵션

  --raw  가공 없이 원문 JSON 그대로 출력

예:
  probe.sh price basDt=20260820 numOfRows=1
  probe.sh issu isinCd=KR101501D868
EOF
  exit 1
}

[[ $# -ge 1 ]] || usage
kind="$1"; shift

case "$kind" in
  issu)
    BASE_URL="https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2"
    OPERATION="getBondBasiInfo_V2"
    ;;
  price)
    BASE_URL="https://apis.data.go.kr/1160100/service/GetBondSecuritiesInfoService"
    OPERATION="getBondPriceInfo"
    ;;
  *)
    echo "알 수 없는 종류: '$kind' (issu 또는 price만 가능)" >&2
    usage
    ;;
esac

raw=0
declare -a kv_args=()
for arg in "$@"; do
  if [[ "$arg" == "--raw" ]]; then
    raw=1
  elif [[ "$arg" == *"="* ]]; then
    kv_args+=("$arg")
  else
    echo "잘못된 인자: '$arg' (key=value 형식이어야 함)" >&2
    usage
  fi
done

# --- 인증키 로드: .dev.vars 우선, 없으면 .env ---
service_key=""
for envfile in "$PROJECT_ROOT/.dev.vars" "$PROJECT_ROOT/.env"; do
  if [[ -f "$envfile" ]]; then
    line="$(grep -E '^BOND_API_SERVICE_KEY=' "$envfile" | tail -n1 || true)"
    if [[ -n "$line" ]]; then
      service_key="${line#BOND_API_SERVICE_KEY=}"
      # 앞뒤 큰따옴표/작은따옴표 제거
      service_key="${service_key%\"}"; service_key="${service_key#\"}"
      service_key="${service_key%\'}"; service_key="${service_key#\'}"
      break
    fi
  fi
done

if [[ -z "$service_key" ]]; then
  cat >&2 <<EOF
BOND_API_SERVICE_KEY를 찾을 수 없습니다.

프로젝트 루트에 .dev.vars 파일을 만들고 아래 형식으로 넣으세요 (.dev.vars가 있으면 .env 값은 무시됨):
  BOND_API_SERVICE_KEY="발급받은 인증키(Decoded 값)"

공공데이터포털에서 Decoded 값을 사용해야 합니다 — Encoded 값을 넣으면 이중 인코딩되어 인증에 실패합니다.
이 파일은 시크릿 차단 훅에 의해 Claude가 직접 읽거나 생성할 수 없으니, 사용자가 직접 만들어야 합니다.
EOF
  exit 1
fi

# --- issu: basDt/crno/isinCd 중 최소 하나 필수 ---
if [[ "$kind" == "issu" ]]; then
  has_identifier=0
  for kv in ${kv_args[@]+"${kv_args[@]}"}; do
    case "$kv" in
      basDt=*|crno=*|isinCd=*) has_identifier=1 ;;
    esac
  done
  if [[ "$has_identifier" -eq 0 ]]; then
    echo "채권기본정보는 basDt=, crno=, isinCd= 중 최소 하나가 필요합니다 (전부 생략하면 최신 날짜 전체조회로 빠져 timeout 발생)." >&2
    exit 1
  fi
fi

# --- curl 인자 구성 ---
declare -a curl_args=(-sS -G --max-time 20 "$BASE_URL/$OPERATION")
curl_args+=(--data-urlencode "serviceKey=$service_key")
curl_args+=(--data-urlencode "resultType=json")
for kv in ${kv_args[@]+"${kv_args[@]}"}; do
  curl_args+=(--data-urlencode "$kv")
done

tmp_body="$(mktemp "${TMPDIR:-/tmp}/bond-probe.XXXXXX")"
trap 'rm -f "$tmp_body"' EXIT

http_code="$(curl "${curl_args[@]}" -o "$tmp_body" -w '%{http_code}')"

if [[ "$raw" -eq 1 ]]; then
  cat "$tmp_body"
  echo
  exit 0
fi

if [[ "$http_code" != "200" ]]; then
  echo "HTTP $http_code (정상 응답 봉투가 아닌 GW 레벨 오류일 수 있음)"
  jq -e '.OpenAPI_ServiceResponse.cmmMsgHeader' "$tmp_body" >/dev/null 2>&1 && \
    jq '{
      returnReasonCode: .OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode,
      errMsg: .OpenAPI_ServiceResponse.cmmMsgHeader.errMsg,
      returnAuthMsg: .OpenAPI_ServiceResponse.cmmMsgHeader.returnAuthMsg
    }' "$tmp_body" || cat "$tmp_body"
  exit 1
fi

if ! jq -e '.response.header' "$tmp_body" >/dev/null 2>&1; then
  echo "예상치 못한 응답 형식입니다 (response.header 없음). --raw로 원문을 확인하세요:" >&2
  cat "$tmp_body"
  exit 1
fi

result_code="$(jq -r '.response.header.resultCode' "$tmp_body")"
result_msg="$(jq -r '.response.header.resultMsg' "$tmp_body")"

if [[ "$result_code" != "00" ]]; then
  echo "resultCode: $result_code"
  echo "resultMsg:  $result_msg"
  echo "(참고: 코드 20은 서로 다른 원인 3가지에 중복 배정되어 있어 resultMsg로 구분해야 함)"
  exit 1
fi

total_count="$(jq -r '.response.body.totalCount' "$tmp_body")"
is_empty="$(jq -r 'if (.response.body.items | type) == "string" then "true" else "false" end' "$tmp_body")"

echo "resultCode: 00 (정상)"
echo "totalCount: $total_count"

if [[ "$is_empty" == "true" ]]; then
  echo "조회 결과 0건 (items가 빈 문자열로 옴 — items.item에 접근 금지)"
  exit 0
fi

echo
echo "첫 아이템 필드:"
jq -r '.response.body.items.item[0] | keys_unsorted[]' "$tmp_body"

echo
echo "값이 빈 문자열 또는 \"NULL\"인 필드:"
jq -r '.response.body.items.item[0] | to_entries[] | select(.value == "" or .value == "NULL") | .key' "$tmp_body"
