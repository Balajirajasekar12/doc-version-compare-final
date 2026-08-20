import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useValidator } from "@/context/ValidatorContext";
import {
  CloudOff,
  Database,
  FileX2,
  Fingerprint,
  HardDriveDownload,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ITEMS = [
  {
    icon: CloudOff,
    title: "Zero uploads",
    body: "Documents are parsed with in-browser engines (Word, Excel, PDF.js, RTF). No bytes, text, values, or metadata ever leave your device — there are no network calls for document data.",
  },
  {
    icon: Database,
    title: "Memory-only processing",
    body: "Extracted text and cell values live in page memory for the duration of your session only. Nothing is written to disk, and no temporary files are created.",
  },
  {
    icon: Fingerprint,
    title: "Hash-only ignore rules",
    body: "The only persisted data are SHA-256 hashes of structural fingerprints (account, report, location, difference type). Original values are never stored or transmitted.",
  },
  {
    icon: HardDriveDownload,
    title: "Local exports",
    body: "HTML and Excel (xlsx) reports are generated in your browser and downloaded straight to your machine. They are not served or stored by any server.",
  },
];

export function PrivacyPanel() {
  const { resetSession, setStage, docs, groups } = useValidator();
  const [confirming, setConfirming] = useState(false);

  const hasData = docs.length > 0 || groups.length > 0;

  const handleEndSession = () => {
    resetSession();
    setStage("input");
    toast.success("Session ended", {
      description: "All parsed document data has been discarded from memory.",
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-none border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <CardTitle className="text-base">Privacy &amp; confidentiality</CardTitle>
          </div>
          <CardDescription>
            Built for confidential and PHI-bearing reports. The comparison engine
            is fully local and works without any AI service or paid API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {ITEMS.map((item) => (
              <div key={item.title} className="rounded-xl border border-border/70 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <item.icon className="size-4 text-primary" />
                  {item.title}
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileX2 className="size-4 text-destructive" />
            <CardTitle className="text-base">End session</CardTitle>
          </div>
          <CardDescription>
            Discard every parsed document, extracted value, and comparison result
            from memory right now. Ignore rules (hashes only) are kept — use{" "}
            <em>Clear all rules</em> in the rules panel to remove those too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant={confirming ? "destructive" : "outline"}
            disabled={!hasData && !confirming}
            onClick={() => {
              if (confirming) {
                handleEndSession();
              } else {
                setConfirming(true);
                window.setTimeout(() => setConfirming(false), 4000);
              }
            }}
            className="gap-2"
          >
            <RotateCcw className="size-4" />
            {confirming ? "Click again to confirm" : "End session & discard all data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
