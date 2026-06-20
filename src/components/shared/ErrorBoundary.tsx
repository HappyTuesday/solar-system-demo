import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a1a',
          color: '#ff6b6b',
          gap: '12px',
          padding: '20px',
        }}>
          <h2>程序出错了</h2>
          <p style={{ color: '#a0a0a0', maxWidth: '500px', textAlign: 'center' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              border: '1px solid #4fc3f7',
              borderRadius: '6px',
              background: 'transparent',
              color: '#4fc3f7',
              cursor: 'pointer',
              fontSize: '0.9rem',
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
