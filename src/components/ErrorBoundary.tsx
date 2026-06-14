import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a1a',
          color: '#e0e0e0',
          fontFamily: 'sans-serif',
        }}>
          <h2 style={{ color: '#ff4444', marginBottom: 12 }}>出错了</h2>
          <p style={{ color: '#888', marginBottom: 16, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message ?? '应用遇到了未知错误'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 24px',
              background: '#2a2a5a',
              color: '#ccc',
              border: '1px solid #3a3a6a',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
