import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DASH, fmtAmount, fmtYmd } from "@/lib/screener/format";

/** `toBondDetailResponse`가 반환하는 `stateHistory` 원소(camelCase) 형태. */
interface BondStateRow {
  validFrom: number | null;
  validTo: number | null;
  bondBal: number | null;
  nxtmCopnDt: number | null;
  rbfCopnDt: number | null;
  kisGrade: string | null;
  kbpGrade: string | null;
  niceGrade: string | null;
  fnGrade: string | null;
}

interface BondStateHistoryProps {
  stateHistory: BondStateRow[];
}

/** SCD Type 2 이력 — `validFrom` 내림차순(이미 정렬돼 온다). 변경 이력이 있는 종목에서만 의미가 있다. */
export function BondStateHistory({ stateHistory }: BondStateHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>변경 이력</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>적용일</TableHead>
              <TableHead>종료일</TableHead>
              <TableHead className="text-right">잔액</TableHead>
              <TableHead>KIS</TableHead>
              <TableHead>KBP</TableHead>
              <TableHead>NICE</TableHead>
              <TableHead>FN</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stateHistory.map((row) => (
              <TableRow key={row.validFrom}>
                <TableCell>{fmtYmd(row.validFrom)}</TableCell>
                <TableCell>{row.validTo === null ? "현재" : fmtYmd(row.validTo)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtAmount(row.bondBal)}</TableCell>
                <TableCell>{row.kisGrade ?? DASH}</TableCell>
                <TableCell>{row.kbpGrade ?? DASH}</TableCell>
                <TableCell>{row.niceGrade ?? DASH}</TableCell>
                <TableCell>{row.fnGrade ?? DASH}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
