'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/api/client';
import { useStaffI18n } from '../../../lib/i18n/client';

type State = 'opening' | 'failed';

/** Exchanges the secret token for a session and goes to the demo's dashboard. A wrong or ended link is shown plainly. */
export function DemoEnter({ token }: { token: string }) {
  const { t } = useStaffI18n();
  const [state, setState] = useState<State>('opening');
  // React strict mode runs effects twice in development: the link must be used once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    apiFetch<{ data: { redirectTo: string } }>('/demo/enter', { method: 'POST', body: { token } })
      .then((result) => {
        // A full navigation, so the dashboard's Server Components read the new session cookie.
        window.location.replace(result.data.redirectTo);
      })
      .catch(() => setState('failed'));
  }, [token]);

  if (state === 'failed') {
    return (
      <div role="alert" className="mt-4 space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('demo.enter.failed.title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('demo.enter.failed.body')}</p>
      </div>
    );
  }
  return (
    <div role="status" className="mt-4 space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{t('demo.enter.title')}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('demo.enter.body')}</p>
    </div>
  );
}
