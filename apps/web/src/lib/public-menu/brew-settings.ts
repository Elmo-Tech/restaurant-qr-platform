export type BrewPromoCopy = { promoLabelAr:string;promoLabelEn:string;promoHeadlineAr:string;promoHeadlineEn:string;promoDescriptionAr:string;promoDescriptionEn:string };
export interface BrewTemplateSettings extends BrewPromoCopy {
 motion:'SUBTLE'|'OFF';navTaglineAr:string;navTaglineEn:string;eyebrowAr:string;eyebrowEn:string;
 headlineTopAr:string;headlineTopEn:string;headlineBottomAr:string;headlineBottomEn:string;
 subtitleAr:string;subtitleEn:string;storyAr:string;storyEn:string;menuHeadingAr:string;menuHeadingEn:string;
 menuSubtitleAr:string;menuSubtitleEn:string;promoEnabled:boolean;promoMode:'STATIC'|'BY_CATEGORY';
 promoImageMode:'ART'|'CUSTOM';promoImageAssetPath:string|null;categoryPromos:Record<string,BrewPromoCopy>;
}
export interface BrewTemplateConfigView {draft:BrewTemplateSettings;published:BrewTemplateSettings}
export const BREW_COPY_LIMITS={navTaglineAr:100,navTaglineEn:100,eyebrowAr:120,eyebrowEn:120,headlineTopAr:60,headlineTopEn:60,headlineBottomAr:60,headlineBottomEn:60,subtitleAr:180,subtitleEn:180,storyAr:120,storyEn:120,menuHeadingAr:120,menuHeadingEn:120,menuSubtitleAr:180,menuSubtitleEn:180,promoLabelAr:80,promoLabelEn:80,promoHeadlineAr:120,promoHeadlineEn:120,promoDescriptionAr:180,promoDescriptionEn:180} as const;
export const BREW_COPY_KEYS=Object.keys(BREW_COPY_LIMITS) as (keyof typeof BREW_COPY_LIMITS)[];
export const BREW_PROMO_KEYS=['promoLabelAr','promoLabelEn','promoHeadlineAr','promoHeadlineEn','promoDescriptionAr','promoDescriptionEn'] as const;
export const DEFAULT_BREW_SETTINGS:BrewTemplateSettings={
 motion:'SUBTLE',navTaglineAr:'YOUR DAILY COFFEE RITUAL',navTaglineEn:'YOUR DAILY COFFEE RITUAL',
 eyebrowAr:'SLOW DOWN. SIP BETTER.',eyebrowEn:'SLOW DOWN. SIP BETTER.',
 headlineTopAr:'Coffee,',headlineTopEn:'Coffee,',headlineBottomAr:'slowly.',headlineBottomEn:'slowly.',
 subtitleAr:'قهوة مظبوطة، تفاصيل تستاهل، ووقت هادي مخصوص ليك. من أول رشفة لآخر لحظة.',
 subtitleEn:'A perfectly made coffee, thoughtful details, and a moment to slow down.',
 storyAr:'ROASTED WITH LOVE · SERVED WITH CARE',storyEn:'ROASTED WITH LOVE · SERVED WITH CARE',
 menuHeadingAr:'On the menu.',menuHeadingEn:'On the menu.',
 menuSubtitleAr:'أجود الحبوب، وصفات متقنة، ودفء في كل كوب.',menuSubtitleEn:'Great beans, crafted recipes, and warmth in every cup.',
 promoLabelAr:'THE HOUSE SPECIAL',promoLabelEn:'THE HOUSE SPECIAL',
 promoHeadlineAr:'Take a little break.',promoHeadlineEn:'Take a little break.',
 promoDescriptionAr:'لحظات أحلى مع قهوتك المفضلة.',promoDescriptionEn:'The sweetest moments with your favorite coffee.',
 promoEnabled:true,promoMode:'STATIC',promoImageMode:'ART',promoImageAssetPath:null,categoryPromos:{}
};
const validAsset=(x:unknown):x is string=>typeof x==='string'&&/^\/media\/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(jpg|png|webp)$/.test(x);
export function normalizeBrewTemplateSettings(input:unknown):BrewTemplateSettings {
 const row=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const val=(k:keyof typeof BREW_COPY_LIMITS)=>typeof row[k]==='string'&&(row[k] as string).trim()?(row[k] as string).trim().slice(0,BREW_COPY_LIMITS[k]):DEFAULT_BREW_SETTINGS[k];
 const copy=Object.fromEntries(BREW_COPY_KEYS.map(k=>[k,val(k)])) as Pick<BrewTemplateSettings,keyof typeof BREW_COPY_LIMITS>;
 const source=row.categoryPromos&&typeof row.categoryPromos==='object'&&!Array.isArray(row.categoryPromos)?row.categoryPromos as Record<string,unknown>:{};
 const categoryPromos:Record<string,BrewPromoCopy>={};
 for(const [id,v] of Object.entries(source).slice(0,50)){
  if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)||!v||typeof v!=='object'||Array.isArray(v))continue;
  const raw=v as Record<string,unknown>;
  categoryPromos[id.toLowerCase()]=Object.fromEntries(BREW_PROMO_KEYS.map(k=>[k,typeof raw[k]==='string'&&(raw[k] as string).trim()?(raw[k] as string).trim().slice(0,BREW_COPY_LIMITS[k]):copy[k]])) as BrewPromoCopy;
 }
 return {...copy,motion:row.motion==='OFF'?'OFF':'SUBTLE',promoEnabled:row.promoEnabled!==false,
 promoMode:row.promoMode==='BY_CATEGORY'?'BY_CATEGORY':'STATIC',
 promoImageMode:row.promoImageMode==='CUSTOM'&&validAsset(row.promoImageAssetPath)?'CUSTOM':'ART',
 promoImageAssetPath:validAsset(row.promoImageAssetPath)?row.promoImageAssetPath:null,categoryPromos};
}
export function normalizeBrewTemplateConfigView(v:unknown):BrewTemplateConfigView{
 const r=v&&typeof v==='object'?v as Record<string,unknown>:{};
 return {draft:normalizeBrewTemplateSettings(r.draft),published:normalizeBrewTemplateSettings(r.published)};
}
export function brewPromoForCategory(settings:BrewTemplateSettings,id:string|undefined):BrewPromoCopy{
 return settings.promoMode==='BY_CATEGORY'&&id&&settings.categoryPromos[id]?settings.categoryPromos[id]:settings;
}
export const BREW_DESIGN_PREVIEW_READY='wayta:brew-design-preview:ready:v1';
export const BREW_DESIGN_PREVIEW_UPDATE='wayta:brew-design-preview:update:v1';
export function isBrewPreviewUpdate(x:unknown):x is {type:typeof BREW_DESIGN_PREVIEW_UPDATE;settings:unknown}{
 return !!x&&typeof x==='object'&&(x as {type?:unknown}).type===BREW_DESIGN_PREVIEW_UPDATE;
}
