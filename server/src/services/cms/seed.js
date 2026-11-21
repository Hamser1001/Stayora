import { cmsModels } from '../../db/cmsModels.js';
import { nextIdFor } from '../snapshot.js';
import { WORKSPACE_KEY } from './scope.js';

/**
 * Starter content
 * ---------------
 * A new workspace gets the pages every hostel website needs, as drafts, so the
 * CMS is usable on first visit without a "blank page" problem. Seeding runs
 * once; deleting the starter pages does not bring them back.
 */
const STARTER_PAGES = [
  {
    title: 'Home',
    slug: 'home',
    systemKey: 'home',
    description: 'The first page guests see.',
    sections: [
      {
        type: 'hero',
        content: {
          heading: 'Stay with us',
          subheading: 'Beds, rooms and good company in the heart of the city.',
          overlay: 'soft',
          align: 'left',
          ctaLabel: 'See rooms',
          ctaHref: '/rooms',
        },
      },
      {
        type: 'features',
        content: {
          heading: 'Why guests choose us',
          intro: 'Add the amenities and services that make your hostel different.',
          items: [
            { title: 'Fast Wi-Fi', description: 'Every bed, every floor.' },
            { title: 'Local breakfast', description: 'Fresh, every morning.' },
          ],
        },
      },
    ],
  },
  {
    title: 'About us',
    slug: 'about',
    systemKey: 'about',
    description: 'Who we are and how the hostel started.',
    sections: [
      {
        type: 'text',
        content: {
          heading: 'Our story',
          body: 'Tell guests how the hostel began and what they can expect when they arrive.',
          align: 'left',
        },
      },
    ],
  },
  {
    title: 'Rooms',
    slug: 'rooms',
    systemKey: 'rooms',
    description: 'Room types, beds and what is included.',
    sections: [
      {
        type: 'text',
        content: {
          heading: 'Sleep well',
          body: 'Describe your rooms and beds here. Live availability and prices always come from Stayora, never from this page.',
          align: 'left',
        },
      },
    ],
  },
  {
    title: 'Gallery',
    slug: 'gallery',
    systemKey: 'gallery',
    description: 'Photos of the hostel, rooms and surroundings.',
    sections: [{ type: 'gallery', content: { heading: 'Gallery', images: [], layout: 'grid' } }],
  },
  {
    title: 'Experiences',
    slug: 'experiences',
    systemKey: 'experiences',
    description: 'Tours, events and things to do nearby.',
    sections: [
      {
        type: 'features',
        content: {
          heading: 'Things to do',
          intro: 'Share the experiences your team can help guests book.',
          items: [{ title: 'City walk', description: 'A guided walk every afternoon.' }],
        },
      },
    ],
  },
  {
    title: 'Contact',
    slug: 'contact',
    systemKey: 'contact',
    description: 'How to reach the hostel.',
    sections: [
      {
        type: 'text',
        content: {
          heading: 'Find us',
          body: 'Add your address and directions here. Contact details come from the website settings.',
          align: 'left',
        },
      },
    ],
  },
];

export async function seedStarterContent(site) {
  if (!site || site.seededAt) return;
  const existing = await cmsModels.CmsPage.countDocuments({ workspaceKey: WORKSPACE_KEY });
  const now = new Date().toISOString();

  const created = new Map();

  if (existing === 0) {
    for (const [index, spec] of STARTER_PAGES.entries()) {
      const page = await cmsModels.CmsPage.create({
        id: await nextIdFor('page', cmsModels.CmsPage),
        workspaceKey: WORKSPACE_KEY,
        siteId: site.id,
        title: spec.title,
        slug: spec.slug,
        description: spec.description,
        status: 'draft',
        visibility: 'public',
        systemKey: spec.systemKey,
        order: index,
        seo: { title: '', description: '', canonicalUrl: '', ogImageMediaId: '', noIndex: false },
        revision: 0,
        published: null,
        createdAt: now,
        updatedAt: now,
        createdBy: 'System',
        updatedBy: 'System',
      });
      created.set(spec.systemKey, page.id);

      for (const [sectionIndex, section] of spec.sections.entries()) {
        await cmsModels.CmsSection.create({
          id: await nextIdFor('section', cmsModels.CmsSection),
          workspaceKey: WORKSPACE_KEY,
          siteId: site.id,
          pageId: page.id,
          type: section.type,
          variant: '',
          order: sectionIndex,
          visible: true,
          contentVersion: 1,
          content: section.content,
          createdAt: now,
          updatedAt: now,
          createdBy: 'System',
          updatedBy: 'System',
        });
      }
    }

    const menu = [
      ['Home', 'home'],
      ['About us', 'about'],
      ['Rooms', 'rooms'],
      ['Gallery', 'gallery'],
      ['Contact', 'contact'],
    ]
      .filter(([, key]) => created.has(key))
      .map(([label, key], index) => ({
        id: `nav_item_${index + 1}`,
        label,
        type: 'page',
        pageId: created.get(key),
        visible: true,
        newTab: false,
      }));

    await cmsModels.CmsNavigation.findOneAndUpdate(
      { workspaceKey: WORKSPACE_KEY, siteId: site.id, location: 'header' },
      {
        $setOnInsert: { id: 'cms_nav_header', location: 'header', siteId: site.id, items: menu, updatedAt: now },
      },
      { upsert: true },
    );
    await cmsModels.CmsNavigation.findOneAndUpdate(
      { workspaceKey: WORKSPACE_KEY, siteId: site.id, location: 'footer' },
      {
        $setOnInsert: { id: 'cms_nav_footer', location: 'footer', siteId: site.id, items: [], updatedAt: now },
      },
      { upsert: true },
    );
  }

  await cmsModels.CmsSite.updateOne(
    { workspaceKey: WORKSPACE_KEY, id: site.id },
    { $set: { seededAt: now } },
  );
}

export { STARTER_PAGES };
