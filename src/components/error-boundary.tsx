import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useTranslation();
  return <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
    <h2 className="text-xl font-semibold">{t("audit.errorTitle")}</h2>
    <p className="max-w-md text-sm text-muted-foreground">{error.message || t("audit.errorFallback")}</p>
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => { if (window.location.hash === "#/") onReset(); else window.location.hash = "#/"; }}>{t("audit.dashboard")}</Button>
      <Button onClick={() => window.location.reload()}>{t("audit.reload")}</Button>
    </div>
  </div>;
}
