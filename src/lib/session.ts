/**
 * Lightweight local session.
 *
 * The validator engine is fully local-first — documents never leave the
 * device — so a "session" is just a marker stored on this browser that
 * records the user's sign-in intent. Nothing sensitive is stored, and the
 * validator is fully usable without one. A real account layer (Convex Auth,
 * syncing hashed ignore rules) can be added later without touching this API.
 */

const SESSION_KEY = "dv-validator-session:v1";

export interface ValidatorSession {
  kind: "local";
  startedAt: number;
}

export function getSession(): ValidatorSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ValidatorSession) : null;
  } catch {
    return null;
  }
}

export function startSession(): void {
  const session: ValidatorSession = { kind: "local", startedAt: Date.now() };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable — the validator still works for this page visit.
  }
}

export function endSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore.
  }
}
