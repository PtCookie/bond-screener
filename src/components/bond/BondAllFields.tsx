import { CaretDown } from "@phosphor-icons/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { BondDetailField } from "@/lib/bond/detail";
import { ALL_BOND_FIELD_SPECS, CURATED_BOND_KEYS, formatDetailField } from "@/lib/bond/detail-view";

interface BondAllFieldsProps {
  bond: Record<string, BondDetailField>;
}

/** `DETAIL_SECTIONS`에 이미 노출된 필드를 뺀 나머지 전체 — 데이터 손실 없이 전부 보여준다. */
export function BondAllFields({ bond }: BondAllFieldsProps) {
  const fields = Object.values(ALL_BOND_FIELD_SPECS).filter((f) => !CURATED_BOND_KEYS.has(f.key));

  return (
    <Collapsible className="bg-card text-card-foreground ring-foreground/5 dark:ring-foreground/10 rounded-4xl shadow-md ring-1">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 px-6 py-4 text-left text-sm font-medium",
          "hover:bg-muted/50",
        )}
      >
        전체 항목 ({fields.length})
        <CaretDown className="size-4 transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-6 pb-6 text-sm sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="flex items-baseline justify-between gap-4 border-b py-1">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="text-right tabular-nums">{formatDetailField(bond[field.key], field.kind)}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
