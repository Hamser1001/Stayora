import { Link } from 'react-router-dom';
import Media from '../components/Media.jsx';
import Reveal from '../components/Reveal.jsx';
import { useSeo } from '../lib/useSeo.js';
import { site } from '../content/site.js';

export default function AboutPage() {
  useSeo({
    title: 'About Stayora',
    description:
      'A surf house built by people from Tamraght: simple rooms, local surf guides, shared dinners and a rooftop over the Atlantic.',
    path: '/about',
    image: '/images/tamraght-hillside.jpg',
  });

  return (
    <>
      <header className="page-hero">
        <div className="shell page-hero__inner">
          <p className="eyebrow">The house</p>
          <h1 className="page-hero__title">
            Built for the <em>long way round.</em>
          </h1>
          <p className="lede">
            Stayora began with a roof, a kettle and too many surfboards in the hallway. It is
            still that — with better mattresses and a kitchen that can feed twenty.
          </p>
        </div>
      </header>

      <section className="page-section">
        <div className="shell two-col" style={{ alignItems: 'center' }}>
          <Reveal className="media media--zoom" style={{ aspectRatio: '4 / 5' }}>
            <Media
              name="tamraght-hillside"
              alt="Tamraght village on a dry hillside above the Atlantic"
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
            />
          </Reveal>
          <div className="prose">
            <p className="eyebrow">Tamraght</p>
            <h2>A village that kept its pace</h2>
            <p>
              Tamraght is not Taghazout and it is not Agadir. There is one main road, a bakery
              that opens early, a handful of surf shops and a hillside of houses that all seem
              to face the same stretch of water.
            </p>
            <p>
              Living here means knowing which beach works with which wind, when the fishermen
              come in, and that the best hour of the day is usually the one right before the
              light goes.
            </p>
            <p>
              We are a small team from the village and from further away, and we run the house
              the way we would want it run for us: honestly, simply, and with the door open.
            </p>
          </div>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell">
          <div className="pullquote">
            <p>
              “Come for a week of waves. Leave with a phone full of numbers and a <em>reason
              to come back.</em>”
            </p>
            <cite>The house, more or less</cite>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="shell">
          <div className="section-head">
            <h2>What we care about</h2>
            <p>Three things, in this order: the water, the people, the house.</p>
          </div>
          <div className="rooms-preview" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {[
              {
                title: 'Local first',
                text: 'Our instructors, drivers, cooks and cleaners are from Tamraght and Aourir. The money stays in the village.',
              },
              {
                title: 'Small footprint',
                text: 'Solar water heating, refillable water, no single-use plastics in the kitchen, and repairs before replacements.',
              },
              {
                title: 'A real welcome',
                text: 'No script at reception. You get the tide chart, the Wi-Fi code and an honest opinion about your surfing.',
              },
            ].map((value, index) => (
              <Reveal key={value.title} delay={index * 0.06} className="prose">
                <p className="eyebrow">{String(index + 1).padStart(2, '0')}</p>
                <h3 style={{ fontSize: '1.4rem' }}>{value.title}</h3>
                <p>{value.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell">
          <div className="two-col" style={{ alignItems: 'center' }}>
            <div className="prose">
              <h2>The days go like this</h2>
              <p>
                Coffee and breakfast from 7:30. Vans leave for the surf around 9. Back for
                lunch and shade. Yoga or a walk in the late afternoon. Dinner on the roof when
                the wind drops, tea until people drift off.
              </p>
              <p>
                Nothing is compulsory. If you would rather read on the terrace all day, the
                kettle is there and nobody will ask why.
              </p>
              <Link to="/booking" className="btn">
                Come and stay <span className="arrow">→</span>
              </Link>
            </div>
            <Reveal className="media media--zoom" style={{ aspectRatio: '4 / 3' }}>
              <Media name="dinner" alt="A communal dinner with tagine, bread and mint tea" sizes="(max-width: 900px) 100vw, 50vw" />
            </Reveal>
          </div>
          <p className="micro" style={{ marginTop: 'clamp(2rem, 4vw, 3rem)' }}>
            {site.name} · {site.address}
          </p>
        </div>
      </section>
    </>
  );
}
