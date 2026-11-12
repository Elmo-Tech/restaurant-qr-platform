import { apiFetch } from '../api/client';
export interface ConnectionView {
  connected:boolean; state:'NOT_CONFIGURED'|'NOT_CONNECTED'|'CONNECTED'|'UNAVAILABLE';
  number:string|null; qrCode:string|null; qrText:string|null;
  pairingCodeEnabled?:boolean; pairingCode?:string;
}
export interface TodayView {count:number;total:string;currencyCode:string}
export async function getConnection(id:string) {
  return (await apiFetch<{data:ConnectionView}>('/restaurants/'+encodeURIComponent(id)+'/whatsapp-tracking/connection')).data;
}
export async function connectWhatsapp(id:string) {
  return (await apiFetch<{data:ConnectionView}>('/restaurants/'+encodeURIComponent(id)+'/whatsapp-tracking/connect',{method:'POST'})).data;
}
/** Pairing codes are requested only by an authorized POST; never from GET status. */
export async function connectWhatsappByCode(id:string) {
  return (await apiFetch<{data:ConnectionView}>('/restaurants/'+encodeURIComponent(id)+'/whatsapp-tracking/connect/code',{method:'POST'})).data;
}
export async function getToday(id:string) {
  return (await apiFetch<{data:TodayView}>('/restaurants/'+encodeURIComponent(id)+'/whatsapp-tracking/today')).data;
}
