import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { flexRender, type Header } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import type { screenerFeatures } from "./columns";
import type { ScreenerRow } from "@/lib/screener/types";

interface ScreenerSortButtonProps {
  header: Header<typeof screenerFeatures, ScreenerRow, unknown>;
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
      {sorted === "asc" && <CaretUpIcon weight="bold" />}
      {sorted === "desc" && <CaretDownIcon weight="bold" />}
      {!sorted && <CaretUpDownIcon className="text-muted-foreground" />}
    </button>
  );
}
