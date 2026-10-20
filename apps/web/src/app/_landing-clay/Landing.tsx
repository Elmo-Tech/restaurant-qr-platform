import Link from 'next/link';
import { WaytaLockup } from '../../components/brand/Wayta';
import { directionOf, type StaffLocale } from '../../lib/i18n/locale';
import { LANDING_COPY } from './copy';
import { body, heading, headingArabic } from './fonts';
import { HeroPhone } from './HeroPhone';
import { LangSwitch } from './LangSwitch';
import { LeadButton, LeadProvider } from './LeadProvider';
import { Pricing } from './Pricing';
import { RevealObserver } from './RevealObserver';
import { ThemeToggle } from './ThemeToggle';
import type { LandingPlans } from './plans-api';
import styles from './landing.module.css';

/** The icon of each feature, drawn on its gradient clay orb. */
const ICONS = [
  <svg key="lang" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5.5 7M12 5c-.5 3-3 6.5-7 8.5M13 20l4-9 4 9M14.4 17h5.2" /></svg>,
  <svg key="orders" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><path d="M16.5 13v7M13 16.5h7" /></svg>,
  <svg key="kitchen" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 9V7M10 7h4M5 21h14" /></svg>,
  <svg key="track" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>,
  <svg key="suggest" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.8 4.6L18.5 10l-4.7 1.4L12 16l-1.8-4.6L5.5 10l4.7-1.4zM18 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>,
  <svg key="import" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" /></svg>,
] as const;

/** A small QR-like pattern (decorative). */
function QrGlyph() {
  const cells: [number, number][] = [
    [9, 1], [11, 1], [13, 2], [9, 3], [12, 3], [10, 5], [13, 5], [1, 9], [3, 10], [5, 9], [6, 11], [2, 12], [9, 9], [11, 10], [13, 9], [10, 12], [12, 13], [9, 13], [14, 12], [5, 13], [7, 9], [13, 11],
  ];
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      {[
        [0, 0],
        [10, 0],
        [0, 10],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="6" height="6" rx="1.4" fill="currentColor" />
          <rect x={x + 1} y={y + 1} width="4" height="4" rx="1" fill="var(--clay-orb-bg, #fff)" />
          <rect x={x + 2} y={y + 2} width="2" height="2" fill="currentColor" />
        </g>
      ))}
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

const ORB_TONES = ['violet', 'saffron', 'pink', 'sky', 'emerald', 'amber'] as const;

/**
 * The public landing page in the Claymorphism direction (DEC-053): digital clay, soft light from the top left,
 * four-layer shadow stacks, bouncy hover and squish, drifting background blobs. The Wayta brand shows through
 * the palette (saffron is the primary clay, candy accents carry the icons) and the smiling cloche's dome.
 * Light and dark themes. A Server Component; the demo phone, plan toggles, theme and language switches, the
 * reveal observer and the request dialog are the only client code.
 */
