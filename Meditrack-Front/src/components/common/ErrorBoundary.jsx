import React from 'react';

// Catches a rendering error anywhere below it, so a bug in one screen shows a message with a
// way out instead of a blank page. Details go to the console only, never to the user.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[ui]', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-nunito">
        <div role="alert" className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center space-y-3">
          <h1 className="text-lg font-extrabold text-slate-900 font-noto-serif">Something went wrong</h1>
          <p className="text-xs font-semibold text-slate-500">This page could not be displayed. Your data has not been changed.</p>
          <button type="button" onClick={() => window.location.reload()} className="px-5 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer">
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
