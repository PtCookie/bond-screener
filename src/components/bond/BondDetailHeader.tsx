import { ArrowLeft } from "@phosphor-icons/react";
import type { BondMarketCategory } from "@/api";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DASH, deltaTone, fmtBp, fmtDelta, fmtPrice, fmtRate, type DeltaTone } from "@/lib/screener/format";
import { cn } from "cn";

interface LatestPriceRow {
  mrktCtg: string | null;
  clprPrc: number | null;
  clprVs: number | null;
  clprBnfRt: number | null;
  /** 전일대비의 기준이 된 직전 영업일. `null`이면 비교 불가(`pairPrevPrice` 참고). */
  prevBasDt: number | null;
  /** 수익률 전일대비(%p). 비교 불가면 `null`. */
  clprBnfRtVs: number | null;
}

function toneClass(tone: DeltaTone): string {
  return tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-muted-foreground";
}

interface BondDetailHeaderProps {
  isinCd: string;
  isinCdNm: string | null;
  /** `latestPrices`에 실제로 존재하는 시장만(`BondDetail`이 파생). 2개 이상일 때만 토글이 뜬다. */
  markets: BondMarketCategory[];
  /** 헤더 시세와 아래 가격 추이 차트가 공유하는 선택값 — 소유자는 `BondDetail`이다. */
  market: BondMarketCategory;
  onMarketChange: (market: BondMarketCategory) => void;
  latestPrices: LatestPriceRow[];
}

/**
 * 상세 페이지 최상단 — 종목명(h1) · ISIN · 시장 토글 · 최신 시세.
 *
 * 발행인·단축코드는 여기 두지 않는다(ui-audit ⑱) — 라벨 없는 `A · B · C` 가운뎃점 나열은
 * 뒤 두 코드가 무엇인지 알 수 없게 만든다. 둘 다 아래 "발행 개요" 카드에 라벨과 함께 있고,
 * ISIN은 그 카드(라벨 "ISIN코드")와 여기 헤더 양쪽에 중복 표시한다 — 헤더는 빠른 확인용,
 * 카드는 나머지 필드와 나란한 맥락용.
 */
export function BondDetailHeader({
  isinCd,
  isinCdNm,
  markets,
  market,
  onMarketChange,
  latestPrices,
}: BondDetailHeaderProps) {
  // 시장은 타일 라벨이 아니라 토글이 소유한다 — 선택된 시장의 시세 한 벌만 크게 보여준다.
  const row = latestPrices.find((p) => p.mrktCtg === market) ?? latestPrices[0];
  // 직전 영업일에 거래가 없던 종목은 API가 clprVs=0을 준다 — "보합"으로 보이지 않게
  // 비교 불가(prevBasDt=null)면 대시로 바꾼다.
  const clprVs = row && row.prevBasDt !== null ? row.clprVs : null;
  const clprBnfRtVs = row?.clprBnfRtVs ?? null;

  return (
    <div className="space-y-4">
      <a href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft aria-hidden="true" className="size-4" />
        목록으로
      </a>
      <div>
        <h1 className="font-heading text-2xl font-medium text-pretty">{isinCdNm ?? DASH}</h1>
        {/* 라벨+값 구조는 AppHeader의 기준일자와 같다 — 코드값은 라벨 없이는 읽히지 않는다. */}
        <p className="flex items-baseline gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">ISIN</span>{" "}
          <span className="text-foreground font-medium tabular-nums">{isinCd}</span>
        </p>
      </div>
      {markets.length > 1 && (
        <ToggleGroup
          aria-label="시장"
          variant="outline"
          size="sm"
          value={[market]}
          onValueChange={(v) => {
            const next = v[0] as BondMarketCategory | undefined;
            if (next) onMarketChange(next);
          }}
        >
          {markets.map((m) => (
            <ToggleGroupItem key={m} value={m}>
              {m}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {row && (
        // 종가·수익률은 각자 라벨을 단 별도 값이고, 전일대비는 각 값 옆에 붙는다(ui-audit ⑥)
        // — 예전처럼 `-2 (3.811%)`로 묶으면 괄호 안이 "전일대비 변동률"로 읽히지만 실제로는
        // 수익률이다. 수익률 전일대비는 bp 단위이고, 색은 가격과 같은 방향 규칙(상승=up)을
        // 따른다 — 그래서 종가와 수익률의 색은 보통 서로 반대로 나온다. 박스도 없앴다.
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{fmtPrice(row.clprPrc)}</span>
              <span className={cn("text-sm font-medium tabular-nums", toneClass(deltaTone(clprVs)))}>
                {/* 화면에는 TradingView처럼 숫자만 두고, 스크린리더에만 무슨 값인지 알린다. */}
                <span className="sr-only">전일대비 </span>
                {fmtDelta(clprVs)}
              </span>
            </div>
            <div className="text-muted-foreground text-xs">종가</div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{fmtRate(row.clprBnfRt)}</span>
              <span className={cn("text-sm font-medium tabular-nums", toneClass(deltaTone(clprBnfRtVs)))}>
                <span className="sr-only">전일대비 </span>
                {fmtBp(clprBnfRtVs)}
              </span>
            </div>
            <div className="text-muted-foreground text-xs">수익률</div>
          </div>
        </div>
      )}
    </div>
  );
}
