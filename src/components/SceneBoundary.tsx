import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; message: string }

/** Shows a message when a model or WebGL fails, instead of a blank page. */
export default class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="notice" role="alert">
        <p>{this.props.message}</p>
        <button type="button" className="button" onClick={() => window.location.reload()}>
          Muat ulang
        </button>
      </div>
    )
  }
}
