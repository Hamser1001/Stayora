/**
 * Site content and property facts.
 *
 * Contact details are placeholders to be replaced with the property's real
 * email, phone and address before launch (see website/README.md).
 */

export const site = {
  name: 'Stayora',
  location: 'Tamraght · Aourir · Morocco',
  region: 'Souss-Massa, Morocco',
  address: 'Tamraght, Aourir 80000, Morocco',
  email: 'hello@stayora.ma',
  phone: '+212 600 000 000',
  whatsapp: 'https://wa.me/212600000000',
  instagram: 'https://instagram.com/',
  coordinates: { lat: 30.5064, lng: -9.653 },
  checkIn: 'from 15:00',
  checkOut: 'by 11:00',
  mapsUrl: 'https://www.google.com/maps?q=30.5064,-9.653',
};

export const experienceItems = [
  {
    id: 'lessons',
    title: 'Learn with people who live here',
    meta: 'Daily · 2–3h · all levels',
    text: 'Small groups, local instructors and the right beach for the day. We read the swell in the morning and drive to whichever break is working — Devil’s Rock, Banana Beach, Panorama or somewhere quieter.',
    image: 'surf-lesson',
    alt: 'A surf instructor teaching a beginner on a wide Moroccan beach',
  },
  {
    id: 'boards',
    title: 'A quiver, not a rental counter',
    meta: 'Boards & wetsuits · included for guests',
    text: 'Soft-tops to step up on, longboards for small days, and a few shortboards for when the Atlantic turns on. Wax, leashes and wetsuits live in the drying room by the door.',
    image: 'lineup',
    alt: 'Surfers waiting in the Atlantic lineup at golden hour',
  },
  {
    id: 'rooftop',
    title: 'Rooftop mornings & mint tea',
    meta: 'Every day · sunrise to sunset',
    text: 'Breakfast on the terrace with the ocean in front of you, yoga mats for slow mornings, and a corner of shade for the hours when the sun is too much. The kettle is always on.',
    image: 'rooftop',
    alt: 'Rooftop terrace with cushions and lanterns above the Atlantic',
  },
  {
    id: 'table',
    title: 'One table, every evening',
    meta: 'Family-style dinners · a few nights a week',
    text: 'Tagine, salads, bread from the village and whatever the fishermen brought in. It is the easiest way to meet the people you will end up surfing with tomorrow.',
    image: 'dinner',
    alt: 'Guests sharing a communal dinner with tagine and mint tea',
  },
  {
    id: 'coast',
    title: 'The coast beyond the village',
    meta: 'Half & full days · arranged at reception',
    text: 'Paradise Valley, the Argan groves above Aourir, Imsouane when the swell is small, or a hammam in Agadir. We arrange the car and the guide; you bring the afternoon.',
    image: 'tamraght-hillside',
    alt: 'Tamraght village on a dry hillside above the Atlantic',
  },
];

export const galleryItems = [
  { image: 'hero-atlantic', alt: 'Atlantic swell breaking off the Moroccan coast at dawn', caption: 'First light, Tamraght' },
  { image: 'lineup', alt: 'Three surfers waiting in the lineup', caption: 'The lineup, late afternoon' },
  { image: 'rooftop', alt: 'Rooftop terrace with cushions and lanterns', caption: 'Rooftop, golden hour' },
  { image: 'tamraght-hillside', alt: 'Village houses on a dry hillside above the sea', caption: 'The village, from the hill' },
  { image: 'surf-lesson', alt: 'A surf lesson on the sand', caption: 'Learning on the sand' },
  { image: 'dorm', alt: 'Bunk room with linen, rattan lamps and terracotta walls', caption: 'The dorm, midday' },
  { image: 'private-room', alt: 'Private room with linen sheets and an arched window', caption: 'A room of your own' },
  { image: 'details', alt: 'Zellige tiles, pottery and woven textiles', caption: 'Things made by hand' },
  { image: 'dinner', alt: 'Communal dinner with tagine and candles', caption: 'One long table' },
  { image: 'waves', alt: 'Atlantic foam on dark volcanic rock', caption: 'The Atlantic, close up' },
];

