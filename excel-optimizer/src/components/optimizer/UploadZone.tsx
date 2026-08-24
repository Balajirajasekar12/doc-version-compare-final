import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_EXTENSIONS } from "./utils";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const pick = (file: File | undefined | null) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "xlsm", "xls"].includes(ext)) {
      setRejected(`${file.name} is not a supported Excel file. Use .xlsx, .xlsm or .xls.`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setRejected(`${file.name} exceeds the 50 MB limit.`);
      return;
    }
    setRejected(null);
    onFile(file);
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload an Excel workbook"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) pick(e.dataTransfer.files?.[0]);
        }}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
          dragging
            ? "border-brand bg-brand/5 scale-[1.01]"
            : "border-border bg-card/60 hover:border-brand/50 hover:bg-card"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <motion.div
          animate={dragging ? { y: -4, scale: 1.06 } : { y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="flex size-16 items-center justify-center rounded-2xl bg-brand/10 text-brand"
        >
          <FileSpreadsheet className="size-8" strokeWidth={1.6} />
        </motion.div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold tracking-tight text-foreground">
            {dragging ? "Drop it here" : "Drag & drop your Excel file"}
          </p>
          <p className="text-sm text-muted-foreground">or</p>
          <Button
            type="button"
            variant="outline"
            className="mt-1 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) inputRef.current?.click();
            }}
          >
            Browse files
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-brand" />
          <span>Processed locally in your browser — nothing is uploaded</span>
        </div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground/80">
          Supported: <span className="text-foreground/70">.xlsx</span> · <span className="text-foreground/70">.xlsm</span> ·{" "}
          <span className="text-foreground/70">.xls</span> &nbsp;·&nbsp; up to 50 MB
        </p>
      </div>
      {rejected && (
        <p role="alert" className="mt-3 text-center text-sm font-medium text-destructive">
          {rejected}
        </p>
      )}
    </div>
  );
}
