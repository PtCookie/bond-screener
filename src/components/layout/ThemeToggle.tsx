import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/hooks/useTheme";

/**
 * 테마 선택기(시스템/라이트/다크).
 *
 * 해·달 아이콘 교차 페이드를 **JS 상태가 아니라 CSS `dark:` 유틸리티로만** 처리하는 것이
 * 핵심이다. 상세 페이지 아일랜드는 `client:load`라 이 버튼이 SSR되는데, 서버는 사용자의
 * 테마를 모르므로 아이콘을 JS로 고르면 서버 HTML과 첫 클라이언트 렌더가 어긋나
 * 하이드레이션 불일치가 난다. 클래스만으로 그리면 서버·클라이언트 마크업이 항상 같고,
 * 실제 표시는 <html>의 `.dark` 여부가 결정한다.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" data-js-only>
            <SunIcon
              aria-hidden="true"
              className="size-[1.2rem] scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
            />
            <MoonIcon
              aria-hidden="true"
              className="absolute size-[1.2rem] scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
            />
            <span className="sr-only">테마 전환</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="system" closeOnClick>
            시스템
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" closeOnClick>
            라이트
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick>
            다크
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
