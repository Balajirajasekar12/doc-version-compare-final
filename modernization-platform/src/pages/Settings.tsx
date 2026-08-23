import { useState, useEffect } from "react";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAllProviderStatuses, type CaptureProviderStatus } from "@/lib/capture";
import {
  Camera,
  Monitor,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function Settings() {
  const [providerStatuses, setProviderStatuses] = useState<CaptureProviderStatus[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const loadProviders = async () => {
    setLoadingProviders(true);
    try {
      const statuses = await getAllProviderStatuses();
      setProviderStatuses(statuses);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const providerIcon = (type: string) => {
    switch (type) {
      case "SNAGIT": return <Camera className="size-4" />;
      case "BROWSER_CAPTURE": return <Monitor className="size-4" />;
      case "UPLOAD": return <Upload className="size-4" />;
      default: return <Monitor className="size-4" />;
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Settings"
        description="Configure application preferences and capture providers"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Settings" },
        ]}
      />
      <div className="p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Application Settings */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Application</h2>
            {[
              { label: "Upload Limits", value: "20 MB max evidence file size" },
              { label: "Data Storage", value: "Local-first, stored in Convex" },
              { label: "AI Integration", value: "Disabled (optional in future versions)" },
              { label: "External APIs", value: "None — fully local operation" },
              { label: "Version", value: "MIPTE v1.0.0" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
              >
                <span className="text-xs font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Evidence Capture Providers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Evidence Capture Providers</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={loadProviders}
                disabled={loadingProviders}
                className="gap-1.5"
              >
                {loadingProviders ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Refresh Status
              </Button>
            </div>

            {loadingProviders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {providerStatuses.map((provider) => (
                  <Card key={provider.type} className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {providerIcon(provider.type)}
                          <div>
                            <p className="text-xs font-medium">{provider.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {provider.type === "SNAGIT"
                                ? "Desktop screen capture via local Capture Agent"
                                : provider.type === "BROWSER_CAPTURE"
                                  ? "Browser Screen Capture API (getDISPLAYMedia)"
                                  : provider.type === "UPLOAD"
                                    ? "Manual screenshot upload (PNG, JPG, WEBP)"
                                    : "Automation test results imported via file"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {provider.available ? (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                              <CheckCircle2 className="size-3.5" />
                              Available
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <XCircle className="size-3.5" />
                              {provider.reason || "Unavailable"}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Capture Agent Info */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Local Capture Agent</h2>
            <Card className="border-border">
              <CardContent className="p-4 text-xs space-y-2">
                <p className="text-muted-foreground">
                  The MIPTE Capture Agent is a lightweight Windows service that bridges
                  the browser to Snagit for desktop screen capture. It is <strong>optional</strong> and
                  not required for normal operation.
                </p>
                <div className="rounded-md bg-muted/40 px-3 py-2 font-mono text-[10px]">
                  <p>1. Download and install the MIPTE Capture Agent</p>
                  <p>2. The agent starts on port 7890</p>
                  <p>3. Verify Snagit is installed on your system</p>
                  <p>4. Click "Refresh Status" above to check connection</p>
                </div>
                <p className="text-muted-foreground">
                  If the Capture Agent is unavailable, use Browser Capture or Manual Upload instead.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Security */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Security</h2>
            <Card className="border-border">
              <CardContent className="p-4 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Authentication</span>
                  <span>Email OTP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Evidence Access Control</span>
                  <span>Project-level authorization</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Screenshot URLs</span>
                  <span>Access-controlled (not public)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credentials in Automation</span>
                  <span>Never included (TODO placeholders)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
