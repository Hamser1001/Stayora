import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Shows a generated temporary password exactly once, with a copy action. */
export function StaffCredentialsDialog({ open, onOpenChange, credentials }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentials?.password || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t('staff.credentialsTitle')}</DialogTitle>
          <DialogDescription>
            {t('staff.credentialsBody', { name: credentials?.name || '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('staff.email')}
            </p>
            <p className="select-all text-[13px] font-medium">{credentials?.email}</p>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary-soft/60 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">
              <KeyRound className="size-3" />
              {t('staff.temporaryPassword')}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="select-all text-[15px] font-semibold tracking-[0.05em]">
                {credentials?.password}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {t('staff.credentialsHint')}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('common.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
