/**
 * 이름 붙인 필터 프리셋의 localStorage 저장 포맷과 순수 조작 함수.
 *
 * 프리셋 본문은 `ScreenerFilters` JSON이 아니라 `encodeViewState()`가 만드는 쿼리스트링
 * 한 줄이다. `decodeViewState()`가 이미 잘못된 값을 throw 없이 기본값으로 폴백하므로
 * (`parseNumericParam`·`parseSort`의 컬럼 화이트리스트 등) 오염된 localStorage에 대한
 * 방어가 그대로 따라오고, 필터 필드가 늘어도 이 파일은 손댈 필요가 없다.
 *
 * 저장 대상은 **필터 + 정렬**뿐이다 — 페이지 번호·페이지 크기는 프리셋을 적용해도
 * 그대로 유지한다. `encodePresetQuery`가 pageIndex/pageSize를 기본값으로 고정해
 * 인코딩하므로 `encodeViewState`가 `page`/`size` 파라미터를 아예 생략한다.
 */
import type { SortingState } from "@tanstack/react-table";
import type { ScreenerFilters } from "./filters";
import { DEFAULT_VIEW_STATE, decodeViewState, encodeViewState } from "./view-state";

/** 기존 `bond-screener:view-state`(sessionStorage)와 같은 접두사 규약. */
export const PRESETS_STORAGE_KEY = "bond-screener:filter-presets";

/**
 * sessionStorage와 달리 localStorage는 오래 남는다 — 나중에 포맷을 바꿀 여지를 두려고
 * 배열이 아니라 버전 봉투로 감싼다. 모르는 version은 조용히 빈 목록으로 폴백한다.
 */
const FORMAT_VERSION = 1;

export const MAX_PRESETS = 20;
export const MAX_PRESET_NAME_LENGTH = 40;

export interface FilterPreset {
  id: string;
  /** trim된 표시 이름. 최대 `MAX_PRESET_NAME_LENGTH`자. */
  name: string;
  /** `encodePresetQuery` 결과. 빈 문자열이면 "필터 없음 + 기본 정렬"을 뜻한다. */
  query: string;
  createdAt: number;
}

/** 프리셋에 저장하는 뷰 상태 조각 — 페이지 관련 상태는 포함하지 않는다. */
export interface PresetViewSlice {
  filters: ScreenerFilters;
  sorting: SortingState;
}

export function encodePresetQuery({ filters, sorting }: PresetViewSlice): string {
  return encodeViewState({ ...DEFAULT_VIEW_STATE, filters, sorting });
}

export function decodePresetQuery(query: string): PresetViewSlice {
  const { filters, sorting } = decodeViewState(query);
  return { filters, sorting };
}

/** 표시·저장용 이름 정규화. 앞뒤 공백을 없애고 길이를 자른다. */
export function normalizePresetName(name: string): string {
  return name.trim().slice(0, MAX_PRESET_NAME_LENGTH);
}

/** 동명 판정 기준 — 한글엔 대소문자가 없지만 영문 이름을 섞어 쓸 수 있어 접어서 비교한다. */
function nameKey(name: string): string {
  return normalizePresetName(name).toLocaleLowerCase();
}

export function findPresetByName(presets: FilterPreset[], name: string): FilterPreset | undefined {
  const key = nameKey(name);
  if (key === "") return undefined;
  return presets.find((p) => nameKey(p.name) === key);
}

/**
 * 같은 이름이 있으면 **그 자리에서** query/createdAt만 교체하고(목록 순서 유지),
 * 없으면 맨 앞에 추가한 뒤 `MAX_PRESETS`까지 자른다(가장 오래된 것부터 밀려난다).
 * 이름이 공백뿐이면 목록을 그대로 돌려준다 — 호출부에서 막지만 방어적으로 둔다.
 */
export function upsertPreset(presets: FilterPreset[], name: string, query: string): FilterPreset[] {
  const normalized = normalizePresetName(name);
  if (normalized === "") return presets;

  const existing = findPresetByName(presets, normalized);
  if (existing !== undefined) {
    return presets.map((p) => (p.id === existing.id ? { ...p, name: normalized, query, createdAt: Date.now() } : p));
  }

  const created: FilterPreset = {
    id: crypto.randomUUID(),
    name: normalized,
    query,
    createdAt: Date.now(),
  };
  return [created, ...presets].slice(0, MAX_PRESETS);
}

export function removePreset(presets: FilterPreset[], id: string): FilterPreset[] {
  return presets.filter((p) => p.id !== id);
}

function isFilterPreset(value: unknown): value is FilterPreset {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id !== "" &&
    typeof o.name === "string" &&
    o.name.trim() !== "" &&
    typeof o.query === "string" &&
    typeof o.createdAt === "number" &&
    Number.isFinite(o.createdAt)
  );
}

/**
 * 파싱 실패·모양 불일치는 조용히 폴백한다(throw하지 않음) — localStorage는 사용자가
 * 손댈 수 있는 입력이고, 프리셋 하나가 깨졌다고 화면이 죽으면 안 된다. 봉투 자체가
 * 망가졌으면 빈 목록, 개별 항목이 망가졌으면 그 항목만 버린다.
 */
export function parsePresets(raw: string | null): FilterPreset[] {
  if (raw === null || raw === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== FORMAT_VERSION) return [];
  if (!Array.isArray(envelope.presets)) return [];

  return envelope.presets.filter(isFilterPreset).slice(0, MAX_PRESETS);
}

export function serializePresets(presets: FilterPreset[]): string {
  return JSON.stringify({ version: FORMAT_VERSION, presets });
}
