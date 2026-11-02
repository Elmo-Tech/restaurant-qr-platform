'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';

/**
 * Shown on every Staff page of a temporary demo restaurant (DEC-060): that it is a demo, how long is left, and a link to
 * the photo credits (the licences ask for it). It only reads the expiry the Backend sent; the Backend is what ends the
 * demo, so a clock that is wrong here changes nothing but this text.
 */
export function DemoBanner({ expiresAt }: { expiresAt: string }) {
  const { t } = useStaffI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const left =
    days > 0
      ? t('demo.time.dh', { d: days, h: hours })
      : hours > 0
        ? t('demo.time.hm', { h: hours, m: rest })
        : t('demo.time.m', { m: rest });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/25 bg-warning-soft px-4 py-2 text-[13px] text-warning sm:px-6 lg:px-8"
    >
      <span className="rounded-full bg-warning px-2.5 py-0.5 text-xs font-semibold text-white">{t('demo.banner.label')}</span>
      <span className="font-semibold">{minutes === 0 ? t('demo.banner.ended') : t('demo.banner.endsIn', { time: left })}</span>
      <span className="hidden min-w-0 flex-1 sm:inline">{t('demo.banner.note')}</span>
      <Link href="/demo-credits" className="ms-auto shrink-0 font-medium underline underline-offset-2 hover:no-underline">
        {t('demo.banner.credits')}
      </Link>
    </div>
  );
}
