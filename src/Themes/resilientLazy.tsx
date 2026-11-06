// React.lazy, but a failed chunk load is not final.
//
// React caches a rejected lazy() promise for the life of the page, and the
// theme views had no error boundary of their own: one chunk that failed to
// download (network blip, a deploy that removed the old hashes, the relay
// mid-restart) replaced the whole OBS page with "Something went wrong" until
// someone reloaded the source. Post-match / awards views — the chunks least
// likely to be loaded already — hit it first.
//
// Here the import is retried a few times, and if it still fails the view
// renders nothing and tries again with a fresh lazy() a little later.
import React from 'react';

const IMPORT_RETRY_MS = [1000, 3000];
const REMOUNT_AFTER_MS = 10_000;

function retryImport<T>(load: () => Promise<T>): Promise<T> {
  return IMPORT_RETRY_MS.reduce<Promise<T>>(
    (attempt, wait) => attempt.catch(() => new Promise<T>((res, rej) => {
      setTimeout(() => load().then(res, rej), wait);
    })),
    load()
  );
}

class RetryBoundary extends React.Component<
  { label: string; onRetry: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | null = null;
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(`[theme] "${this.props.label}" failed to load/render — retrying in ${REMOUNT_AFTER_MS / 1000}s:`, err);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.props.onRetry();
      this.setState({ failed: false });
    }, REMOUNT_AFTER_MS);
  }
  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function resilientLazy<P extends object>(
  label: string,
  load: () => Promise<{ default: React.ComponentType<P> }>
): React.ComponentType<P> {
  const make = () => React.lazy(() => retryImport(load));
  let Lazy = make();
  const View = (props: P) => {
    const [, rerender] = React.useState(0);
    return (
      <RetryBoundary label={label} onRetry={() => { Lazy = make(); rerender((n) => n + 1); }}>
        <Lazy {...props} />
      </RetryBoundary>
    );
  };
  View.displayName = `Resilient(${label})`;
  return View;
}
