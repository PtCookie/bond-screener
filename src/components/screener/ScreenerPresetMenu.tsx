import { useState, type FormEvent } from "react";
import { ArrowClockwiseIcon, BookmarkSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  MAX_PRESET_NAME_LENGTH,
  findPresetByName,
  normalizePresetName,
  type FilterPreset,
} from "@/lib/screener/presets";
import { cn } from "@/lib/utils";

interface ScreenerPresetMenuProps {
  presets: FilterPreset[];
  /** 지금 화면의 필터+정렬을 인코딩한 쿼리 — 저장 버튼이 그대로 싣는다. */
  currentQuery: string;
  onSave: (name: string, query: string) => void;
  onDelete: (id: string) => void;
  onApply: (query: string) => void;
}

/**
 * 이름 붙인 필터 프리셋의 저장·적용·삭제 UI. 상태를 직접 들지 않는 프레젠테이션
 * 컴포넌트이고, 목록의 실제 보관은 `useFilterPresets`가 한다.
 *
 * 동명 저장은 되돌릴 수 없으므로 확인을 받는데, 이 프로젝트엔 `AlertDialog`가 없어
 * 팝오버 안에서 입력 폼을 확인 문구로 갈아 끼우는 2단계 방식으로 처리한다(같은 이름의
 * 버튼이 동시에 두 개 뜨지 않게 폼과 확인 블록은 배타적으로 렌더한다). 목록의 각 항목에서
 * 바로 "현재 필터로 덮어쓰기"하는 진입점도 같은 확인 UI로 합류한다 — 재타이핑 없이
 * `preset.name`을 그대로 쓴다는 점만 저장 폼 경로(입력한 이름을 그대로 씀)와 다르다.
 */
export function ScreenerPresetMenu({ presets, currentQuery, onSave, onDelete, onApply }: ScreenerPresetMenuProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pendingOverwrite, setPendingOverwrite] = useState<{ preset: FilterPreset; name: string } | null>(null);

  const trimmedName = normalizePresetName(name);
  const duplicate = findPresetByName(presets, trimmedName);

  function reset() {
    setName("");
    setPendingOverwrite(null);
  }

  function saveAs(saveName: string) {
    onSave(saveName, currentQuery);
    reset();
  }

  function confirmOverwrite() {
    if (pendingOverwrite === null) return;
    saveAs(pendingOverwrite.name);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // 닫을 때 입력·확인 단계를 비운다 — 다시 열었을 때 이전 확인 문구가 남아 있으면
    // 무엇을 덮어쓰는지 오해하기 쉽다.
    if (!next) reset();
  }

  /** 저장 버튼(폼 submit)과 입력창 Enter가 공유하는 진입점. */
  function submit() {
    if (trimmedName === "") return;
    if (duplicate !== undefined) {
      setPendingOverwrite({ preset: duplicate, name: trimmedName });
      return;
    }
    saveAs(trimmedName);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 font-normal")}>
        <BookmarkSimpleIcon data-icon="inline-start" />
        <span className={presets.length > 0 ? undefined : "text-muted-foreground"}>
          저장된 필터 {presets.length > 0 ? presets.length : ""}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3">
        {pendingOverwrite === null ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              aria-label="프리셋 이름"
              placeholder="현재 필터 이름"
              value={name}
              maxLength={MAX_PRESET_NAME_LENGTH}
              onChange={(e) => {
                setName(e.target.value);
              }}
              // 팝오버 안에서는 Enter가 폼의 암묵적 submit으로 이어지지 않는다(실측:
              // 입력창에 포커스를 두고 Enter를 눌러도 저장되지 않음) — 직접 처리한다.
              // preventDefault로 혹시 모를 이중 submit도 막는다.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
              className="h-8 flex-1"
            />
            <Button type="submit" size="sm" disabled={trimmedName === ""}>
              {duplicate === undefined ? "저장" : "덮어쓰기"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">“{pendingOverwrite.preset.name}” 프리셋을 덮어쓸까요?</p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={confirmOverwrite}>
                덮어쓰기
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPendingOverwrite(null);
                }}
              >
                취소
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {presets.length === 0 ? (
          <p className="text-muted-foreground px-1.5 py-1">저장된 필터가 없습니다.</p>
        ) : (
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {presets.map((preset) => (
              <div key={preset.id} className="hover:bg-muted flex items-center gap-1 rounded-lg pr-1">
                <button
                  type="button"
                  className="flex-1 truncate px-1.5 py-1 text-left"
                  onClick={() => {
                    onApply(preset.query);
                    handleOpenChange(false);
                  }}
                >
                  {preset.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${preset.name} 덮어쓰기`}
                  onClick={() => {
                    setPendingOverwrite({ preset, name: preset.name });
                  }}
                >
                  <ArrowClockwiseIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${preset.name} 삭제`}
                  onClick={() => {
                    onDelete(preset.id);
                    if (pendingOverwrite?.preset.id === preset.id) setPendingOverwrite(null);
                  }}
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
