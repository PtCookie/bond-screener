/** 프로젝트 컨벤션(`no-non-null-assertion`)을 지키면서 null 가드를 짧게 쓰기 위한 헬퍼. */
export function notNull<T>(value: T | null | undefined, message = "값이 null/undefined임"): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
