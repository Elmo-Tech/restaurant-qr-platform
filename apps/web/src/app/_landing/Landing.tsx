import Link from 'next/link';
import { WaytaLockup } from '../../components/brand/Wayta';
import { directionOf, type StaffLocale } from '../../lib/i18n/locale';
import { DESIGN_KEYS, LANDING_COPY } from './copy';
import { display, displayArabic, mono } from './fonts';
import { HeroStage } from './HeroStage';
import { Journey } from './Journey';
import { LangSwitch } from './LangSwitch';
import { LeadButton, LeadProvider } from './LeadProvider';
import { MenuScreen, PhoneFrame } from './PhoneScreens';
import { Pricing } from './Pricing';
import { RevealObserver } from './RevealObserver';
import type { LandingPlans } from './plans-api';
import styles from './landing.module.css';

function Marquee({ items }: { items: string[] }) {
  // the list twice, so the loop is seamless (the copy is hidden from assistive technology)
  return (
    <div className={styles.marquee} aria-hidden="true">
      <div className={styles.marqueeTrack}>
        {[0, 1].map((copy) => (
          <div key={copy} className={styles.marqueeItem} style={{ gap: 30 }}>
            {items.map((item) => (
              <span key={item} className={styles.display} style={{ display: 'contents' }}>
                <span>{item}</span>
                <span style={{ color: 'var(--saffron)', fontSize: '0.7em' }}>✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The public landing page (DEC-053). A dark, cinematic page told by devices: a hero phone that keeps changing
 * its menu design, a scroll-driven "scan, order, kitchen" story, a rail of designs (never counted: plenty,
 * swap any time), a bento of features with small living illustrations, the real plans, the free trial and a
 * short FAQ. A Server Component; the animated devices, plan toggles, language switch and request dialog are
 * the only client code.
 */
export function Landing({ locale, plans }: { locale: StaffLocale; plans: LandingPlans | null }) {
  const c = LANDING_COPY[locale];
  const dir = directionOf(locale);
  const planList = plans?.plans ?? [];

  const bento = [
    { cls: 'b1', visual: (
      <div className={styles.langFlip} dir="auto">
        <span lang="ar">{c.features.langA}</span>
        <span lang="en">{c.features.langB}</span>
        <i className={`${styles.langDir} ${styles.mono}`}>RTL ⇄ LTR</i>
      </div>
    ) },
    { cls: 'b2', visual: (
      <div className={styles.chipRow}>
        {c.features.channels.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    ) },
    { cls: 'b3', visual: (
      <div className={styles.roleRow}>
        {c.features.roles.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    ) },
    { cls: 'b4', visual: (
      <div className={styles.stepper}>
        {c.features.track.map((name) => (
          <div key={name}>
            <i />
            {name}
          </div>
        ))}
      </div>
    ) },
    { cls: 'b5', visual: (
      <div className={styles.suggestBox}>
        <div className={styles.suggestRow}>{c.features.suggest.added}</div>
        <div className={styles.suggestPop}>{c.features.suggest.suggest}</div>
      </div>
    ) },
    { cls: 'b6', visual: (
      <div className={styles.draft}>
        {c.features.importLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    ) },
  ] as const;

  return (
    <div
      data-landing-root=""
      className={`${styles.root} ${display.variable} ${displayArabic.variable} ${mono.variable}`}
      lang={locale}
      dir={dir}
    >
      <RevealObserver />
      <LeadProvider copy={c.lead} plans={planList} locale={locale}>
        <header className={styles.nav}>
          <div className={`${styles.wrap} ${styles.navRow}`}>
            <Link href="/" aria-label="Wayta">
              <WaytaLockup tone="dark" size={30} />
            </Link>
            <nav className={styles.navLinks} aria-label={c.nav.menu}>
              <a href="#how">{c.nav.how}</a>
              <a href="#designs">{c.nav.designs}</a>
              <a href="#features">{c.nav.features}</a>
              <a href="#plans">{c.nav.plans}</a>
              <a href="#faq">{c.nav.faq}</a>
            </nav>
            <div className={styles.navEnd}>
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
                  {c.hero.title.map((line) => (
                    <span key={line} className={styles.line}>
                      <span>{line}</span>
                    </span>
                  ))}
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
                <p className={styles.heroNote}>{c.hero.note}</p>
              </div>
              <HeroStage locale={locale} copy={c.hero} />
            </div>
          </section>

          <Marquee items={c.marquee} />

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
              <div className={styles.sectionHead} data-reveal="">
                <p className={styles.kicker}>{c.features.eyebrow}</p>
                <h2 id="features-title" className={`${styles.display} ${styles.sectionTitle}`}>
                  {c.features.title}
                </h2>
              </div>
              <div className={styles.bento}>
                {c.features.items.map((item, index) => (
                  <article key={item.title} className={`${styles.bCard} ${styles[bento[index].cls]}`} data-reveal="" data-delay={(index % 2) * 120}>
                    <div className={styles.bVisual}>{bento[index].visual}</div>
                    <h3 className={styles.bTitle}>{item.title}</h3>
                    <p className={styles.bText}>{item.text}</p>
                  </article>
                ))}
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
            <span className={styles.trialRing} aria-hidden="true" />
            <div className={styles.wrap}>
              <div className={styles.trialInner} data-reveal="">
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
                <div>
                  <LeadButton kind="TRIAL" className={`${styles.btn} ${styles.btnInk}`}>
                    {c.trial.cta}
                  </LeadButton>
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
