// Auth removed — app runs entirely client-side with no server.
export function useAuth() {
  return {
    isLoading: false,
    isAuthenticated: false,
    user: null as { name?: string; email?: string } | null,
    signIn: async () => {},
    signOut: async () => {},
  };
}
