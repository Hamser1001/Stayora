import { Component } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';

/**
 * Catches render/lifecycle errors so a single broken view can never blank the app.
 * `resetKey` (usually the current pathname) clears the error when the user navigates away.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error caught by ErrorBoundary', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback error={this.state.error} variant={this.props.variant} />;
  }
}

function ErrorFallback({ error, variant }) {
  const { t } = useTranslation();
  const reload = () => window.location.reload();

  const body = (
    <>
      <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <p className="mt-3 font-display text-[14px] font-semibold">{t('errors.crashTitle')}</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
        {t('errors.crashBody')}
      </p>
      {import.meta.env.DEV && error?.message ? (
        <p className="mt-2 max-w-sm break-words rounded-md bg-muted px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
          {error.message}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={reload}>
          <RotateCw className="size-3.5" />
          {t('errors.reload')}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="size-3.5" />
            {t('errors.goHome')}
          </Link>
        </Button>
      </div>
    </>
  );

  if (variant === 'inline') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive-soft/50 px-6 py-12 text-center"
      >
        {body}
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-md text-center">
        <LogoMark className="mx-auto size-12 bg-primary text-primary-foreground" />
        <div className="mt-6 flex flex-col items-center">{body}</div>
      </div>
    </div>
  );
}
