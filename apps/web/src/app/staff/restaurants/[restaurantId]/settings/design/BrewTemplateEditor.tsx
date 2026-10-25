'use client';
import {useEffect,useState} from 'react';
import {listCategories} from '../../../../../../lib/menu/api';
import type {Category} from '../../../../../../lib/menu/types';
import {ImageField} from '../../../../../../components/menu/ImageField';
import {validateImageFile} from '../../../../../../lib/menu/image-validation';
import {describeError,isUnauthenticatedError,redirectToLogin} from '../../../../../../lib/menu/error-message';
import {resolveAssetUrl} from '../../../../../../lib/media/asset-url';
import {DEFAULT_BREW_SETTINGS,BREW_COPY_LIMITS,BREW_PROMO_KEYS,normalizeBrewTemplateSettings,type BrewTemplateSettings,type BrewPromoCopy,type BrewPalette} from '../../../../../../lib/public-menu/brew-settings';
import {getBrewTemplateConfig,saveBrewTemplateDraft,publishBrewTemplate,uploadBrewPromoImage,resetBrewPromoImage} from '../../../../../../lib/settings/api';
const HEADINGS=[['navTagline','Header tagline'],['eyebrow','Hero eyebrow'],['headlineTop','Headline first line'],['headlineBottom','Headline italic line'],['subtitle','Hero description'],['story','Story line'],['menuHeading','Menu heading'],['menuSubtitle','Menu description'],['promoLabel','Promo label'],['promoHeadline','Promo headline'],['promoDescription','Promo description']] as const;
const promoFields=new Set<string>(['promoLabel','promoHeadline','promoDescription']);
export function BrewTemplateEditor({restaurantId,canManage,onDraftChange,onCopyLanguageChange}:{restaurantId:string;canManage:boolean;onDraftChange:(d:BrewTemplateSettings)=>void;onCopyLanguageChange:(l:'ar'|'en')=>void}){
 const [draft,setDraft]=useState<BrewTemplateSettings>(DEFAULT_BREW_SETTINGS);
 const [saved,setSaved]=useState<BrewTemplateSettings>(DEFAULT_BREW_SETTINGS);
 const [published,setPublished]=useState<BrewTemplateSettings>(DEFAULT_BREW_SETTINGS);
 const [categories,setCategories]=useState<Category[]>([]);
 const [categoryId,setCategoryId]=useState('');
 const [locale,setLocale]=useState<'Ar'|'En'>('Ar');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState('');
 const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
 const unpublished=JSON.stringify(saved)!==JSON.stringify(published);
 useEffect(()=>{let cancelled=false;
  Promise.all([getBrewTemplateConfig(restaurantId),listCategories(restaurantId)]).then(([config,items])=>{
   if(cancelled)return;setDraft(config.draft);setSaved(config.draft);setPublished(config.published);
   setCategories(items.filter(c=>c.status==='ACTIVE'));setError(null);
  }).catch(e=>{if(!cancelled){if(isUnauthenticatedError(e))redirectToLogin();else setError(describeError(e));}})
    .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[restaurantId]);
 useEffect(()=>{if(!loading)onDraftChange(draft)},[draft,loading,onDraftChange]);
 const update=<K extends keyof BrewTemplateSettings>(k:K,v:BrewTemplateSettings[K])=>{setDraft(s=>({...s,[k]:v}));setNotice('')};
 const changeField=(key:keyof typeof BREW_COPY_LIMITS,value:string)=>{
  if(draft.promoMode==='BY_CATEGORY'&&categoryId&&BREW_PROMO_KEYS.some(k=>k===key)){
   const copy=Object.fromEntries(BREW_PROMO_KEYS.map(k=>[k,draft.categoryPromos[categoryId]?.[k]??draft[k]])) as BrewPromoCopy;
   update('categoryPromos',{...draft.categoryPromos,[categoryId]:{...copy,[key]:value}});
  }else update(key,value);
 };
 async function action(job:()=>Promise<{draft:BrewTemplateSettings;published:BrewTemplateSettings}>,message:string){
  setBusy(true);setError(null);setNotice('');
  try{const x=await job();setDraft(normalizeBrewTemplateSettings(x.draft));setSaved(normalizeBrewTemplateSettings(x.draft));
   setPublished(normalizeBrewTemplateSettings(x.published));setNotice(message);}
  catch(e){if(isUnauthenticatedError(e))redirectToLogin();else setError(describeError(e))}
  finally{setBusy(false)}
 }
 /**
  * Upload/reset saves only the server-owned image field. Preserve unsaved palette
  * and text edits, just like BLOOM, so selecting a color before an upload is safe.
  */
 async function mediaAction(job:()=>Promise<{draft:BrewTemplateSettings;published:BrewTemplateSettings}>,message:string){
  setBusy(true);setError(null);setNotice('');
  try{
   const result=await job();
   const serverDraft=normalizeBrewTemplateSettings(result.draft);
   setSaved(serverDraft);
   setPublished(normalizeBrewTemplateSettings(result.published));
   setDraft(current=>({...current,promoImageMode:serverDraft.promoImageMode,promoImageAssetPath:serverDraft.promoImageAssetPath}));
   setNotice(message);
  }catch(e){if(isUnauthenticatedError(e))redirectToLogin();else setError(describeError(e))}
  finally{setBusy(false)}
 }
 async function upload(f:File){
  const invalid=validateImageFile(f);if(invalid){setError(invalid);return}
  await mediaAction(()=>uploadBrewPromoImage(restaurantId,f),'Promo photo uploaded to draft. Publish to show it to guests.');
 }
 if(loading)return <p className="text-sm text-muted-foreground">Loading BREW settings…</p>;
 return <section className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
  <h3 className="font-bold">BREW · Coffee appearance</h3>
  <p className="text-xs text-muted-foreground">Original Cormorant Garamond and Tajawal are preserved. Edit fields or keep their defaults.</p>
  {error?<p role="alert" className="text-sm text-red-600">{error}</p>:null}{notice?<p role="status" className="text-sm text-green-700">{notice}</p>:null}
  <label className="block text-sm">Color palette
    <select className="mt-1 block w-full rounded-lg border border-input bg-card p-2.5 text-foreground"
      value={draft.palette} disabled={busy||!canManage}
      onChange={e=>update('palette',e.target.value as BrewPalette)}>
      <option value="FOREST">Forest · Original Green & Cream</option>
      <option value="MOCHA">Mocha · Coffee Brown & Caramel</option>
      <option value="SAGE">Sage · Soft Olive & Ivory</option>
    </select>
  </label>
  <label className="block text-sm">Motion
   <select className="mt-1 block w-full rounded-lg border p-2" value={draft.motion} disabled={busy||!canManage}
    onChange={e=>update('motion',e.target.value==='OFF'?'OFF':'SUBTLE')}>
    <option value="SUBTLE">Soft floating cup</option><option value="OFF">No animation</option></select></label>
  <div className="flex gap-2">
   {(['Ar','En'] as const).map(x=><button key={x} type="button" className={`rounded-lg border px-3 py-2 ${locale===x?'bg-primary text-white':''}`}
     onClick={()=>{setLocale(x);onCopyLanguageChange(x.toLowerCase() as 'ar'|'en')}}>{x==='Ar'?'العربية':'English'}</button>)}
  </div>
  <div className="space-y-3">{HEADINGS.map(([name,label])=>{
   const key=`${name}${locale}` as keyof typeof BREW_COPY_LIMITS;
   const override=draft.promoMode==='BY_CATEGORY'&&categoryId&&promoFields.has(name)?draft.categoryPromos[categoryId]?.[key as keyof BrewPromoCopy]:undefined;
   const value=override??draft[key];
   return <label className="block text-sm" key={key}>{label}
    <input dir={locale==='Ar'?'rtl':'ltr'} className="mt-1 block w-full rounded-lg border bg-card px-3 py-2"
      disabled={busy||!canManage} maxLength={BREW_COPY_LIMITS[key]} value={value}
      onChange={e=>changeField(key,e.target.value)}/>
    <button type="button" className="mt-1 text-xs text-primary underline" disabled={busy||!canManage}
     onClick={()=>changeField(key,DEFAULT_BREW_SETTINGS[key])}>Restore default</button>
   </label>})}</div>
  <div className="space-y-3 rounded-xl border bg-card p-3">
   <label className="flex items-center gap-2"><input type="checkbox" checked={draft.promoEnabled} disabled={busy||!canManage}
     onChange={e=>update('promoEnabled',e.target.checked)}/>Show promotion card</label>
   {draft.promoEnabled?<><label className="block text-sm">Promotion behavior
      <select className="mt-1 block w-full rounded-lg border p-2" value={draft.promoMode}
       disabled={busy||!canManage} onChange={e=>{update('promoMode',e.target.value==='BY_CATEGORY'?'BY_CATEGORY':'STATIC');setCategoryId('')}}>
       <option value="STATIC">Same card in all categories</option><option value="BY_CATEGORY">Optional content per category</option></select></label>
    {draft.promoMode==='BY_CATEGORY'?<><label className="block text-sm">Category override
      <select className="mt-1 block w-full rounded-lg border p-2" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
       <option value="">Default promo for categories without overrides</option>{categories.map(c=><option key={c.id} value={c.id}>{c.translation.name}</option>)}
      </select></label>{categoryId&&draft.categoryPromos[categoryId]?<button className="text-xs underline" type="button"
       onClick={()=>{const x={...draft.categoryPromos};delete x[categoryId];update('categoryPromos',x)}}>Remove category override</button>:null}</>:null}
    <ImageField idPrefix="brew-promo" imageUrl={draft.promoImageMode==='CUSTOM'?resolveAssetUrl(draft.promoImageAssetPath):null}
      onSelectFile={file=>void upload(file)} isBusy={busy||!canManage} error={error} selectLabel="Upload promo photo (optional)"
      helperText="Default coffee artwork is used until a photo is uploaded" previewShape="wide"/>
    {draft.promoImageAssetPath?<button type="button" className="text-xs underline"
      onClick={()=>void mediaAction(()=>resetBrewPromoImage(restaurantId),'Original cup restored in draft.')}>Restore coffee illustration</button>:null}
   </>:null}
  </div>
  <p className="text-xs text-muted-foreground">Preview updates immediately. Save Draft stays private. Publish Appearance changes the guest menu.</p>
  <div className="flex gap-2"><button type="button" className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy||!canManage||!dirty}
   onClick={()=>void action(()=>saveBrewTemplateDraft(restaurantId,draft),'BREW draft saved.')}>Save Draft</button>
   <button type="button" className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={busy||!canManage||dirty||!unpublished}
    onClick={()=>void action(()=>publishBrewTemplate(restaurantId),'BREW appearance published.')}>Publish Appearance</button></div>
 </section>;
}
