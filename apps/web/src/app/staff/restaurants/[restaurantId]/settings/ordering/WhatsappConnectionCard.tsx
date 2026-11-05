'use client';
import { useCallback,useEffect,useState } from 'react';
import QRCode from 'qrcode';
import { getConnection, connectWhatsapp, type ConnectionView } from '../../../../../../lib/whatsapp-tracking/api';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
export function WhatsappConnectionCard({restaurantId,canManage}:{restaurantId:string;canManage:boolean}) {
  const {locale}=useStaffI18n();
  const ar=locale.startsWith('ar');
  const [state,setState]=useState<ConnectionView|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [renderedQr,setRenderedQr]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    try { setState(await getConnection(restaurantId));setError(''); }
    catch{setError(ar?'تعذر قراءة الاتصال':'Connection status unavailable');}
  },[restaurantId,ar]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    let active=true;
    if(!state?.qrText) return;
    void QRCode.toDataURL(state.qrText,{width:240,margin:2}).then(image=>{
      if(active)setRenderedQr(image);
    }).catch(()=>{if(active)setRenderedQr(null);});
    return()=>{active=false;};
  },[state?.qrText]);
  useEffect(()=>{
    if((!state?.qrCode&&!state?.qrText)||state.connected)return;
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
    return()=>window.clearInterval(timer);
  },[state?.qrCode,state?.qrText,state?.connected,refresh]);
  async function connect(){
    setBusy(true);setError('');
    try{setState(await connectWhatsapp(restaurantId));}
    catch{setError(ar?'تعذر ربط Evolution. راجع إعدادات السيرفر.':'Evolution pairing unavailable. Check server configuration.');}
    finally{setBusy(false);}
  }
  return <section className="rounded-2xl border border-border bg-card p-5">
    <h2 className="text-base font-semibold">{ar?'تتبع طلبات واتساب':'WhatsApp order tracking'}</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      {ar?'نحسب الطلب بعد وصول الرسالة فعلًا، وليس فتح واتساب.':'Counts verified received messages, not WhatsApp clicks.'}
    </p>
    <p className="mt-3 text-sm font-medium">{state?.connected?
      (ar?'متصل':'Connected'):state?.state==='UNAVAILABLE'?(ar?'الحالة غير معروفة':'Status unavailable'):
      state?.state==='NOT_CONFIGURED'?(ar?'يحتاج تجهيز السيرفر':'Server setup required'):(ar?'غير متصل':'Not connected')}</p>
    {state?.connected&&state.number?<p dir="ltr" className="mt-2 text-sm">+{state.number}</p>:null}
    {(state?.qrCode || (state?.qrText && renderedQr))?<div className="mt-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qrCode ?? renderedQr ?? ''} width={240} height={240} className="max-w-full rounded-xl border bg-white p-2" alt={ar?'رمز ربط واتساب':'WhatsApp linking QR'}/>
      <p className="mt-2 text-sm text-muted-foreground">{ar?'واتساب ← الأجهزة المرتبطة ← ربط جهاز. استخدم رقم المطعم.':'WhatsApp > Linked devices > Link a device. Use restaurant number.'}</p>
    </div>:null}
    {error?<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>:null}
    {!state?.connected&&canManage&&state?.state!=='NOT_CONFIGURED'?
      <button type="button" disabled={busy} onClick={()=>void connect()} className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground disabled:opacity-50">
        {busy?(ar?'جاري الربط...':'Connecting...'):(state?.qrCode||state?.qrText)?(ar?'تجديد QR':'Refresh QR'):(ar?'ربط واتساب':'Connect WhatsApp')}
      </button>:null}
    <p className="mt-3 text-xs text-muted-foreground">{ar?'Wayta لا يخزن المحادثات. العدادات قد تكون ناقصة أثناء قطع الاتصال.':'Wayta does not store chat histories. Counts may be incomplete while disconnected.'}</p>
  </section>;
}
