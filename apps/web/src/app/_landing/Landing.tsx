import Link from 'next/link';
import { WaytaLockup } from '../../components/brand/Wayta';
import { directionOf, type StaffLocale } from '../../lib/i18n/locale';
import { Cloche } from './Cloche';
import { DESIGN_KEYS, LANDING_COPY } from './copy';
import { display, displayArabic, mono } from './fonts';
import { HeroStage } from './HeroStage';
import { Journey } from './Journey';
import { LangSwitch } from './LangSwitch';
import { LeadButton, LeadProvider } from './LeadProvider';
import { MenuScreen, PhoneFrame } from './PhoneScreens';
import { Pricing } from './Pricing';
import { RevealObserver } from './RevealObserver';
import { ThemeToggle } from './ThemeToggle';
import type { LandingPlans } from './plans-api';
import styles from './landing.module.css';

function Ticker({ items }: { items: string[] }) {
  // the list twice, so the loop is seamless (the copy is hidden from assistive technology)
  return (
    <div className={styles.marquee} aria-hidden="true">
      <div className={styles.marqueeTrack}>
        {[0, 1].map((round) => (
          <div key={round} className={styles.marqueeItem}>
            {items.map((item) => (
              <span key={item} style={{ display: 'contents' }}>
                <span>{item}</span>
                <i className={styles.marqueeDome} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The public landing page (DEC-053). Flat, warm and built from the brand: arched photo frames and a smiling
 * cloche in the hero, a scroll-driven "scan, order, kitchen" story, a rail of designs (never counted: plenty,
 * swap any time), the features as a restaurant menu card, the real plans, the free trial and a short FAQ.
 * Light and dark themes. A Server Component; the animated devices, plan toggles, theme and language switches
 * and the request dialog are the only client code.
 */
export function Landing({ locale, plans, theme }: { locale: StaffLocale; plans: LandingPlans | null; theme: 'light' | 'dark' | null }) {
  const c = LANDING_COPY[locale];
  const dir = directionOf(locale);
  const planList = plans?.plans ?? [];

  return (
    <div
      data-landing-root=""
      data-theme={theme ?? 'system'}
      className={`${styles.root} ${display.variable} ${displayArabic.variable} ${mono.variable}`}
      lang={locale}
      dir={dir}
    >
      <RevealObserver />
      <LeadProvider copy={c.lead} plans={planList} locale={locale}>
        <header className={styles.nav}>
          <div className={`${styles.wrap} ${styles.navRow}`}>
            <Link href="/" aria-label="Wayta">
              <WaytaLockup tone="auto" size={30} />
            </Link>
            <nav className={styles.navLinks} aria-label={c.nav.menu}>
              <a href="#how">{c.nav.how}</a>
              <a href="#designs">{c.nav.designs}</a>
              <a href="#features">{c.nav.features}</a>
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
                <p className={styles.eyebrow}>{c.hero.eyebrow}</p>
                <h1 id="hero-title" className={`${styles.display} ${styles.heroTitle}`}>
                  <span className={styles.line}>
                    <span>{c.hero.line1}</span>
                  </span>
                  <span className={styles.line}>
                    <span>
                      {c.hero.line2[0]}
                      <span className={styles.mark}>{c.hero.line2[1]}</span>
                      {c.hero.line2[2]}
                    </span>
                  </span>
                </h1>
                <p className={styles.heroLead}>{c.hero.lead}</p>
                <div className={styles.heroActions}>
                  <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnPrimary}`}>
                    {c.hero.primary}
                  </LeadButton>
                  <a href="#plans" className={`${styles.btn} ${styles.btnGhost}`}>
                    {c.hero.secondary}
                  </a>
                </div>
                <ul className={styles.heroFacts}>
                  {c.hero.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
              <HeroStage locale={locale} copy={c.hero} />
            </div>
          </section>

          <Ticker items={c.marquee} />

          <section id="how" className={`${styles.section} ${styles.journeySection}`} aria-labelledby="how-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <p className={styles.kicker}>{c.journey.eyebrow}</p>
                <h2 id="how-title" className={`${styles.display} ${styles.sectionTitle}`}>
                  {c.journey.title}
                </h2>
              </div>
              <Journey locale={locale} copy={c.journey} />
            </div>
          </section>

          <section id="designs" className={`${styles.section} ${styles.wardrobe}`} aria-labelledby="designs-title">
            <div className={styles.wrap}>
              <div className={styles.wardrobeHead}>
                <div data-reveal="">
                  <p className={styles.kicker}>{c.wardrobe.eyebrow}</p>
                  <h2 id="designs-title" className={`${styles.display} ${styles.wardrobeTitle}`}>
                    {c.wardrobe.title}
                  </h2>
                  <ul className={styles.seasons}>
                    {c.wardrobe.seasons.map((season) => (
                      <li key={season}>{season}</li>
                    ))}
                  </ul>
                </div>
                <div data-reveal="" data-delay="120">
                  <p className={styles.wardrobeText}>{c.wardrobe.text}</p>
                  <p className={styles.wardrobeNote}>{c.wardrobe.note}</p>
                </div>
              </div>
            </div>
            <div className={styles.phoneRail} aria-hidden="true">
              <div className={styles.phoneTrack}>
                {[0, 1].map((round) =>
                  DESIGN_KEYS.map((key) => (
                    <div key={`${round}-${key}`} className={styles.mini}>
                      <div className={styles.miniInner}>
                        <PhoneFrame>
                          <MenuScreen design={key} locale={locale} />
                        </PhoneFrame>
                      </div>
                      <span className={styles.miniName}>{c.hero.designNames[key]}</span>
                    </div>
                  )),
                )}
              </div>
            </div>
            <div className={styles.wrap}>
              <div className={styles.wardrobeAction}>
                <a href="#plans" className={`${styles.btn} ${styles.btnInk}`}>
                  {c.wardrobe.cta}
                </a>
              </div>
            </div>
          </section>

          <section id="features" className={`${styles.section} ${styles.featuresSection}`} aria-labelledby="features-title">
            <div className={styles.wrap}>
              <div className={styles.menuCard} data-reveal="">
                <div className={styles.menuCardTop}>
                  <small>{c.features.eyebrow}</small>
                  <h2 id="features-title" className={`${styles.display}`}>
                    {c.features.title}
                  </h2>
                  <Cloche className={styles.clocheMini} />
                </div>
                <div className={styles.menuCols}>
                  {c.features.groups.map((group) => (
                    <div key={group.title} className={styles.menuGroup}>
                      <h3>{group.title}</h3>
                      {group.items.map((item) => (
                        <div key={item.title} className={styles.menuItem}>
                          <div className={styles.menuItemHead}>
                            <b>{item.title}</b>
                            <span className={styles.menuDots} aria-hidden="true" />
                            <span className={styles.menuTag}>{item.tag}</span>
                          </div>
                          <p>{item.text}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="plans" className={`${styles.section} ${styles.plansSection}`} aria-labelledby="plans-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <p className={styles.kicker}>{c.plans.eyebrow}</p>
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
              <div className={styles.trialGrid} data-reveal="">
                <div>
                  <h2 id="trial-title" className={`${styles.display} ${styles.trialTitle}`}>
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
                  <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnInk}`}>
                    {c.trial.cta}
                  </LeadButton>
                </div>
                <div className={styles.trialCloche}>
                  <Cloche animated />
                </div>
              </div>
            </div>
          </section>

          <section id="faq" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
            <div className={styles.wrap}>
              <div className={styles.sectionHead} data-reveal="">
                <h2 id="faq-title" className={`${styles.display} ${styles.sectionTitle}`}>
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
