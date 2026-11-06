import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation();
  const active = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 rounded-lg text-[13px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          compact ? 'size-9 justify-center' : 'h-9 px-2.5',
        )}
        aria-label={t('common.language')}
      >
        <Globe className="size-4" strokeWidth={1.9} />
        {!compact ? <span className="hidden sm:inline">{active.short}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
        {SUPPORTED_LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onSelect={() => changeLanguage(language.code)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="w-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {language.short}
              </span>
              {language.label}
            </span>
            {i18n.language === language.code ? <Check className="size-3.5 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