export const roomImages = {
  dorm: { image: 'dorm', alt: 'Bunk beds with cream linen in a Moroccan surf hostel dorm' },
  private: { image: 'private-room', alt: 'Private room with linen sheets and warm plaster walls' },
  twin: { image: 'private-room', alt: 'Twin room with two beds and a window onto the coast' },
  family: { image: 'rooftop', alt: 'Family room opening onto the rooftop terrace' },
  suite: { image: 'private-room', alt: 'Suite with a low bed and an arched window' },
};

export const amenityLabels = {
  wifi: 'Wi-Fi',
  lockers: 'Lockers',
  window: 'Window',
  desk: 'Desk',
  balcony: 'Balcony',
  privateBathroom: 'Private bathroom',
  airConditioning: 'Air conditioning',
  accessible: 'Step-free access',
};

/**
 * Surf spots and landmarks around the house, with real coordinates.
 * The map is an artistic locator drawn from these points; distances are
 * approximate driving/walking times from Tamraght village.
 */
export const spots = [
  {
    id: 'tamraght',
    name: 'Tamraght',
    kind: 'Village · home',
    lat: 30.5064,
    lng: -9.653,
    level: 'Our street, the bakery, the surf shops and the road down to the water.',
  },
  {
    id: 'aourir',
    name: 'Aourir',
    kind: 'Village · 5 min',
    lat: 30.4926,
    lng: -9.6426,
    level: 'Banana Village: the Sunday market, argan co-operatives and the road inland to Paradise Valley.',
  },
  {
    id: 'devils-rock',
    name: 'Devil’s Rock',
    kind: 'Beach break · 6 min',
    lat: 30.5061,
    lng: -9.688,
    level: 'Sand bottom, lefts and rights, busy with surf schools. The easiest place to find your feet.',
  },
  {
    id: 'banana-beach',
    name: 'Banana Beach',
    kind: 'Beach break · 8 min',
    lat: 30.5007,
    lng: -9.665,
    level: 'Soft, sheltered peaks between Tamraght and Aourir. Good on small days and for longboards.',
  },
  {
    id: 'imourane',
    name: 'Imourane',
    kind: 'Beach · 10 min',
    lat: 30.527,
    lng: -9.693,
    level: 'Wide sand, mellow waves and space to spread out. A good swim and sunset beach.',
  },
  {
    id: 'panorama',
    name: 'Panorama',
    kind: 'Point & beach · 12 min',
    lat: 30.535,
    lng: -9.707,
    level: 'The inside section of the Anchor Point bay; playful rights and a sandy teaching peak.',
  },
  {
    id: 'taghazout',
    name: 'Taghazout',
    kind: 'Village · 15 min',
    lat: 30.5455,
    lng: -9.71,
    level: 'Cafés, skate park and Hash Point right in front of the village.',
  },
  {
    id: 'anchor-point',
    name: 'Anchor Point',
    kind: 'World-class right · 17 min',
    lat: 30.545,
    lng: -9.7258,
    level: 'The famous one. Fast, rocky and for experienced surfers only — watch it from the cliff if in doubt.',
  },
];

export const practical = [
  { label: 'Arrival', value: 'Agadir–Al Massira (AGA), 45–55 min by road' },
  { label: 'Check-in', value: `${site.checkIn} · check-out ${site.checkOut}` },
  { label: 'Getting here', value: 'Taxi or pre-arranged transfer from Agadir or the airport' },
  { label: 'Currency', value: 'Moroccan dirham (MAD); card accepted in larger shops' },
  { label: 'Languages', value: 'Arabic, Amazigh, French, English, Spanish' },
  { label: 'Best swell', value: 'September to April for the Atlantic; summer for beginners' },
];
