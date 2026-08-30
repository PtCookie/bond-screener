import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BondDetailField } from "@/lib/bond/detail";
import { DETAIL_SECTIONS, formatDetailField } from "@/lib/bond/detail-view";

interface BondFieldSectionsProps {
  bond: Record<string, BondDetailField>;
  state: Record<string, string | number | null> | null;
}

/** 핵심 큐레이션 섹션(`DETAIL_SECTIONS`)을 카드 그리드로 렌더한다. */
export function BondFieldSections({ bond, state }: BondFieldSectionsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {DETAIL_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {section.fields.map((field) => {
                // state 소스 필드(신용등급 4종·잔액·차기/직전 이표일)는 이력이 없는
                // 종목이면 state 자체가 null일 수 있다 — 그 경우 대시로 표시된다.
                const raw = field.source === "bond" ? bond[field.key] : (state?.[field.key] ?? null);
                return (
                  <Fragment key={field.key}>
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="text-right tabular-nums">{formatDetailField(raw, field.kind)}</dd>
                  </Fragment>
                );
              })}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
