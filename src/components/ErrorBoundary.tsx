import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (e.g. the current view id). */
  resetKey?: unknown;
  label?: string;
  compact?: boolean;
}
interface State {
  error: Error | null;
}

/**
 * Contains render-time crashes to the section that failed. Without this, one
 * thrown error anywhere unmounts the entire app and leaves a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Epoch] ${this.props.label ?? "Section"} crashed`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) return null;
    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="max-w-sm rounded-[28px] p-6 text-center glass-strong">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-gradient-to-b from-ios-orange to-[#c46f00]">
            <TriangleAlert size={22} />
          </span>
          <h3 className="text-[17px] font-semibold">{this.props.label ?? "This section"} hit a snag</h3>
          <p className="mt-1 text-[13px] text-white/50">The rest of Epoch is still running. You can reload just this part.</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition-transform active:scale-95"
          >
            <RotateCcw size={14} /> Reload section
          </button>
        </div>
      </div>
    );
  }
}
