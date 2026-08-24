import type { ReactNode } from "react";

/** Auth removed — just renders children. */
export function RequireAuth({ children }: { children: ReactNode }) {
  return children;
}
