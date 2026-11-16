import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="h-full grid place-items-center p-8 gradient-bg text-white">
        <div className="glass rounded-xl p-6 max-w-xl w-full">
          <div className="text-base font-semibold mb-2">Something crashed</div>
          <pre className="allow-select text-xs text-red-200 whitespace-pre-wrap break-all bg-black/30 rounded-md p-3 max-h-64 overflow-auto">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
          <button className="btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
