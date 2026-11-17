import { Component, type ReactNode } from "react";

/** 1つの画面でエラーが起きてもアプリ全体が止まらないようにする */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <h1>画面を表示できませんでした</h1>
        <div className="card">
          <p>この画面でエラーが発生しました。学習データは保存されています。</p>
          <p className="small muted">{this.state.error.message}</p>
          <a className="btn" href="#/dashboard">
            Dashboard に戻る
          </a>
        </div>
      </div>
    );
  }
}
