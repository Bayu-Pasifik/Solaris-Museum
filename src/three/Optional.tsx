import { Component, type ReactNode } from 'react'

/** A missing model only removes that model, not the whole room. */
export default class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
