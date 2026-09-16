import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { flexRender, type Header } from "@tanstack/react-table";
import { cn } from "cn";
import type { screenerFeatures } from "./columns";
import type { ScreenerRow } from "@/lib/screener/types";

type ScreenerHeaderCell = Header<typeof screenerFeatures, ScreenerRow, unknown>;

interface ScreenerSortButtonProps {
  header: ScreenerHeaderCell;
}

/**
 * 이 헤더를 담는 `<th>`에 붙일 `aria-sort` 값(ui-audit ⑦). 방향 표시가 캐럿 아이콘뿐이라
 * 스크린리더에는 정렬 상태가 전혀 전달되지 않던 것을 메운다.
 *
 * 정렬 불가 컬럼과 placeholder 헤더에는 속성 자체를 붙이지 않는다(undefined) —
 * `aria-sort="none"`은 "정렬 가능하지만 지금은 안 걸려 있다"는 뜻이라, 정렬할 수 없는
 * 컬럼에 붙이면 거짓말이 된다.
 */
export function ariaSortOf(header: ScreenerHeaderCell): "ascending" | "descending" | "none" | undefined {
  if (header.isPlaceholder || !header.column.getCanSort()) return undefined;
  const sorted = header.column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

/** 헤더 정렬 토글 버튼. asc → desc → 해제 3-state를 순환한다. */
export function ScreenerSortButton({ header }: ScreenerSortButtonProps) {
  if (header.isPlaceholder) return null;

  const column = header.column;
  const label = flexRender(column.columnDef.header, header.getContext());

  if (!column.getCanSort()) {
    return <span>{label}</span>;
  }

  const sorted = column.getIsSorted();
  const align = column.columnDef.meta?.align === "end";

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1 text-left font-medium",
        align && "flex-row-reverse",
      )}
    >
      <span>{label}</span>
      {/* 방향은 <th>의 aria-sort가 알린다 — 아이콘은 순수 장식이라 접근성 트리에서 감춘다. */}
      {sorted === "asc" && <CaretUpIcon weight="bold" aria-hidden="true" />}
      {sorted === "desc" && <CaretDownIcon weight="bold" aria-hidden="true" />}
      {!sorted && <CaretUpDownIcon className="text-muted-foreground" aria-hidden="true" />}
    </button>
  );
}
