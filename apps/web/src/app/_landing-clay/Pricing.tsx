'use client';

import { useState } from 'react';
import { PLAN_FEATURES, type LandingCopy } from './copy';
import { LeadButton } from './LeadProvider';
import type { LandingPlan } from './plans-api';
import styles from './landing.module.css';

type Currency = 'EGP' | 'USD';
type Period = 'MONTHLY' | 'YEARLY';

function Tick({ off }: { off?: boolean }) {
  return (
    <span className={styles.tick} data-off={off ? '1' : undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/**
 * The plans as clay cards, with the real prices from the Backend (offer already applied). The billing period
 * and, when more than one is offered, the currency are recessed segmented controls. A plan not offered in a
 * currency or period says so instead of showing a wrong price. Menu designs are never counted.
 */
export function Pricing({ plans, copy, locale }: { plans: LandingPlan[]; copy: LandingCopy['plans']; locale: 'ar' | 'en' }) {
  const currencies = ('EGP USD'.split(' ') as Currency[]).filter((code) => plans.some((plan) => plan.prices.some((price) => price.currencyCode === code)));
  const preferred: Currency = locale === 'ar' ? 'EGP' : 'USD';
  const [currency, setCurrency] = useState<Currency>(currencies.includes(preferred) ? preferred : (currencies[0] ?? 'EGP'));
  const [period, setPeriod] = useState<Period>('MONTHLY');
  const numbers = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 });
  const compact = (value: string) => numbers.format(Number(value));

  return (
    <>
      <div className={styles.plansTools}>
        <div className={styles.toggle} role="group" aria-label={`${copy.monthly} / ${copy.yearly}`}>
          {(['MONTHLY', 'YEARLY'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>
              {value === 'MONTHLY' ? copy.monthly : copy.yearly}
            </button>
          ))}
        </div>
        {currencies.length > 1 ? (
          <div className={styles.toggle} role="group" aria-label={copy.currencyLabel}>
            {currencies.map((value) => (
              <button key={value} type="button" aria-pressed={currency === value} onClick={() => setCurrency(value)}>
                {copy.currencies[value]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ul className={styles.planGrid}>
        {plans.map((plan, index) => {
          const price = plan.prices.find((p) => p.currencyCode === currency && p.period === period);
          const onOffer = Boolean(plan.offer) && price !== undefined && price.amount !== price.listAmount;
          return (
            <li key={plan.id} className={styles.plan} data-reveal="" data-delay={index * 90}>
              <div className={styles.planTop}>
                <h3 className={styles.planName}>{plan.name[locale]}</h3>
                {onOffer && plan.offer ? (
                  <span className={styles.offerTag}>
                    {plan.offer.label ?? copy.offer} −{numbers.format(Number(plan.offer.percent))}%
                  </span>
                ) : null}
              </div>
              {plan.description[locale] ? <p className={styles.planDesc}>{plan.description[locale]}</p> : null}

              <div className={styles.priceBlock}>
                {price ? (
                  <>
                    <div className={styles.price}>
                      <span className={styles.priceAmount}>{compact(price.amount)}</span>
                      <span className={styles.priceCur}>{currency}</span>
                      {onOffer ? <span className={styles.priceWas}>{compact(price.listAmount)}</span> : null}
                    </div>
                    <span className={styles.priceFor}>{period === 'MONTHLY' ? copy.perMonth : copy.perYear}</span>
                  </>
                ) : (
                  <span className={styles.priceFor}>—</span>
                )}
              </div>

              <ul className={styles.planList}>
                {copy.basics.map((line) => (
                  <li key={line}>
                    <Tick />
                    <span>{line}</span>
                  </li>
                ))}
                {PLAN_FEATURES.map((feature) => {
                  // a plan whose only design is Classic does not really include the choice of designs
                  const included = plan.features.includes(feature) && !(feature === 'MENU_TEMPLATES' && plan.designs.standard <= 1 && plan.designs.premium === 0);
                  return (
                    <li key={feature} data-off={included ? undefined : '1'}>
                      <Tick off={!included} />
                      <span>
                        {copy.featureNames[feature]}
                        {feature === 'MENU_TEMPLATES' && included && plan.designs.premium > 0 ? <em className={styles.premiumNote}> ★ {copy.premiumDesigns}</em> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <LeadButton kind="SUBSCRIBE" packageId={plan.id} className={`${styles.btn} ${styles.btnPlan}`}>
                {copy.cta}
              </LeadButton>
            </li>
          );
        })}
      </ul>
    </>
  );
}
