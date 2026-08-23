import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  muted: "bg-gray-50 text-gray-500 border-gray-200",
};

export function StatusBadge({
  label,
  variant = "default",
  className,
}: {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        variantStyles[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function getStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    CREATED: "default",
    UPLOADING: "info",
    ANALYZING: "info",
    EVIDENCE_REQUIRED: "warning",
    COMPARING: "info",
    GAPS_FOUND: "warning",
    FROZEN: "success",
    NOT_STARTED: "muted",
    WAITING_FOR_EVIDENCE: "warning",
    READY_TO_COMPARE: "info",
    COMPARED: "success",
    UPLOADED: "default",
    ANALYZED: "success",
    ERROR: "error",
    COMPLETED: "success",
    RUNNING: "info",
    QUEUED: "muted",
    FAILED: "error",
    CANCELLED: "muted",
    MATCHED: "success",
    MISSING: "error",
    CHANGED: "warning",
    REMOVED: "error",
    ADDED: "info",
    UNKNOWN: "muted",
    OPEN: "warning",
    REVIEWED: "info",
    ACCEPTED: "success",
    INTENTIONAL: "muted",
    FALSE_POSITIVE: "muted",
    FIX_REQUIRED: "error",
    CRITICAL: "error",
    HIGH: "error",
    MEDIUM: "warning",
    LOW: "info",
  };
  return map[status] ?? "default";
}
