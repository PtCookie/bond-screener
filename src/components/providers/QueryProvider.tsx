import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query 프로바이더. `useState`의 lazy initializer로 `QueryClient`를 island당
 * 정확히 한 번만 만든다 — 렌더마다 새로 만들면 캐시가 매번 초기화된다.
 *
 * React island 내부에서 쓴다(`BondScreener.tsx`가 감싸는 형태) — Astro 컴포넌트 경계를
 * 넘어 React 컴포넌트를 중첩하면 각 자식도 별도 `client:*`가 필요해지는 등 하이드레이션
 * 경계가 복잡해지므로, 같은 island 안에서 평범한 React 컴포넌트 합성으로 둔다.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
