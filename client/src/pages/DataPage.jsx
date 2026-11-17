import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { api, isApiError } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton, Spinner } from '@/components/ui/loading';
import { SegmentedControl, SegmentedOption } from '@/components/ui/segmented';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function CollectionRow({ collection, selected, onToggle }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={!collection.accessible}
      onClick={() => onToggle(collection.key)}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/30 bg-primary-soft/50'
          : 'border-border bg-card hover:bg-muted/40',
        !collection.accessible && 'cursor-not-allowed opacity-55 hover:bg-card',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold">{collection.label}</span>
          {!collection.accessible ? <Lock className="size-3 text-muted-foreground" /> : null}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {collection.accessible ? collection.description : t('data.noAccess')}
        </span>
      </span>
    </button>
  );
}

function SummaryChips({ summary }) {
  const { t } = useTranslation();
  const items = [
    { key: 'rows', label: t('data.rows'), value: summary.rows, tone: 'neutral' },
    { key: 'valid', label: t('data.valid'), value: summary.valid, tone: 'success' },
    { key: 'invalid', label: t('data.invalid'), value: summary.invalid, tone: summary.invalid ? 'danger' : 'neutral' },
    { key: 'duplicates', label: t('data.duplicates'), value: summary.duplicates, tone: summary.duplicates ? 'warning' : 'neutral' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item.key} variant={item.tone}>
          {item.label} <span className="numeric font-semibold">{item.value}</span>
        </Badge>
      ))}
    </div>
  );
}