export function Landing({ locale, plans, theme }: { locale: StaffLocale; plans: LandingPlans | null; theme: 'light' | 'dark' | null }) {
  const c = LANDING_COPY[locale];
  const dir = directionOf(locale);
  const planList = plans?.plans ?? [];

  return (
    <div
      data-landing-root=""
      data-theme={theme ?? 'system'}
      className={`${styles.root} ${heading.variable} ${headingArabic.variable} ${body.variable}`}
      lang={locale}
      dir={dir}
    >
      <RevealObserver />
      <div className={styles.blobs} aria-hidden="true">
        <span className={styles.blob1} />
        <span className={styles.blob2} />
        <span className={styles.blob3} />
        <span className={styles.blob4} />
      </div>

      <LeadProvider copy={c.lead} plans={planList} locale={locale}>
        <header className={styles.nav}>
          <div className={styles.wrap}>
            <div className={styles.navPill}>
              <Link href="/" aria-label="Wayta" className={styles.navBrand}>
                <WaytaLockup tone="auto" size={28} />
              </Link>
              <nav className={styles.navLinks} aria-label={c.nav.menu}>
                <a href="#how">{c.nav.how}</a>
                <a href="#features">{c.nav.features}</a>
                <a href="#designs">{c.nav.designs}</a>
                <a href="#plans">{c.nav.plans}</a>
                <a href="#faq">{c.nav.faq}</a>
              </nav>
              <div className={styles.navEnd}>
                <ThemeToggle labelDark={c.nav.themeDark} labelLight={c.nav.themeLight} />
                <LangSwitch locale={locale} label={c.lang.label} names={{ ar: c.lang.ar, en: c.lang.en }} />
                <Link href="/staff" className={styles.navSignIn}>
                  {c.nav.signIn}
                </Link>
                <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnPrimary} ${styles.navCta}`}>
                  {c.nav.cta}
                </LeadButton>
              </div>
            </div>
          </div>
        </header>

        <main>
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={`${styles.wrap} ${styles.heroGrid}`}>
              <div className={styles.heroCopy}>
                <p className={`${styles.eyebrow} ${styles.rise}`}>{c.hero.eyebrow}</p>
                <h1 id="hero-title" className={`${styles.heading} ${styles.heroTitle} ${styles.rise} ${styles.rise2}`}>
                  <span>{c.hero.title[0]}</span>
                  <span className={styles.gradientText}>{c.hero.title[1]}</span>
                </h1>
                <p className={`${styles.heroLead} ${styles.rise} ${styles.rise3}`}>{c.hero.lead}</p>
                <div className={`${styles.heroActions} ${styles.rise} ${styles.rise3}`}>
                  <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>
                    {c.hero.primary}
                  </LeadButton>
                  <a href="#plans" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnLg}`}>
                    {c.hero.secondary}
                  </a>
                </div>
                <p className={styles.heroNote}>{c.hero.note}</p>
              </div>

              <div className={styles.heroStage}>
                <div className={styles.stageBase} aria-hidden="true" />
                <div className={styles.phoneWrap}>
                  <HeroPhone locale={locale} copy={c.hero} />
                </div>
                <div className={`${styles.orb} ${styles.orbQr}`} aria-hidden="true">
                  <QrGlyph />
                </div>
                <div className={`${styles.orb} ${styles.orbStar}`} aria-hidden="true">
                  ★
                </div>
                <div className={styles.ticketCard} role="img" aria-label={`${c.hero.ticket.kicker}: ${c.hero.ticket.table}, ${c.hero.ticket.item1}, ${c.hero.ticket.item2}`}>
                  <div className={styles.ticketKicker}>
                    <span>{c.hero.ticket.kicker}</span>
                    <span className={styles.ticketLive}>LIVE</span>
                  </div>
                  <b className={styles.ticketTable}>{c.hero.ticket.table}</b>
                  <ul className={styles.ticketItems}>
                    <li>{c.hero.ticket.item1}</li>
                    <li>{c.hero.ticket.item2}</li>
                  </ul>
                  <span className={styles.ticketStatus}>{c.hero.ticket.status}</span>
                </div>
              </div>
            </div>

            <div className={styles.wrap}>
              <ul className={styles.pills} data-reveal="">
                {c.strip.map((item, index) => (
                  <li key={item} className={styles.pill}>
                    <span className={styles.pillDot} data-tone={ORB_TONES[index % ORB_TONES.length]} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="how" className={styles.section} aria-labelledby="how-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <h2 id="how-title" className={`${styles.heading} ${styles.sectionTitle}`}>
                  {c.how.title}
                </h2>
                <p className={styles.sectionLead}>{c.how.lead}</p>
              </div>
              <ol className={styles.steps}>
                {c.how.steps.map((step, index) => (
                  <li key={step.title} className={styles.step} data-reveal="" data-delay={index * 120}>
                    <span className={styles.stepOrb} data-tone={ORB_TONES[index === 0 ? 0 : index === 1 ? 1 : 4]}>
                      {(index + 1).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}
                    </span>
                    <div className={styles.card}>
                      <span className={styles.stepTag}>{step.tag}</span>
                      <h3 className={`${styles.heading} ${styles.cardTitle}`}>{step.title}</h3>
                      <p className={styles.cardText}>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="features" className={styles.section} aria-labelledby="features-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <h2 id="features-title" className={`${styles.heading} ${styles.sectionTitle}`}>
                  {c.features.title}
                </h2>
                <p className={styles.sectionLead}>{c.features.lead}</p>
              </div>
              <div className={styles.bento}>
                {c.features.items.map((item, index) => (
                  <article key={item.title} className={`${styles.card} ${styles.bentoCard} ${index === 0 ? styles.bentoHero : ''}`} data-reveal="" data-delay={(index % 3) * 100}>
                    <span className={styles.iconOrb} data-tone={ORB_TONES[index % ORB_TONES.length]}>
                      {ICONS[index]}
                    </span>
                    <h3 className={`${styles.heading} ${styles.cardTitle}`}>{item.title}</h3>
                    <p className={styles.cardText}>{item.text}</p>
                    {index === 0 ? (
                      <div className={styles.peek} aria-hidden="true">
                        <div className={styles.peekRow}>
                          <b>برجر مشوي</b>
                          <span dir="ltr">145 EGP</span>
                        </div>
                        <div className={styles.peekRow}>
                          <b dir="ltr">Grilled burger</b>
                          <span dir="ltr">145 EGP</span>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="designs" className={styles.section} aria-labelledby="designs-title">
            <div className={styles.wrap}>
              <div className={styles.designSplit}>
                <div data-reveal="">
                  <h2 id="designs-title" className={`${styles.heading} ${styles.sectionTitle}`}>
                    {c.designs.title}
                  </h2>
                  <p className={styles.designLead}>{c.designs.lead}</p>
                  <p className={styles.designNote}>{c.designs.note}</p>
                  <div className={styles.designAction}>
                    <a href="#plans" className={`${styles.btn} ${styles.btnSecondary}`}>
                      {c.designs.cta}
                    </a>
                  </div>
                </div>
                <div className={styles.designBoard} data-reveal="" data-delay="140">
                  <ul className={styles.designTags}>
                    {c.designs.names.map((name, index) => (
                      <li key={name} data-tone={ORB_TONES[index % ORB_TONES.length]}>
                        {name}
                      </li>
                    ))}
                  </ul>
                  <div className={styles.seasonRow}>
                    <span>{c.designs.seasonsLabel}</span>
                    {c.designs.seasons.map((season) => (
                      <b key={season}>{season}</b>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="plans" className={styles.section} aria-labelledby="plans-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <h2 id="plans-title" className={`${styles.heading} ${styles.sectionTitle}`}>
                  {c.plans.title}
                </h2>
                <p className={styles.sectionLead}>{c.plans.lead}</p>
              </div>
              {planList.length > 0 ? (
                <Pricing plans={planList} copy={c.plans} locale={locale} />
              ) : (
                <div className={`${styles.card} ${styles.plansError}`} role="status">
                  <strong>{c.plans.unavailable}</strong>
                  {c.plans.retry}
                </div>
              )}
            </div>
          </section>

          <section className={styles.trialSection} aria-labelledby="trial-title">
            <div className={styles.wrap}>
              <div className={styles.trialBox} data-reveal="">
                <span className={`${styles.trialBubble} ${styles.trialBubble1}`} aria-hidden="true" />
                <span className={`${styles.trialBubble} ${styles.trialBubble2}`} aria-hidden="true" />
                <h2 id="trial-title" className={`${styles.heading} ${styles.trialTitle}`}>
                  {c.trial.title}
                </h2>
                <p className={styles.trialText}>{c.trial.text}</p>
                <ul className={styles.trialPoints}>
                  {c.trial.points.map((point) => (
                    <li key={point}>
                      <span className={styles.tick} aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnWhite} ${styles.btnLg}`}>
                  {c.trial.cta}
                </LeadButton>
              </div>
            </div>
          </section>

          <section id="faq" className={styles.section} aria-labelledby="faq-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <h2 id="faq-title" className={`${styles.heading} ${styles.sectionTitle}`}>
                  {c.faq.title}
                </h2>
              </div>
              <div className={styles.faqList} data-reveal="">
                {c.faq.items.map((item) => (
                  <details key={item.q} className={styles.faqItem}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className={styles.footerWrap}>
          <div className={styles.wrap}>
            <div className={styles.footer}>
              <div className={styles.footerRow}>
                <div>
                  <WaytaLockup tone="auto" size={32} />
                  <p className={styles.footerTag}>{c.footer.tagline}</p>
                </div>
                <nav className={styles.footerLinks} aria-label={c.footer.menu}>
                  <a href="#plans">{c.nav.plans}</a>
                  <a href="#faq">{c.nav.faq}</a>
                  <Link href="/staff">{c.footer.signIn}</Link>
                </nav>
              </div>
              <p className={styles.footerBase}>
                © {new Date().getFullYear()} Wayta · {c.footer.rights}
              </p>
            </div>
          </div>
        </footer>
      </LeadProvider>
    </div>
  );
}
