/**
 * Modernization Error Boundary
 * 
 * Isolates any runtime errors in the Modernization Platform
 * from the existing Document Version Validator.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
}

export class ModernizationErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "", stack: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Unknown error in Modernization Platform",
      stack: error.stack || "",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Modernization] Runtime error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center space-y-4">
            <AlertTriangle className="mx-auto size-10 text-amber-500" />
            <h1 className="text-lg font-semibold">Modernization Platform Error</h1>
            <p className="text-sm text-muted-foreground">
              The Modernization Platform encountered an error. The Document Version Validator is not affected.
            </p>
            <div className="rounded-lg border border-border bg-card p-4 text-left">
              <p className="text-xs font-medium text-foreground">{this.state.message}</p>
              {this.state.stack && (
                <pre className="mt-2 max-h-32 overflow-auto text-[10px] leading-4 text-muted-foreground">
                  {this.state.stack}
                </pre>
              )}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: "", stack: "" });
                window.location.href = "/modernization";
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90"
            >
              Reload Modernization Platform
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
