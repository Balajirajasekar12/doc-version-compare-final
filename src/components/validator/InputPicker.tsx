import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useValidator } from "@/context/ValidatorContext";
import { filterSupported, parseFile } from "@/lib/validator/parsers";
import { SUPPORTED_EXTS, type ParsedDoc } from "@/lib/validator/types";
import { AlertTriangle, FileCheck2, FileUp, FolderOpen, Loader2, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

type Mode = "folder" | "files";

export function InputPicker() {
  const { setParsedDocs } = useValidator();
  const [mode, setMode] = useState<Mode>("folder");
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const supported = filterSupported(files);
    if (supported.length === 0) {
      setError(`No supported documents found. Supported formats: ${SUPPORTED_EXTS.join(", ")}.`);
      return;
    }
    setError(null);
    setParsing(true);
    const parsed: ParsedDoc[] = [];
    try {
      for (let i = 0; i < supported.length; i++) {
        setProgress({ done: i, total: supported.length, current: supported[i].name });
        parsed.push(await parseFile(supported[i]));
        // Let the progress UI paint between files.
        if (i % 3 === 2) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      setProgress({ done: supported.length, total: supported.length, current: "" });
      setParsedDocs(parsed);
    } finally {
      setParsing(false);
      setProgress(null);
    }
  };

  const folderProps = {
    webkitdirectory: "",
    directory: "",
  } as React.InputHTMLAttributes<HTMLInputElement>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        {/* MODE A — Folder */}
        <Card
          className={`cursor-pointer transition-all shadow-none border ${
            mode === "folder" ? "border-primary/60 ring-1 ring-primary/20" : "border-border/70"
          }`}
          onClick={() => setMode("folder")}
        >
          <CardHeader>
            <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderOpen className="size-5" />
            </div>
            <CardTitle className="text-base">Mode A · Folder validation</CardTitle>
            <CardDescription>
              Pick a root directory containing report packages. Files are grouped
              into versions automatically by name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              {...folderProps}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={parsing}
              onClick={() => folderInputRef.current?.click()}
            >
              {parsing ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
              Choose folder…
            </Button>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Tip: pick the folder that directly contains your account folders
              (the parent of <code className="rounded bg-muted px-1">1000</code>,{" "}
              <code className="rounded bg-muted px-1">2000</code>, …). The app
              auto-detects the account level and lets you adjust it on the next
              screen.
            </p>
          </CardContent>
        </Card>

        {/* MODE B — Individual files */}
        <Card
          className={`cursor-pointer transition-all shadow-none border ${
            mode === "files" ? "border-primary/60 ring-1 ring-primary/20" : "border-border/70"
          }`}
          onClick={() => setMode("files")}
        >
          <CardHeader>
            <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileUp className="size-5" />
            </div>
            <CardTitle className="text-base">Mode B · Individual files</CardTitle>
            <CardDescription>
              Select or drop 2, 3, 4+ versions of your reports directly. Files
              sharing a base name — in any of the six formats — are grouped as
              versions of one report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".docx,.rtf,.xlsx,.xls,.csv,.pdf"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={parsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {parsing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              Choose files…
            </Button>
            <div
              className={`mt-3 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground transition-colors ${
                dragging ? "border-primary/60 bg-primary/5" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!parsing) handleFiles(e.dataTransfer.files);
              }}
            >
              …or drag &amp; drop files here
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parsing progress */}
      {parsing && progress && (
        <Card className="shadow-none border-border/70">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="truncate font-medium">{progress.current || "Finishing…"}</span>
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Parsing locally in your browser — nothing is uploaded.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Privacy guarantee:</strong> files are parsed entirely in your
          browser. Document contents are never uploaded, stored, or logged — the
          only data saved to your account are SHA-256 hashes of structural
          ignore rules.
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileCheck2 className="size-4" />
        Supported: .docx · .rtf · .xlsx · .xls · .csv · .pdf
      </div>
    </div>
  );
}
