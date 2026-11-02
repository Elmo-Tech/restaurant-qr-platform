'use client';

import { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../../../lib/media/asset-url';

export function VerdeThemeToggle({ locale }: { locale: string }) {
  const [mode, setMode] = useState<'light' | 'signature'>('light');
  useEffect(() => {
    const saved = window.localStorage.getItem('verde-menu-theme');
    const next = saved === 'signature' ? 'signature' : 'light';
    document.documentElement.dataset.verdeTheme = next;
    setMode(next);
    return () => { delete document.documentElement.dataset.verdeTheme; };
  }, []);
  const change = () => {
    const next = mode === 'light' ? 'signature' : 'light';
    document.documentElement.dataset.verdeTheme = next;
    window.localStorage.setItem('verde-menu-theme', next);
    setMode(next);
  };
  return (
    <button type="button" className="verde-theme-switch" onClick={change}
      aria-label={locale === 'ar' ? 'تغيير ألوان تصميم فيردي' : 'Change VERDE color theme'}>
      <span aria-hidden="true" className="verde-theme-dot" />
      {mode === 'light'
        ? locale === 'ar' ? 'ثيم المنيو الأصلي' : 'SIGNATURE DARK'
        : locale === 'ar' ? 'الثيم الفاتح' : 'LIGHT THEME'}
    </button>
  );
}

export function VerdeShowcase({
  name, logoUrl, coverUrl, locale, categoryCount,
}: {
  name: string; logoUrl: string | null; coverUrl: string | null;
  locale: string; categoryCount: number;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const photo = coverUrl ?? null;
  return (
    <section className="verde-showcase" aria-label={locale === 'ar' ? 'هوية المطعم' : 'Restaurant identity'}>
      <div className="verde-showcase-inner">
        <div className="verde-showcase-copy">
          <p className="verde-eyebrow">RESTAURANT NAPOLETANA <span>✳</span> EST. VERDE</p>
          {logoUrl && !logoFailed
            // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded media
            ? <img className="verde-brand-logo" src={logoUrl} alt={name} onError={() => setLogoFailed(true)} />
            : <span className="verde-brand-name">VERDE<span>.</span></span>}
          <p className="verde-showcase-kicker">THE VERDE EXPERIENCE</p>
          <h1>{locale === 'ar' ? 'كل طبق.. حكاية.' : 'The good stuff. On your plate.'}</h1>
          <p className="verde-showcase-description">{locale === 'ar'
            ? 'المنيو كله بين إيديك. اختار القسم واستكشف أصنافنا بكل سهولة.'
            : 'Explore every category and find your next favorite.'}</p>
          <a href="#verde-menu-anchor" className="verde-discover">
            {locale === 'ar' ? 'اكتشف المنيو' : 'EXPLORE MENU'} <span aria-hidden="true">↗</span>
          </a>
          <p className="verde-edition">{String(categoryCount).padStart(2, '0')} / MENU CHAPTERS</p>
        </div>
        <div className="verde-showcase-art" aria-hidden="true">
          <div className="verde-art-ring" />
          {photo
            // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded media
            ? <img src={resolveAssetUrl(photo) ?? undefined} alt="" />
            : <span className="verde-art-illustration">✳</span>}
          <span className="verde-art-stamp">VERDE<br />NAPOLETANA</span>
        </div>
      </div>
      <div className="verde-marquee" aria-hidden="true"><span>VERDE ✳ NAPOLETANA ✳ PIZZA & MORE ✳ MADE TO CRAVE ✳ VERDE ✳ NAPOLETANA</span></div>
    </section>
  );
}
