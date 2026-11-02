import { getStaffI18n } from '../../lib/i18n/server';
import { DEMO_CREDITS } from './credits-data';

/** Public: the photo credits that the licences of the demo restaurant's photos ask for (DEC-060). */
export default async function DemoCreditsPage() {
  const { t, locale } = await getStaffI18n();
  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">{t('demo.credits.title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('demo.credits.intro')}</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-start text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start">{t('demo.credits.col.product')}</th>
              <th className="px-3 py-2 text-start">{t('demo.credits.col.photo')}</th>
              <th className="px-3 py-2 text-start">{t('demo.credits.col.author')}</th>
              <th className="px-3 py-2 text-start">{t('demo.credits.col.licence')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {DEMO_CREDITS.map((credit) => (
              <tr key={credit.product} className="align-top">
                <td className="px-3 py-2 font-medium text-foreground" dir="ltr">{credit.product}</td>
                <td className="px-3 py-2" dir="ltr">
                  {credit.photoUrl ? (
                    <a href={credit.photoUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2 hover:no-underline">
                      {credit.photoTitle}
                    </a>
                  ) : (
                    credit.photoTitle
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground" dir="ltr">{credit.author}</td>
                <td className="px-3 py-2" dir="ltr">
                  {credit.licenceUrl ? (
                    <a href={credit.licenceUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2 hover:no-underline">
                      {credit.licence}
                    </a>
                  ) : (
                    credit.licence
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
