/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 */

"use client";

import React, { Component, ReactNode, ErrorInfo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { captureError } from "@/lib/report-error";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Report it (lib/report-error.ts)
    captureError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="max-w-2xl w-full">
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">
                Terjadi Kesalahan
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <p>
                  Maaf, terjadi kesalahan yang tidak terduga. Tim kami telah
                  diberitahu dan sedang menangani masalah ini.
                </p>
                {process.env.NODE_ENV === "development" && this.state.error && (
                  <details className="mt-4 p-4 bg-gray-900 text-gray-100 rounded-md overflow-auto max-h-96">
                    <summary className="cursor-pointer font-mono text-sm mb-2">
                      Error Details (Development Only)
                    </summary>
                    <pre className="text-xs whitespace-pre-wrap">
                      <strong>Error:</strong> {this.state.error.message}
                      {"\n\n"}
                      <strong>Stack:</strong>
                      {"\n"}
                      {this.state.error.stack}
                      {"\n\n"}
                      {this.state.errorInfo && (
                        <>
                          <strong>Component Stack:</strong>
                          {"\n"}
                          {this.state.errorInfo.componentStack}
                        </>
                      )}
                    </pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button
                onClick={this.handleReset}
                variant="default"
                className="flex-1"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Coba Lagi
              </Button>
              <Button
                onClick={this.handleReload}
                variant="outline"
                className="flex-1"
              >
                Muat Ulang Halaman
              </Button>
            </div>

            <div className="mt-4 text-center text-sm text-gray-600">
              <p>
                Jika masalah berlanjut, silakan hubungi dukungan teknis atau{" "}
                <Button
                  variant="link"
                  className="text-blue-600 hover:underline p-0 h-auto font-normal"
                  onClick={() => (window.location.href = "/")}
                >
                  kembali ke beranda
                </Button>
                .
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC version for easier wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, "children">,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || "Component"})`;

  return WrappedComponent;
}

// Async error boundary for handling promise rejections
export class AsyncErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  componentDidMount() {
    window.addEventListener(
      "unhandledrejection",
      this.handleUnhandledRejection,
    );
  }

  componentWillUnmount() {
    window.removeEventListener(
      "unhandledrejection",
      this.handleUnhandledRejection,
    );
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    console.error("Unhandled promise rejection:", event.reason);

    this.setState({
      hasError: true,
      error:
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
      errorInfo: null,
    });

    captureError(event.reason);
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AsyncErrorBoundary caught an error:", error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    this.props.onError?.(error, errorInfo);
    captureError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {this.state.error?.message || "An unexpected error occurred"}
              <Button
                onClick={this.handleReset}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}
