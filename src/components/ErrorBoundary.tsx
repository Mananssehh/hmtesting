import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logCritical } from "@/lib/errorLogger";

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logCritical("ErrorBoundary", error.message, { componentStack: info.componentStack }, error.stack);
  }

  reset = () => {
    this.setState({ hasError: false });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            We hit an unexpected error. Our team has been notified. Try reloading the page.
          </p>
          <Button onClick={this.reset}>Back to home</Button>
        </div>
      </div>
    );
  }
}
