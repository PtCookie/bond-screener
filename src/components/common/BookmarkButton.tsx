import { StarIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/hooks/useBookmarks";
import { cn } from "cn";

interface BookmarkButtonProps {
  isinCd: string;
  /** 접근성 이름과 저장용 이름(`Bookmark.name`)에 쓴다. */
  name: string | null;
  size?: "icon-xs" | "icon-sm";
  className?: string;
}

/**
 * 종목 북마크 토글(별). 스토어를 직접 구독하므로 목록 셀·상세 헤더 어디에 두어도
 * prop 전달 없이 같은 상태를 본다.
 */
export function BookmarkButton({ isinCd, name, size = "icon-xs", className }: BookmarkButtonProps) {
  const { bookmarkedIds, toggle } = useBookmarks();
  const active = bookmarkedIds.has(isinCd);

  return (
    <Button
      variant="ghost"
      size={size}
      aria-pressed={active}
      aria-label={`${name ?? isinCd} 북마크`}
      title={active ? "북마크 해제" : "북마크 추가"}
      onClick={() => {
        toggle(isinCd, name);
      }}
      // ghost의 hover:text-foreground가 활성색을 덮지 않게 hover에도 같은 색을 건다.
      className={cn(active ? "text-bookmark hover:text-bookmark" : "text-muted-foreground", className)}
    >
      <StarIcon
        aria-hidden="true"
        weight={active ? "fill" : "regular"}
        className={size === "icon-sm" ? "size-5" : undefined}
      />
    </Button>
  );
}
