import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Image as ImageIcon, LayoutTemplate, Navigation, Settings2 } from 'lucide-react';
import { api, apiMode } from '@/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageSkeleton, Spinner } from '@/components/ui/loading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PagesTab } from '@/features/cms/PagesTab';
import { MediaTab } from '@/features/cms/MediaTab';
import { BrandingTab } from '@/features/cms/BrandingTab';
import { NavigationTab } from '@/features/cms/NavigationTab';
import { SiteTab } from '@/features/cms/SiteTab';

const TABS = [
  { value: 'pages', icon: LayoutTemplate, labelKey: 'cms.tabs.pages' },
  { value: 'media', icon: ImageIcon, labelKey: 'cms.tabs.media' },
  { value: 'branding', icon: Globe, labelKey: 'cms.tabs.branding' },
  { value: 'navigation', icon: Navigation, labelKey: 'cms.tabs.navigation' },
  { value: 'settings', icon: Settings2, labelKey: 'cms.tabs.settings' },
];

/**
 * CMS shell inside the dashboard. The page owns loading and the shared media
 * library; each tab talks to the same `/api/cms` contract, so the future
 * public website and any other client use exactly the same backend.
 */
export function CmsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('pages');
  const [state, setState] = useState({
    loading: true,
    error: null,
    overview: null,
    pages: [],
    media: [],
    sectionTypes: [],
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [overview, pages, media, sectionTypes] = await Promise.all([
        api.cms.overview(),
        api.cms.pages(),
        api.cms.media(),
        api.cms.sectionTypes(),
      ]);
      setState({ loading: false, error: null, overview, pages, media, sectionTypes });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, []);

  useEffect(() => {
    if (apiMode !== 'http') return;
    load();
  }, [load]);

  const reloadPages = useCallback(async () => {
    const [overview, pages] = await Promise.all([api.cms.overview(), api.cms.pages()]);
    setState((current) => ({ ...current, overview, pages }));
  }, []);

  const reloadMedia = useCallback(async () => {
    const [overview, media] = await Promise.all([api.cms.overview(), api.cms.media()]);
    setState((current) => ({ ...current, overview, media }));
  }, []);

  const reloadOverview = useCallback(async () => {
    const overview = await api.cms.overview();
    setState((current) => ({ ...current, overview }));
  }, []);

  if (apiMode !== 'http') {
    return (
      <>
        <PageHeader title={t('cms.title')} subtitle={t('cms.subtitle')} />
        <EmptyState
          icon={Globe}
          title={t('cms.demoOnlyTitle')}
          description={t('cms.demoOnlyBody')}
        />
      </>
    );
  }

  if (state.loading && !state.overview) return <PageSkeleton />;
  if (state.error) return <ErrorState message={state.error.message} onRetry={load} />;

  const site = state.overview?.site;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('cms.title')}
        subtitle={site ? t('cms.subtitleSite', { name: site.name, slug: site.slug }) : t('cms.subtitle')}
      />

      <Tabs value={tab} onValueChange={setTab}>
        {/* Five tabs do not fit beside each other on a phone, and the TabsList's
            hidden scrollbar made the last two unreachable. On narrow screens they
            wrap into the same two-column grid the Settings tabs use; from `sm` up
            this is the original inline strip. */}
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:inline-flex sm:h-9 sm:w-auto sm:gap-0.5">
          {TABS.map((entry, index) => (
            <TabsTrigger
              key={entry.value}
              value={entry.value}
              className={
                index === TABS.length - 1 && TABS.length % 2 === 1 ? 'col-span-2 sm:col-auto' : undefined
              }
            >
              <entry.icon className="size-3.5" />
              {t(entry.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="pages">
          {state.loading && !state.pages.length ? (
            <Spinner className="mx-auto my-10" />
          ) : (
            <PagesTab
              pages={state.pages}
              loading={state.loading}
              error={null}
              reload={reloadPages}
              sectionTypes={state.sectionTypes}
              media={state.media}
            />
          )}
        </TabsContent>

        <TabsContent value="media">
          <MediaTab media={state.media} loading={state.loading} onReload={reloadMedia} />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingTab site={site} media={state.media} onSaved={reloadOverview} />
        </TabsContent>

        <TabsContent value="navigation">
          <NavigationTab
            navigation={state.overview?.navigation}
            pages={state.pages}
            onSaved={reloadOverview}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SiteTab
            site={site}
            stats={state.overview?.stats}
            storage={state.overview?.storage}
            onSaved={load}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
