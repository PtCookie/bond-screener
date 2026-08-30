import { ArrowLeft } from "@phosphor-icons/react";
import { DASH, deltaTone, fmtDelta, fmtPrice, fmtRate } from "@/lib/screener/format";
import { cn } from "@/lib/utils";

interface LatestPriceRow {
  mrktCtg: string | null;
  clprPrc: number | null;
  clprVs: number | null;
  clprBnfRt: number | null;
}

interface BondDetailHeaderProps {
  isinCd: string;
  srtnCd: string | null;
  isinCdNm: string | null;
  bondIsurNm: string | null;
  latestPrices: LatestPriceRow[];
}

export function BondDetailHeader({ isinCd, srtnCd, isinCdNm, bondIsurNm, latestPrices }: BondDetailHeaderProps) {
  return (
    <div className="space-y-4">
      <a href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        목록으로
      </a>
      <div>
        <h1 className="font-heading text-2xl font-medium">{isinCdNm ?? DASH}</h1>
        <p className="text-muted-foreground text-sm">
          {bondIsurNm ?? DASH} · {isinCd}
          {srtnCd ? ` · ${srtnCd}` : ""}
        </p>
      </div>
      {latestPrices.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {latestPrices.map((p) => {
            const tone = deltaTone(p.clprVs);
            const toneClass =
              tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-muted-foreground";
            return (
              <div key={p.mrktCtg} className="rounded-2xl border p-4">
                <div className="text-muted-foreground text-xs">{p.mrktCtg ?? DASH}</div>
                <div className="text-lg font-semibold tabular-nums">{fmtPrice(p.clprPrc)}</div>
                <div className={cn("text-sm tabular-nums", toneClass)}>
                  {fmtDelta(p.clprVs)} ({fmtRate(p.clprBnfRt)})
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
