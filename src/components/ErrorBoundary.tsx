// @ts-nocheck
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Button, buttonClass } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // A plain sentence for the reader; the error itself goes to the console above.
      let errorMessage = 'This page ran into a problem. Reloading usually fixes it.';
      
      try {
        // Check if it's a Firestore JSON error
        const firestoreError = JSON.parse(this.state.error?.message || '');
        if (firestoreError.error && firestoreError.operationType) {
          errorMessage = `Database error during ${firestoreError.operationType}. Please contact support.`;
        }
      } catch (e) {
        // Not a JSON error, use default
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-ground p-4">
          <div role="alert" className="card w-full max-w-md p-6 text-center sm:p-8">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-alarm-soft text-alarm" aria-hidden="true">
              <AlertCircle size={28} />
            </div>
            <h1 className="mb-2 text-xl font-bold text-ink">Something went wrong</h1>
            <p className="mb-8 text-muted">{errorMessage}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button variant="brand" onClick={() => window.location.reload()}>
                <RotateCw size={16} aria-hidden="true" />
                Reload page
              </Button>
              <a href="/" className={buttonClass('outline')}>
                Go to Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
