import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[EWS UI]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main className="fatal-error"><div className="surface"><h1>Arayüz hatası</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Yeniden yükle</button></div></main>;
    }
    return this.props.children;
  }
}