export function DataPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState('export');
  const [selected, setSelected] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [collection, setCollection] = useState('rooms');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef(null);

  const { data, loading, error, reload } = useApiResource(() => api.data.collections(), []);
  const collections = useMemo(() => data || [], [data]);
  const accessible = collections.filter((entry) => entry.accessible);
  const current = collections.find((entry) => entry.key === collection) || accessible[0];

  const toggle = (key) =>
    setSelected((list) => (list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key]));

  const exportData = async () => {
    if (!selected.length) return;
    setExporting(true);
    try {
      const { blob, filename } = await api.data.download({ collections: selected });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t('data.exported', { count: selected.length }));
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t('errors.body'));
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async () => {
    if (!current) return;
    try {
      const { blob, filename } = await api.data.download({ template: current.key });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t('errors.body'));
    }
  };

  const readFile = (picked) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(picked);
    });

  const validate = async () => {
    if (!file || !current) return;
    setValidating(true);
    setResult(null);
    try {
      const base64 = await readFile(file);
      const preview = await api.data.importFile({
        collection: current.key,
        file: base64,
        dryRun: true,
      });
      setResult(preview);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t('errors.body'));
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } finally {
      setValidating(false);
    }
  };

  const commit = async () => {
    if (!file || !current) return;
    setImporting(true);
    try {
      const base64 = await readFile(file);
      const committed = await api.data.importFile({
        collection: current.key,
        file: base64,
        dryRun: false,
      });
      setResult(committed);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      toast.success(t('data.imported', { count: committed.summary.inserted }));
      await reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t('errors.body'));
    } finally {
      setImporting(false);
    }
  };

  if (!can('data')) {
    return (
      <div className="space-y-5">
        <PageHeader title={t('data.title')} subtitle={t('data.subtitle')} />
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Lock className="size-5" />
          </span>
          <p className="text-[13px] font-semibold">{t('data.noAccessTitle')}</p>
          <p className="max-w-[360px] text-[11.5px] leading-relaxed text-muted-foreground">
            {t('data.noAccess')}
          </p>
        </Card>
      </div>
    );
  }

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('data.title')}
        subtitle={t('data.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
            <FileSpreadsheet className="size-3" />
            {t('data.collectionCount', { count: accessible.length })}
          </span>
        }
        actions={
          <SegmentedControl>
            <SegmentedOption active={tab === 'export'} icon={Download} onClick={() => setTab('export')}>
              {t('data.export')}
            </SegmentedOption>
            <SegmentedOption active={tab === 'import'} icon={Upload} onClick={() => setTab('import')}>
              {t('data.import')}
            </SegmentedOption>
          </SegmentedControl>
        }
      />

      {tab === 'export' ? (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-[14px] font-semibold">{t('data.exportTitle')}</h3>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {t('data.exportBody')}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelected(accessible.map((entry) => entry.key))}
              >
                {t('common.selectAll')}
              </Button>
            </div>

            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {collections.map((entry) => (
                <CollectionRow
                  key={entry.key}
                  collection={entry}
                  selected={selected.includes(entry.key)}
                  onToggle={toggle}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
              <p className="text-[11px] text-muted-foreground">
                {t('data.selectedCount', { count: selected.length })}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                  {t('common.clear')}
                </Button>
                <Button size="sm" disabled={!selected.length || exporting} onClick={exportData}>
                  {exporting ? <Spinner /> : <Download className="size-4" />}
                  {t('data.download')}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h3 className="font-display text-[14px] font-semibold">{t('data.exportNotesTitle')}</h3>
            <ul className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
              {['format', 'sheets', 'scope', 'relationships'].map((key) => (
                <li key={key} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-available" />
                  {t(`data.exportNotes.${key}`)}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="p-4 sm:p-5">
            <h3 className="font-display text-[14px] font-semibold">{t('data.importTitle')}</h3>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {t('data.importBody')}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-1.5 text-[11.5px] font-medium">{t('data.collection')}</p>
                <Select
                  value={current?.key || ''}
                  onValueChange={(value) => {
                    setCollection(value);
                    setResult(null);
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accessible.map((entry) => (
                      <SelectItem key={entry.key} value={entry.key}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {current ? (
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                    {current.description}
                  </p>
                ) : null}
              </div>

              <label
                htmlFor="import-file"
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
                  file ? 'border-primary/40 bg-primary-soft/30' : 'border-border bg-muted/20 hover:bg-muted/40',
                )}
              >
                <span className="grid size-9 place-items-center rounded-lg bg-card text-primary shadow-xs">
                  <FileUp className="size-4" />
                </span>
                <span className="text-[12px] font-medium">
                  {file ? file.name : t('data.chooseFile')}
                </span>
                <span className="text-[10.5px] text-muted-foreground">{t('data.fileHint')}</span>
                <input
                  ref={fileInput}
                  id="import-file"
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={(event) => {
                    const picked = event.target.files?.[0] || null;
                    setFile(picked);
                    setResult(null);
                  }}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!file || validating} onClick={validate}>
                  {validating ? <Spinner /> : <Upload className="size-4" />}
                  {t('data.validate')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download className="size-3.5" />
                  {t('data.template')}
                </Button>
              </div>

              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                {t('data.importHint')}
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            {!result ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <AlertTriangle className="size-4.5" strokeWidth={1.8} />
                </span>
                <p className="text-[12.5px] font-semibold">{t('data.noResultTitle')}</p>
                <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted-foreground">
                  {t('data.noResultBody')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-[14px] font-semibold">
                      {result.dryRun ? t('data.previewTitle') : t('data.resultTitle')}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('data.resultFor', {
                        collection:
                          collections.find((entry) => entry.key === result.collection)?.label ||
                          result.collection,
                      })}
                    </p>
                  </div>
                  <Badge variant={result.summary.valid ? 'success' : 'danger'}>
                    {result.summary.valid ? t('data.ready') : t('data.blocked')}
                  </Badge>
                </div>

                <SummaryChips summary={result.summary} />

                {result.summary.inserted > 0 ? (
                  <p className="rounded-lg border border-status-available/25 bg-status-available-soft px-3 py-2 text-[11.5px] font-medium text-status-available">
                    {t('data.insertedRows', { count: result.summary.inserted })}
                  </p>
                ) : null}

                {result.errors?.length ? (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="max-h-[280px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">{t('data.row')}</TableHead>
                            <TableHead>{t('data.column')}</TableHead>
                            <TableHead>{t('data.problem')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.errors.map((entry, index) => (
                            <TableRow key={`${entry.row}-${entry.column}-${index}`}>
                              <TableCell className="numeric text-[11px] text-muted-foreground">
                                {entry.row}
                              </TableCell>
                              <TableCell className="text-[11px] font-medium">{entry.column}</TableCell>
                              <TableCell className="text-[11px] text-muted-foreground">
                                {entry.message}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11.5px] text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-status-available" />
                    {t('data.noErrors')}
                  </p>
                )}

                {result.dryRun ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <p className="text-[10.5px] text-muted-foreground">
                      {t('data.commitHint', { count: result.summary.valid })}
                    </p>
                    <Button
                      size="sm"
                      disabled={!result.summary.valid || importing}
                      onClick={commit}
                    >
                      {importing ? <Spinner /> : <Upload className="size-4" />}
                      {t('data.confirmImport', { count: result.summary.valid })}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResult(null);
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = '';
                    }}
                  >
                    <X className="size-3.5" />
                    {t('data.startOver')}
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
