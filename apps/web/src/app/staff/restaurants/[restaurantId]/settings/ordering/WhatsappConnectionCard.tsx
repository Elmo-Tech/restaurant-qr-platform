'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '../../../../../../components/ui/Button';
import { getConnection, connectWhatsapp, connectWhatsappByCode, type ConnectionView } from '../../../../../../lib/whatsapp-tracking/api';
import { useStaffI18n } from '../../../../../../lib/i18n/client';

interface Props {
  restaurantId: string;
  /** NestJS still enforces restaurant.manage and full-branch scope on POST. */
  canManage: boolean;
  hasWhatsappNumber: boolean;
  orderingEnabled: boolean;
}

interface PairingQr {
  qrCode: string | null;
  qrText: string | null;
  /** Ephemeral account-link code; never persisted in URLs or localStorage. */
  pairingCode?: string | null;
}

type PairMethod = 'QR' | 'CODE';

/**
 * Restaurant Dashboard pairing guide. The QR is transient client-side state:
 * GET /connection deliberately returns no QR while pairing and must never
 * erase an active QR until the real server reports CONNECTED.
 */
export function WhatsappConnectionCard({
  restaurantId, canManage, hasWhatsappNumber, orderingEnabled,
}: Props) {
  const { locale } = useStaffI18n();
  const ar = locale.startsWith('ar');
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [pairing, setPairing] = useState<PairingQr | null>(null);
  const [pairMethod, setPairMethod] = useState<PairMethod>('QR');
  const [renderedQr, setRenderedQr] = useState<{ text: string; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [error, setError] = useState('');

  const base = '/staff/restaurants/' + encodeURIComponent(restaurantId);
  const connected = Boolean(hasWhatsappNumber && orderingEnabled && connection?.connected);
  const qrText = pairMethod === 'QR' ? pairing?.qrText : null;
  const qrSrc = pairing?.qrCode ?? (qrText && renderedQr?.text === qrText ? renderedQr.url : null);
  const pairingCode = pairMethod === 'CODE' ? pairing?.pairingCode ?? null : null;
  const codeAvailable = connection?.pairingCodeEnabled === true;

  const refresh = useCallback(async () => {
    try {
      const current = await getConnection(restaurantId);
      setConnection(current);
      if (current.connected) setPairing(null);
      // A feature gate can be turned off by the operator at any time.
      if (pairMethod === 'CODE' && current.pairingCodeEnabled !== true) setPairing(null);
      setError('');
    } catch {
      setError(ar ? 'تعذر تحديث حالة الاتصال. حاول مرة أخرى.' : 'Unable to check the connection. Try again.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, ar, pairMethod]);

  useEffect(() => {
    // Schedule the first async status read after React finishes this effect.
    // A synchronous state update in the effect body violates react-hooks/set-state-in-effect.
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!qrText) return;
    let active = true;
    void QRCode.toDataURL(qrText, { width: 264, margin: 2 })
      .then(url => { if (active) setRenderedQr({ text: qrText, url }); })
      .catch(() => { if (active) setRenderedQr(null); });
    return () => { active = false; };
  }, [qrText]);

  useEffect(() => {
    // Check frequently during a pairing attempt, less often once connected.
    // Never regenerate a QR automatically: that would invalidate the user's scan.
    const interval = pairing && !connected ? 10000 : connected ? 60000 : null;
    if (interval === null) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, interval);
    return () => window.clearInterval(timer);
  }, [pairing, connected, refresh]);

  function selectMethod(next: PairMethod) {
    if (busy || (next === 'CODE' && !codeAvailable)) return;
    setPairMethod(next);
    setPairing(null);
    setError('');
    setGuideOpen(false);
  }

  async function startPairing() {
    if (busy || !canManage || !hasWhatsappNumber || !orderingEnabled ||
      (pairMethod === 'CODE' && !codeAvailable)) return;
    setBusy(true);
    setError('');
    try {
      const next = pairMethod === 'CODE'
        ? await connectWhatsappByCode(restaurantId)
        : await connectWhatsapp(restaurantId);
      setConnection(next);
      if (!next.connected) setGuideOpen(true);
      setPairing(next.connected ? null : pairMethod === 'CODE'
        ? next.pairingCode
          ? { qrCode: null, qrText: null, pairingCode: next.pairingCode }
          : null
        : (next.qrCode || next.qrText)
          ? { qrCode: next.qrCode, qrText: next.qrText }
          : null);
      const hasCredential = pairMethod === 'CODE'
        ? Boolean(next.pairingCode)
        : Boolean(next.qrCode || next.qrText);
      if (!next.connected && !hasCredential) {
        setError(pairMethod === 'CODE'
          ? (ar
            ? 'مزود واتساب لم يرجع رمز ربط. جرّب QR أو تواصل مع الدعم.'
            : 'WhatsApp did not return a linking code. Use QR instead or contact support.')
          : (ar
            ? 'لم يصل رمز QR من واتساب. جرّب إنشاء رمز جديد.'
            : 'WhatsApp did not return a QR code. Try generating it again.'));
      }
    } catch {
      setError(pairMethod === 'CODE'
        ? (ar
          ? 'الربط برمز الهاتف غير متاح حاليًا. استخدم QR، ولا تغيّر إعدادات الرقم.'
          : 'Phone-code linking is unavailable. Use QR instead; do not change the saved number.')
        : (ar
          ? 'تعذر إنشاء رمز الربط. تأكد من رقم المطعم وحالة الخدمة، ثم حاول مرة أخرى.'
          : 'Could not start pairing. Check the restaurant number and service, then retry.'));
    } finally {
      setBusy(false);
    }
  }

  const status = !hasWhatsappNumber
    ? (ar ? 'رقم المطعم مطلوب' : 'Restaurant number required')
    : !orderingEnabled
      ? (ar ? 'طلبات واتساب غير مفعّلة' : 'WhatsApp ordering disabled')
      : loading && !connection
        ? (ar ? 'جاري التحقق...' : 'Checking connection...')
        : connected
          ? (ar ? 'متصل · الرقم مؤكد' : 'Connected · number verified')
          : connection?.state === 'NOT_CONFIGURED'
            ? (ar ? 'الخدمة تحتاج تفعيل' : 'Service setup required')
            : connection?.state === 'UNAVAILABLE' || !connection
              ? (ar ? 'تعذر التأكد من الاتصال' : 'Connection status unavailable')
              : (ar ? 'غير متصل' : 'Not connected');

  const canConnect = Boolean(canManage && hasWhatsappNumber && orderingEnabled &&
    connection && connection.state !== 'NOT_CONFIGURED' && !loading);
  const steps = [
    {
      title: ar ? 'راجع رقم المطعم' : 'Check the restaurant number',
      detail: ar
        ? 'تأكد إن رقم واتساب في ملف المطعم هو نفس الرقم الموجود على تليفون المطعم.'
        : 'The WhatsApp number in the restaurant profile must match the phone you will link.',
    },
    {
      title: ar ? 'فعّل طلبات واتساب' : 'Enable WhatsApp ordering',
      detail: ar
        ? 'فعّل خيار الطلب عبر واتساب من إعدادات الطلبات، واضغط «إنشاء QR» من هنا.'
        : 'Turn on the WhatsApp ordering channel in Ordering Settings, then generate the QR here.',
    },
    pairMethod === 'QR' ? {
      title: ar ? 'امسح الرمز من واتساب' : 'Scan from inside WhatsApp',
      detail: ar
        ? 'افتح لوحة تحكم Wayta على كمبيوتر أو تليفون تاني. من موبايل المطعم افتح WhatsApp أو WhatsApp Business ← الأجهزة المرتبطة ← ربط جهاز، وامسح QR من الشاشة التانية، مش بكاميرا الموبايل العادية.'
        : 'Open the Wayta dashboard on a computer or another phone. On the restaurant phone, open WhatsApp or WhatsApp Business > Linked devices > Link a device, and scan the QR from the other screen.',
    } : {
      title: ar ? 'اكتب رمز الربط في واتساب' : 'Enter the code in WhatsApp',
      detail: ar
        ? 'من تليفون المطعم افتح WhatsApp أو WhatsApp Business ← الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف بدلًا من ذلك. اكتب الرمز المؤقت اللي ظاهر في Wayta.'
        : 'On the restaurant phone open WhatsApp or WhatsApp Business > Linked devices > Link a device > Link with phone number instead. Enter the short code shown in Wayta.',
    },
    {
      title: ar ? 'اتأكد وجرب طلب' : 'Confirm and test an order',
      detail: ar
        ? 'استنى لحد ما الحالة تبقى متصل. ابعت طلب تجريبي من المنيو؛ الإحصائيات بتحسب الرسائل المستلمة والمؤكدة فقط.'
        : 'Wait for Connected, then send a test order through the menu. Only verified received messages count.',
    },
  ];

  return (
    <section id="whatsapp-connection" aria-labelledby="whatsapp-connection-title"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary">WhatsApp · Wayta</p>
          <h2 id="whatsapp-connection-title" className="text-lg font-bold text-foreground sm:text-xl">
            {ar ? 'ربط واتساب المطعم' : 'Connect restaurant WhatsApp'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {ar
              ? 'اربط رقم المطعم علشان تقدر تتابع الطلبات اللي وصلت فعلًا على واتساب.'
              : 'Link your restaurant number to track orders actually received on WhatsApp.'}
          </p>
        </div>
        <span role="status" aria-live="polite"
          className={'rounded-full px-3 py-1.5 text-xs font-bold ' +
            (connected ? 'bg-success-soft text-success' :
              !hasWhatsappNumber || !orderingEnabled ? 'bg-warning-soft text-warning' :
                'bg-muted text-foreground')}>
          {status}
        </span>
      </div>

      {connected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/20 bg-success-soft/60 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {ar ? 'رقم واتساب مرتبط بنجاح' : 'WhatsApp number linked successfully'}
            </p>
            {connection?.number ? (
              <p className="mt-1 text-sm font-medium text-foreground">
                <bdi dir="ltr">+{connection.number}</bdi>
              </p>
            ) : null}
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {ar
                ? 'الرسالة المستلمة لا تعني أن المطعم قبل الطلب أو نفّذه.'
                : 'A received message does not mean the restaurant accepted or fulfilled the order.'}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={busy}
            onClick={() => void refresh()}>
            {ar ? 'تحديث الحالة' : 'Refresh status'}
          </Button>
        </div>
      ) : (
        <>
          {!hasWhatsappNumber ? (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning-soft p-3 text-sm leading-6">
              {ar ? 'ابدأ بإضافة رقم واتساب الخاص بالمطعم في بيانات التواصل.' : 'First add the restaurant WhatsApp number to its contact details.'}{' '}
              {canManage ? <Link href={base + '/settings/profile#contact-settings'}
                className="font-bold underline underline-offset-4">
                {ar ? 'تعديل الرقم' : 'Edit number'}
              </Link> : null}
            </div>
          ) : !orderingEnabled ? (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning-soft p-3 text-sm leading-6">
              {ar ? 'لازم تفعّل قناة الطلب عبر واتساب قبل الربط.' : 'Enable the WhatsApp ordering channel before pairing.'}{' '}
              {canManage ? <Link href={base + '/settings/ordering'}
                className="font-bold underline underline-offset-4">
                {ar ? 'فتح إعدادات الطلبات' : 'Open ordering settings'}
              </Link> : null}
            </div>
          ) : connection?.state === 'NOT_CONFIGURED' ? (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning-soft p-3 text-sm leading-6">
              {ar
                ? 'ربط واتساب غير متاح حاليًا؛ محتاج تجهيز من فريق دعم Wayta.'
                : 'WhatsApp linking is not configured yet. Contact Wayta support.'}
            </div>
          ) : null}

          {!canManage ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {ar ? 'اطلب من صاحب المطعم أو المدير المخوّل إتمام الربط.' : 'Ask the restaurant owner or an authorized manager to complete pairing.'}
            </p>
          ) : null}

          {canManage ? (
            <div role="group" aria-label={ar ? 'طريقة ربط واتساب' : 'WhatsApp linking method'}
              className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" aria-pressed={pairMethod === 'QR'} disabled={busy}
                onClick={() => selectMethod('QR')}
                className={'flex min-h-24 items-start gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
                  (pairMethod === 'QR'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:border-primary/40')}>
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl text-primary">▦</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">
                    {ar ? 'مسح QR Code' : 'Scan QR code'}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {ar ? 'من موبايل المطعم والكود على جهاز تاني' : 'Scan from the restaurant phone; show the code on another screen'}
                  </span>
                  <span className="mt-1 block text-[11px] font-bold text-primary">
                    {ar ? 'الطريقة الأساسية' : 'Recommended'}
                  </span>
                </span>
              </button>
              <button type="button" aria-pressed={pairMethod === 'CODE'}
                disabled={busy || !codeAvailable} onClick={() => selectMethod('CODE')}
                className={'flex min-h-24 items-start gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed ' +
                  (pairMethod === 'CODE'
                    ? 'border-primary bg-primary/5'
                    : codeAvailable ? 'border-border bg-background hover:border-primary/40'
                      : 'border-border bg-muted/40 opacity-75')}>
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-xl text-foreground">#</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">
                    {ar ? 'الربط برمز الهاتف' : 'Link with phone code'}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {ar ? 'مناسب لو فاتح Wayta من نفس الموبايل' : 'Useful when Wayta and WhatsApp are on the same phone'}
                  </span>
                  <span className="mt-1 block text-[11px] font-bold text-muted-foreground">
                    {codeAvailable
                      ? (ar ? 'متاح للاختبار' : 'Available for testing')
                      : (ar ? 'غير مفعل حتى اختبار التوافق' : 'Disabled until compatibility is verified')}
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button type="button" disabled={!canConnect || busy ||
                (pairMethod === 'CODE' && !codeAvailable)}
                onClick={() => void startPairing()} className="min-h-11">
                {busy
                  ? (ar ? 'جاري تجهيز الرمز...' : 'Preparing link...')
                  : pairMethod === 'CODE'
                    ? pairing
                      ? (ar ? 'إصدار رمز جديد' : 'Generate new code')
                      : (ar ? 'إنشاء رمز الربط' : 'Generate linking code')
                    : pairing
                      ? (ar ? 'إنشاء QR جديد' : 'Generate new QR')
                      : (ar ? 'إنشاء QR للربط' : 'Generate pairing QR')}
              </Button>
            ) : null}
            {hasWhatsappNumber && orderingEnabled ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void refresh()}>
                {ar ? 'تحديث الحالة' : 'Refresh status'}
              </Button>
            ) : null}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{error}</p> : null}

          <div className={pairing ? 'mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]' : 'mt-5'}>
            <div className={pairing ? 'order-2 lg:order-1' : ''}>
              <button type="button" aria-expanded={guideOpen}
                aria-controls="whatsapp-connection-guide"
                onClick={() => setGuideOpen(current => !current)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-start text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span>{pairMethod === 'CODE'
                  ? (ar ? 'الربط برمز الهاتف · ٤ خطوات' : 'Link with phone code · 4 steps')
                  : (ar ? 'طريقة الربط · ٤ خطوات' : 'How to connect · 4 steps')}</span>
                <span aria-hidden="true" className="text-primary">{guideOpen ? '−' : '+'}</span>
              </button>
              {guideOpen ? (
                <ol id="whatsapp-connection-guide" className="mt-3 grid gap-3 sm:grid-cols-2">
                  {steps.map((step, index) => (
                    <li key={step.title} className="flex items-start gap-3 rounded-xl border border-border/80 bg-background p-3.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                        aria-hidden="true">{index + 1}</span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">{step.title}</h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
            {pairing ? (
              <div className="order-1 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-background p-4 text-center lg:order-2">
                {pairMethod === 'CODE' ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      {ar ? 'اكتب الرمز في الأجهزة المرتبطة' : 'Enter this in Linked devices'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {ar ? 'الرمز مؤقت، ومش تأكيد إن الربط نجح.' : 'The code is temporary and does not confirm a successful link.'}
                    </p>
                    <p dir="ltr" role="status" aria-label={ar ? 'رمز الربط' : 'Pairing code'}
                      className="mt-4 w-full overflow-hidden rounded-xl border border-border bg-card px-2 py-4 text-center font-mono text-2xl font-bold tracking-[0.14em] text-foreground sm:text-3xl">
                      {pairingCode ? pairingCode.slice(0, 4) + ' ' + pairingCode.slice(4) : '--------'}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {ar ? 'لو واتساب رفض الرمز، جرّب QR بدلًا منه.' : 'If WhatsApp rejects the code, use QR pairing instead.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      {ar ? 'امسح QR بتليفون المطعم' : 'Scan with the restaurant phone'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {ar ? 'من «الأجهزة المرتبطة» داخل واتساب' : 'From Linked devices inside WhatsApp'}
                    </p>
                    {qrSrc ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- provider or local QR data URL */
                      <img src={qrSrc} alt={ar ? 'رمز ربط واتساب' : 'WhatsApp pairing QR'}
                        width={264} height={264} className="mt-3 max-w-full rounded-xl bg-white p-2" />
                    ) : (
                      <p role="status" className="mt-4 text-sm text-muted-foreground">
                        {ar ? 'جاري تجهيز صورة QR؛ لو مش ظاهرة، أنشئ رمز جديد.' : 'Preparing QR. Generate a new one if it does not appear.'}
                      </p>
                    )}
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {ar ? 'لو الرمز انتهت صلاحيته، اضغط «إنشاء QR جديد».' : 'If the code expires, choose Generate new QR.'}
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {ar
          ? 'Wayta لا يحتفظ بنص المحادثات. العدادات ممكن تكون ناقصة أثناء انقطاع الاتصال.'
          : 'Wayta does not store chat text. Counts may be incomplete during disconnections.'}
      </p>
    </section>
  );
}
