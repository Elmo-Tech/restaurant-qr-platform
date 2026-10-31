'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import {
  buildSetupPreviewSteps,
  type SetupPreviewAccess,
  type SetupPreviewScenario,
} from '../../../../../lib/staff/restaurant-setup';
import { RestaurantSetupChecklistCard } from '../../../../../components/staff/RestaurantSetupChecklistCard';
import { Alert } from '../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../components/ui/PageHeader';

const SCENARIOS: readonly { key: SetupPreviewScenario; title: 'setup.preview.new' | 'setup.preview.partial' | 'setup.preview.whatsapp' | 'setup.preview.ready' }[] = [
  { key: 'new', title: 'setup.preview.new' },
  { key: 'partial', title: 'setup.preview.partial' },
  { key: 'whatsapp', title: 'setup.preview.whatsapp' },
  { key: 'ready', title: 'setup.preview.ready' },
];

export function SetupPreviewWorkspace({
  restaurantId,
  access,
}: {
  restaurantId: string;
  access: SetupPreviewAccess;
}) {
  const { t } = useStaffI18n();
  const [scenario, setScenario] = useState<SetupPreviewScenario>('partial');
  const [hidden, setHidden] = useState(false);

  // Demo data are deliberately NOT fetched from or written to the restaurant.
  // This route must never be mistaken for active, saved onboarding.
  const steps = buildSetupPreviewSteps(restaurantId, scenario, access);

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 sm:gap-6">
      <Link href={`/staff/restaurants/${encodeURIComponent(restaurantId)}/settings/overview`}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-primary shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 rtl:rotate-180">
          <path d="M19 12H5m7 7-7-7 7-7" />
        </svg>
        {t('setup.preview.back')}
      </Link>
      <PageHeader title={t('setup.preview.pageTitle')} description={t('setup.preview.pageSubtitle')} />
      <Alert variant="warning">
        <strong>{t('setup.preview.badge')}</strong>
        <span className="ms-2">{t('setup.preview.warning')}</span>
      </Alert>

      <section aria-labelledby="setup-preview-controls" className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
        <h2 id="setup-preview-controls" className="text-sm font-bold text-foreground">{t('setup.preview.scenarios')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SCENARIOS.map(item => (
            <button key={item.key} type="button"
              aria-pressed={scenario === item.key}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${scenario === item.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted'}`}
              onClick={() => { setScenario(item.key); setHidden(false); }}>
              {t(item.title)}
            </button>
          ))}
        </div>
      </section>

      {hidden ? (
        <div role="status" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          <p>{t('setup.preview.hideNote')}</p>
          <button type="button" onClick={() => setHidden(false)}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t('setup.preview.reopen')}
          </button>
        </div>
      ) : (
        <RestaurantSetupChecklistCard steps={steps} onHide={() => setHidden(true)} preview />
      )}

      <p className="text-xs leading-6 text-muted-foreground">{t('setup.preview.linksNote')}</p>
    </div>
  );
}
