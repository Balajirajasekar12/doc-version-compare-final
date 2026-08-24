import { Navigate } from "react-router";

/** Auth removed — redirect straight to dashboard. */
export default function AuthPage() {
  return <Navigate to="/dashboard" replace />;
}
