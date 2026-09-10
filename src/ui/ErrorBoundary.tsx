import { Component } from 'react';
import type { ReactNode } from 'react';

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Catches render errors from its subtree (incl. the R3F <Canvas>) so a WebGL /
 * scene failure degrades gracefully instead of unmounting the whole app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24,
          background: '#1a1e22', color: '#e7ebee', font: '12px/1.5 ui-monospace, monospace',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: '#e0a34a' }}>
            ⚠ {this.props.label ?? 'Erreur'} — le rendu 3D a échoué
          </div>
          <pre style={{ maxWidth: 560, whiteSpace: 'pre-wrap', color: '#9aa3ab', margin: 0 }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 6, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              background: '#20262b', color: '#e7ebee', border: '1px solid #2f353a' }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
