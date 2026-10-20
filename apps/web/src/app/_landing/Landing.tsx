import Link from 'next/link';
import { WaytaLockup } from '../../components/brand/Wayta';
import { directionOf, type StaffLocale } from '../../lib/i18n/locale';
import { LANDING_COPY } from './copy';
import { display, displayArabic, mono } from './fonts';
import { DesignPhones } from './DesignPhones';
import { HeroPhone } from './HeroPhone';
import { LangSwitch } from './LangSwitch';
import { ThemeToggle } from './ThemeToggle';
import { LeadButton, LeadProvider } from './LeadProvider';
import { Pricing } from './Pricing';
import type { LandingPlans } from './plans-api';
import styles from './landing.module.css';

const ICONS = [
  // two languages
  <svg key="lang" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5.5 7M12 5c-.5 3-3 6.5-7 8.5M13 20l4-9 4 9M14.4 17h5.2" /></svg>,
  // four ways to order
  <svg key="orders" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 13v7M13 16.5h7" /></svg>,
  // kitchen and team
  <svg key="kitchen" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 9V7M10 7h4M5 21h14" /></svg>,
  // tracking
  <svg key="track" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>,
  // suggestions
  <svg key="suggest" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.8 4.6L18.5 10l-4.7 1.4L12 16l-1.8-4.6L5.5 10l4.7-1.4zM18 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>,
  // import
  <svg key="import" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" /></svg>,
];

/** A small QR-like pattern (decorative): three finder squares and a scatter of modules. */
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
          <rect x={x} y={y} width="6" height="6" fill="#12100E" />
          <rect x={x + 1} y={y + 1} width="4" height="4" fill="#FFFDF8" />
          <rect x={x + 2} y={y + 2} width="2" height="2" fill="#12100E" />
        </g>
      ))}
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#12100E" />
      ))}
    </svg>
  );
}

/**
 * The public landing page (DEC-053): hero with a live demo, the three-step story, features, menu designs
 * (standard and premium, DEC-052), the real plans as order tickets, the free trial and a short FAQ. A Server
 * Component; only the demo phone, the plan toggles, the language switch and the request dialog are client code.
 */
