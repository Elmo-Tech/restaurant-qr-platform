'use client';

import { useState } from 'react';
import { PLAN_FEATURES, type LandingCopy } from './copy';
import { LeadButton } from './LeadProvider';
import type { LandingPlan } from './plans-api';
import styles from './landing.module.css';

type Currency = 'EGP' | 'USD';
type Period = 'MONTHLY' | 'YEARLY';

function Tick() {
  return (
    <span className={styles.tick} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/**
 * The plans as order tickets, with the real prices from the Backend (offer already applied). The visitor
 * switches the billing period and the currency; a plan that is not offered in a currency or period says
 * so instead of showing a wrong price.
 */
export function Pricing({ plans, copy, locale }: { plans: LandingPlan[]; copy: LandingCopy['plans']; locale: 'ar' | 'en' }) {
  // only the currencies some plan is priced in; the visitor's own one first when it is offered
  const currencies = ('EGP USD'.split(' ') as Currency[]).filter((code) => plans.some((plan) => plan.prices.some((price) => price.currencyCode === code)));
  const preferred: Currency = locale === 'ar' ? 'EGP' : 'USD';
  const [currency, setCurrency] = useState<Currency>(currencies.includes(preferred) ? preferred : (currencies[0] ?? 'EGP'));
  const [period, setPeriod] = useState<Period>('MONTHLY');
  const numbers = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 });
  const compact = (value: string) => numbers.format(Number(value));
  const designs = (plan: LandingPlan) =>
    locale === 'ar' ? `${numbers.format(plan.designs.standard)} عادي + ${numbers.format(plan.designs.premium)} بريميوم` : `${numbers.format(plan.designs.standard)} standard + ${numbers.format(plan.designs.premium)} premium`;

  return (
    <>
      <div className={styles.plansTools}>
        <div className={styles.toggle} role="group" aria-label={copy.monthly + ' / ' + copy.yearly}>
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

      <ol className={styles.planGrid} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {plans.map((plan, index) => {
          const price = plan.prices.find((p) => p.currencyCode === currency && p.period === period);
          const onOffer = Boolean(plan.offer) && price !== undefined && price.amount !== price.listAmount;
          return (
            <li key={plan.id} className={styles.plan}>
              <div className={styles.planHead}>
                <span>
                  {copy.ticketNo} {numbers.format(index + 1)}
                </span>
                {plan.offer ? <span>{plan.offer.label ?? copy.offer}</span> : null}
              </div>
              <h3 className={`${styles.display} ${styles.planName}`}>{plan.name}</h3>
              <p className={styles.planDesc}>{plan.description}</p>

              <div className={styles.perforation} aria-hidden="true" />

              {price ? (
                <>
                  <div className={styles.price}>
                    <span className={styles.priceAmount}>{compact(price.amount)}</span>
                    <span className={styles.priceCur}>{currency}</span>
                    {onOffer ? <span className={styles.priceWas}>{compact(price.listAmount)}</span> : null}
                  </div>
                  <p className={styles.priceFor}>{period === 'MONTHLY' ? copy.perMonth : copy.perYear}</p>
                  {onOffer && plan.offer ? (
                    <span className={styles.offerTag}>
                      {copy.offer} −{numbers.format(Number(plan.offer.percent))}%
                    </span>
                  ) : null}
                </>
              ) : (
                <p className={styles.priceFor}>—</p>
              )}

              <div className={styles.perforation} aria-hidden="true" />

              <ul className={styles.planList}>
                {copy.basics.map((line) => (
                  <li key={line}>
                    <Tick />
                    <span>{line}</span>
                  </li>
                ))}
                {PLAN_FEATURES.map((feature) => {
                  // a package whose only design is Classic does not really include the choice of designs
                  const included = plan.features.includes(feature) && !(feature === 'MENU_TEMPLATES' && plan.designs.standard <= 1 && plan.designs.premium === 0);
                  return (
                    <li key={feature} className={included ? undefined : styles.off}>
                      <Tick />
                      <span>
                        {copy.featureNames[feature]}
                        {feature === 'MENU_TEMPLATES' && included ? (
                          <>
                            <br />
                            <span className={styles.designsBadge}>{designs(plan)}</span>
                          </>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.planAction}>
                <LeadButton kind="SUBSCRIBE" packageId={plan.id} className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}>
                  {copy.cta}
                </LeadButton>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
