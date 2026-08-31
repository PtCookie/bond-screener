/**
 * `<QueryProvider>`(src/components/providers/QueryProvider.tsx)를 그대로 쓰면 TanStack
 * Query의 기본 재시도(3회, 지수 백오프)가 실패 케이스 테스트를 느리게 만든다 — 이 헬퍼는
 * `retry: false`로 고정한 전용 `QueryClient`를 매 렌더마다 새로 만들어 감싼다.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, type RenderHookOptions, type RenderOptions } from "vitest-browser-react";

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

export function renderWithQuery(ui: React.ReactNode, options?: RenderOptions) {
  return render(ui, { ...options, wrapper: makeWrapper() });
}

export function renderHookWithQuery<Props, Result>(
  callback: (initialProps?: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  return renderHook(callback, { ...options, wrapper: makeWrapper() });
}