export function Landing({ locale, plans, theme }: { locale: StaffLocale; plans: LandingPlans | null; theme: 'light' | 'dark' | null }) {
  const c = LANDING_COPY[locale];
  const dir = directionOf(locale);
  const planList = plans?.plans ?? [];
  const trialDays = plans?.trialDays ?? 15;

  return (
    <div
      data-landing-root=""
      data-theme={theme ?? 'system'}
      className={`${styles.root} ${display.variable} ${displayArabic.variable} ${mono.variable}`}
      lang={locale}
      dir={dir}
    >
      <LeadProvider copy={c.lead} plans={planList} locale={locale}>
        <header className={styles.nav}>
          <div className={`${styles.wrap} ${styles.navRow}`}>
            <Link href="/" aria-label="Wayta">
              <WaytaLockup tone="auto" size={30} />
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
        </header>

        <main>
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={`${styles.wrap} ${styles.heroGrid}`}>
              <div>
                <p className={`${styles.eyebrow} ${styles.rise}`}>{c.hero.eyebrow}</p>
                <h1 id="hero-title" className={`${styles.display} ${styles.heroTitle} ${styles.rise} ${styles.rise2}`}>
                  {c.hero.title.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </h1>
                <p className={`${styles.heroLead} ${styles.rise} ${styles.rise3}`}>{c.hero.lead}</p>
                <div className={`${styles.heroActions} ${styles.rise} ${styles.rise3}`}>
                  <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnPrimary}`}>
                    {locale === 'ar' ? `ابدأ تجربة مجانية ${trialDays.toLocaleString('ar-EG')} يوم` : `Start a ${trialDays}-day free trial`}
                  </LeadButton>
                  <a href="#plans" className={`${styles.btn} ${styles.btnGhost}`}>
                    {c.hero.secondary}
                  </a>
                </div>
                <p className={styles.heroNote}>{c.hero.note}</p>
              </div>

              <div className={styles.stage}>
                <div className={styles.scanCard} aria-hidden="true">
                  <span className={styles.qr}>
                    <QrGlyph />
                    <span className={styles.scanLine} />
                  </span>
                  <small>{c.hero.scan}</small>
                </div>
                <HeroPhone locale={locale} copy={c.hero} />
                <div className={styles.ticketWrap}>
                  <div className={styles.ticket} role="img" aria-label={`${c.hero.ticket.kicker}: ${c.hero.ticket.table}, ${c.hero.ticket.item1}, ${c.hero.ticket.item2}`}>
                    <div className={styles.ticketKicker}>
                      <span>{c.hero.ticket.kicker}</span>
                      <span className={styles.ticketLive}>LIVE</span>
                    </div>
                    <div className={styles.ticketTable}>{c.hero.ticket.table}</div>
                    <ul className={styles.ticketItems}>
                      <li>{c.hero.ticket.item1}</li>
                      <li>{c.hero.ticket.item2}</li>
                    </ul>
                    <span className={styles.ticketStatus}>{c.hero.ticket.status}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className={styles.strip}>
            <div className={`${styles.wrap} ${styles.stripRow}`}>
              {c.strip.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <section id="how" className={styles.section} aria-labelledby="how-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead}>
                <h2 id="how-title" className={`${styles.display} ${styles.sectionTitle}`}>
                  {c.how.title}
                </h2>
                <p className={styles.sectionLead}>{c.how.lead}</p>
              </div>
              <ol className={styles.steps}>
                {c.how.steps.map((step, index) => (
                  <li key={step.title} className={styles.step}>
                    <span className={styles.stepNo}>{(index + 1).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span>
                    <div>
                      <span className={styles.stepTag}>{step.tag}</span>
                      <h3 className={`${styles.display} ${styles.stepTitle}`}>{step.title}</h3>
                      <p className={styles.stepText}>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="features" className={`${styles.section} ${styles.featureSection}`} aria-labelledby="features-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead}>
                <h2 id="features-title" className={`${styles.display} ${styles.sectionTitle}`}>
                  {c.features.title}
                </h2>
                <p className={styles.sectionLead}>{c.features.lead}</p>
              </div>
              <div className={styles.featureGrid}>
                {c.features.items.map((item, index) => (
                  <article key={item.title} className={styles.feature}>
                    <span className={styles.featureIcon}>{ICONS[index]}</span>
                    <h3 className={`${styles.display} ${styles.featureTitle}`}>{item.title}</h3>
                    <p className={styles.featureText}>{item.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="designs" className={styles.designsSection} aria-labelledby="designs-title">
            <div className={styles.wrap}>
              <div className={styles.designsBand}>
                <div className={styles.designsText}>
                  <h2 id="designs-title" className={`${styles.display} ${styles.designsTitle}`}>
                    {c.designs.title}
                  </h2>
                  <p className={styles.designsLead}>{c.designs.lead}</p>
                  <div className={styles.seasonRow}>
                    <span>{c.designs.seasonsLabel}</span>
                    {c.designs.seasons.map((season) => (
                      <b key={season}>{season}</b>
                    ))}
                  </div>
                  <a href="#plans" className={`${styles.btn} ${styles.btnInkSolid}`}>
                    {c.designs.cta}
                  </a>
                </div>
                <DesignPhones locale={locale} more={c.designs.more} />
              </div>
            </div>
          </section>

          <section id="plans" className={`${styles.section} ${styles.plansSection}`} aria-labelledby="plans-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead}>
                <h2 id="plans-title" className={`${styles.display} ${styles.sectionTitle}`}>
                  {c.plans.title}
                </h2>
                <p className={styles.sectionLead}>{c.plans.lead}</p>
              </div>
              {planList.length > 0 ? (
                <Pricing plans={planList} copy={c.plans} locale={locale} />
              ) : (
                <div className={styles.plansError} role="status">
                  <strong>{c.plans.unavailable}</strong>
                  {c.plans.retry}
                </div>
              )}
            </div>
          </section>

          <section className={styles.trial} aria-labelledby="trial-title">
            <div className={styles.wrap}>
              <div className={styles.trialBox}>
                <div>
                  <h2 id="trial-title" className={`${styles.display} ${styles.trialTitle}`}>
                    {locale === 'ar' ? `${trialDays.toLocaleString('ar-EG')} يومًا لتجرّب ويتا على مطعمك الحقيقي` : `${trialDays} days to try Wayta on your real restaurant`}
                  </h2>
                  <p className={styles.trialText}>{c.trial.text}</p>
                </div>
                <div className={styles.trialSide}>
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
                  <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnPrimary}`}>
                    {c.trial.cta}
                  </LeadButton>
                </div>
              </div>
            </div>
          </section>

          <section id="faq" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title" style={{ paddingTop: 0 }}>
            <div className={styles.wrap}>
              <div className={styles.sectionHead}>
                <h2 id="faq-title" className={`${styles.display} ${styles.sectionTitle}`}>
                  {c.faq.title}
                </h2>
              </div>
              <div className={styles.faqList}>
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

        <footer className={styles.footer}>
          <div className={styles.wrap}>
            <div className={styles.footerRow}>
              <div>
                <WaytaLockup tone="dark" size={32} />
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
        </footer>
      </LeadProvider>
    </div>
  );
}
