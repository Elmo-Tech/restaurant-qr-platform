'use client';
import { useEffect,useState } from 'react';
import {getConnection,getToday,type ConnectionView,type TodayView} from '../../../../../lib/whatsapp-tracking/api';
import {useStaffI18n} from '../../../../../lib/i18n/client';
export function WhatsappOrdersPanel({restaurantId}:{restaurantId:string}){
  const {locale}=useStaffI18n(), ar=locale.startsWith('ar');
  const [connection,setConnection]=useState<ConnectionView|null>(null);
  const [today,setToday]=useState<TodayView|null>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    let live=true;
    async function load(){
      try{
        const c=await getConnection(restaurantId);
        if(!live)return;
        setConnection(c);
        if(c.state==='NOT_CONFIGURED')return;
        const metrics=await getToday(restaurantId);
        if(live){setToday(metrics);setFailed(false);}
      }catch{if(live)setFailed(true);}
    }
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
    return()=>{live=false;window.clearInterval(timer);};
  },[restaurantId]);
  if(connection?.state==='NOT_CONFIGURED'||(connection?.state==='NOT_CONNECTED'&&!today))return null;
  return <section className="rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">{ar?'طلبات واتساب المستلمة':'Verified WhatsApp orders'}</h2>
      <span className="text-xs text-muted-foreground">{connection?.connected?(ar?'متصل':'Connected'):(ar?'الاتصال غير مؤكد':'Status not verified')}</span>
    </div>
    {failed||!today?<p className="mt-3 text-sm text-muted-foreground">{ar?'الإحصائيات غير متاحة':'Metrics unavailable'}</p>:
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{ar?'عدد الطلبات':'Received orders'}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{today.count}</p></div>
        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{ar?'إجمالي القيمة':'Order value'}</p><p className="mt-1 text-xl font-semibold tabular-nums">{today.total} <span className="text-xs">{today.currencyCode}</span></p></div>
      </div>}
    <p className="mt-2 text-xs text-muted-foreground">{ar?'اليوم بتوقيت UTC · الاستلام لا يعني تنفيذ الطلب':'UTC today · Received does not mean fulfilled'}</p>
  </section>;
}
