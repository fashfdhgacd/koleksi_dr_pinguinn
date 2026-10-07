import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { failed: boolean };

/** Isolates a subtree: if it throws while rendering, render the fallback (nothing by default) instead of erroring the page. */
export class SafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== "undefined") console.error("[SafeBoundary]", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
