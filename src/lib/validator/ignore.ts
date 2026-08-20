import { fingerprintJoin, normalizeForHash, sha256Hex } from "./hash";
import type {
  DiffRecord,
  PersistedRule,
  RuleScope,
} from "./types";

/**
 * Privacy-preserving ignore rules.
 *
 * A rule NEVER contains the values that differ (no "John Smith → John Smyth").
 * Instead we derive a structural fingerprint from hashes of the account name,
 * report stem, location signature, difference type, and comparison mode. The
 * same fingerprint is recomputed on every run and matched without ever
 * storing or transmitting document content.
 *
 * Scopes, from narrowest to widest:
 *   occurrence — session-only, never persisted (in-memory set)
 *   location   — persisted; this exact location/type in this report
 *   report     — persisted; this difference type in this report
 *   account    — persisted; this difference type for this account
 *   global     — persisted; this difference type everywhere
 */

export interface FingerprintParts {
  accountHash: string;
  reportHash: string;
  locationHash: string;
  docType: string;
  differenceType: string;
  comparisonMode: string;
}

/** Report stem derived from the diff record (groupLabel is the stem). */
export function reportStemOf(diff: DiffRecord): string {
  return diff.groupLabel;
}

export async function computeFingerprint(
  diff: DiffRecord,
): Promise<FingerprintParts> {
  const accountHash = await sha256Hex(`account|${normalizeForHash(diff.account)}`);
  const reportHash = await sha256Hex(`report|${normalizeForHash(reportStemOf(diff))}`);
  const locationHash = await sha256Hex(
    `location|${normalizeForHash(diff.locationSignature)}`,
  );
  return {
    accountHash,
    reportHash,
    locationHash,
    docType: diff.docType,
    differenceType: diff.differenceType,
    comparisonMode: diff.comparisonMode,
  };
}

export function fingerprintOf(parts: FingerprintParts): string {
  return fingerprintJoin([
    parts.accountHash,
    parts.reportHash,
    parts.locationHash,
    parts.docType,
    parts.differenceType,
    parts.comparisonMode,
  ]);
}

export function reportKeyOf(parts: FingerprintParts): string {
  return fingerprintJoin([
    parts.accountHash,
    parts.reportHash,
    parts.docType,
    parts.differenceType,
    parts.comparisonMode,
  ]);
}

export function accountKeyOf(parts: FingerprintParts): string {
  return fingerprintJoin([
    parts.accountHash,
    parts.docType,
    parts.differenceType,
    parts.comparisonMode,
  ]);
}

export function globalKeyOf(parts: FingerprintParts): string {
  return fingerprintJoin([
    parts.docType,
    parts.differenceType,
    parts.comparisonMode,
  ]);
}

/** Which scope suppresses a difference, if any. */
export interface IgnoreMatch {
  scope: RuleScope;
  /** Persisted rule id when the match came from storage. */
  ruleId?: string;
}

export interface IgnoreMatcher {
  match(parts: FingerprintParts): IgnoreMatch | null;
}

export function buildIgnoreMatcher(
  rules: PersistedRule[],
  sessionOccurrenceFps: Set<string>,
): IgnoreMatcher {
  const locationFps = new Set(
    rules.filter((r) => r.scope === "location").map((r) => r.fingerprint),
  );
  const reportKeys = new Map<string, string>();
  const accountKeys = new Map<string, string>();
  const globalKeys = new Map<string, string>();
  for (const rule of rules) {
    if (rule.scope === "report") {
      reportKeys.set(
        fingerprintJoin([
          rule.accountHash,
          rule.reportHash,
          rule.docType,
          rule.differenceType,
          rule.comparisonMode,
        ]),
        rule._id,
      );
    } else if (rule.scope === "account") {
      accountKeys.set(
        fingerprintJoin([
          rule.accountHash,
          rule.docType,
          rule.differenceType,
          rule.comparisonMode,
        ]),
        rule._id,
      );
    } else if (rule.scope === "global") {
      globalKeys.set(
        fingerprintJoin([
          rule.docType,
          rule.differenceType,
          rule.comparisonMode,
        ]),
        rule._id,
      );
    }
  }

  return {
    match(parts: FingerprintParts): IgnoreMatch | null {
      const fp = fingerprintOf(parts);
      if (sessionOccurrenceFps.has(fp)) {
        return { scope: "occurrence" };
      }
      if (locationFps.has(fp)) {
        const rule = rules.find(
          (r) => r.scope === "location" && r.fingerprint === fp,
        );
        return { scope: "location", ruleId: rule?._id };
      }
      const reportId = reportKeys.get(reportKeyOf(parts));
      if (reportId) return { scope: "report", ruleId: reportId };
      const accountId = accountKeys.get(accountKeyOf(parts));
      if (accountId) return { scope: "account", ruleId: accountId };
      const globalId = globalKeys.get(globalKeyOf(parts));
      if (globalId) return { scope: "global", ruleId: globalId };
      return null;
    },
  };
}

export const SCOPE_LABELS: Record<RuleScope, string> = {
  occurrence: "This occurrence (session only)",
  location: "This location in this report",
  report: "This difference type in this report",
  account: "This difference type for this account",
  global: "Globally (all reports)",
};

export const SCOPE_DESCRIPTIONS: Record<RuleScope, string> = {
  occurrence:
    "Ignores this exact structural fingerprint until the session is cleared. Nothing is saved.",
  location:
    "Remembers this exact location + difference type for this report on future runs. Matches by structural hash — any change at this location/type in this report will be ignored.",
  report:
    "Ignores every difference of this type in this report (all locations), on future runs.",
  account:
    "Ignores every difference of this type for this account across all its reports, on future runs.",
  global:
    "Ignores every difference of this type across ALL reports and accounts, on future runs. Use with extreme care — it can hide real changes.",
};
