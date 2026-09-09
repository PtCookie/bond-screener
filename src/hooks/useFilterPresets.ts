import { useCallback, useEffect, useRef, useState } from "react";
import {
  PRESETS_STORAGE_KEY,
  parsePresets,
  removePreset,
  serializePresets,
  upsertPreset,
  type FilterPreset,
} from "@/lib/screener/presets";

function readLocalStorage(): string | null {
  try {
    return localStorage.getItem(PRESETS_STORAGE_KEY);
  } catch {
    // 프라이빗 모드/저장소 차단 — 폴백 없이 조용히 무시.
    return null;
  }
}

function writeLocalStorage(value: string): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, value);
  } catch {
    // 위와 동일한 이유(+용량 초과)로 무시. 저장에 실패해도 이번 세션의 목록은 살아 있다.
  }
}

export interface UseFilterPresetsResult {
  presets: FilterPreset[];
  /** 같은 이름이 있으면 덮어쓴다(덮어쓰기 확인은 호출부 UI 책임). */
  savePreset: (name: string, query: string) => void;
  deletePreset: (id: string) => void;
}

/**
 * 이름 붙인 필터 프리셋을 localStorage에 보관하는 훅.
 *
 * `useScreenerViewState`와 같은 이유로 초기 `useState`는 항상 빈 목록으로 시작하고 실제
 * 복원은 마운트 `useEffect`에서 한다 — 첫 렌더부터 스토리지를 읽으면 서버 HTML(스토리지
 * 없음)과 마크업이 어긋난다. 스토리지 접근은 전부 try/catch로 감싸 프라이빗 모드에서도
 * 화면이 죽지 않게 한다.
 */
export function useFilterPresets(): UseFilterPresetsResult {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const restored = parsePresets(readLocalStorage());
    if (restored.length > 0) setPresets(restored);
  }, []);

  // 상태와 localStorage를 함께 갱신한다 — 다음 상태를 setState 안에서만 알 수 있으므로
  // 쓰기도 그 안에서 한다(같은 계산을 밖에서 한 번 더 하지 않기 위함).
  const update = useCallback((updater: (prev: FilterPreset[]) => FilterPreset[]) => {
    setPresets((prev) => {
      const next = updater(prev);
      writeLocalStorage(serializePresets(next));
      return next;
    });
  }, []);

  const savePreset = useCallback(
    (name: string, query: string) => {
      update((prev) => upsertPreset(prev, name, query));
    },
    [update],
  );

  const deletePreset = useCallback(
    (id: string) => {
      update((prev) => removePreset(prev, id));
    },
    [update],
  );

  return { presets, savePreset, deletePreset };
}
