/**
 * fetch/파싱 계층에서 올라오는 원본 에러(`요청 실패: /api/... (HTTP 500)` 같은 개발자용
 * 문구)를 사용자에게 보여줄 제품의 말로 바꾼다. 원본 메시지는 절대 화면에 그대로 찍지 않는다.
 */
export function toFriendlyErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    // 브라우저 fetch는 네트워크 단절·DNS 실패·CORS 차단 등을 전부 TypeError로 던진다.
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}
