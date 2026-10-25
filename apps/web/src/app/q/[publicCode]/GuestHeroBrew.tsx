'use client';
import {HeroActions,LanguageSwitch,type GuestHeroProps} from './GuestHero';
export function GuestHeroBrew({sentinelRef,...p}:GuestHeroProps){
 return <header ref={sentinelRef} className="brew-v2-header">
  <nav className="brew-v2-nav"><div className="brew-v2-brand"><span className="brew-v2-mark">✳</span><strong className="brew-v2-display"><bdi>{p.restaurantName}</bdi></strong></div>
    <span className="brew-v2-navnote">{p.brewNavTagline}</span>
    <button type="button" onClick={p.onBrewCartOpen} disabled={!p.onBrewCartOpen}>{p.copy.cart} · {p.brewCartCount??0}</button></nav>
  <div className="brew-v2-hero"><div className="brew-v2-copy"><div className="brew-v2-eyebrow">{p.brewEyebrow}</div>
    <h1 className="brew-v2-display"><span>{p.brewHeadlineTop}</span><i>{p.brewHeadlineBottom}</i></h1>
    <p dir="auto">{p.brewSubtitle}</p><small>{p.brewStory}</small>
    <div className="brew-v2-tools"><LanguageSwitch available={p.locale.available} resolved={p.locale.resolved} publicCode={p.publicCode} label={p.copy.language} designPreview={p.emberDesignPreview} previewTemplate="brew"/>
    <HeroActions copy={p.copy} restaurantName={p.restaurantName} shareCode={p.shareCode} onTrack={p.onTrack} hasActiveOrder={p.hasActiveOrder}/></div></div>
  <div className="brew-v2-art"><span className="brew-v2-artframe"/>
    <svg viewBox="0 0 510 510" role="img" aria-label="Latte cup illustration">
    <defs><radialGradient id="brew-coffee"><stop stopColor="#d2a679"/><stop offset=".73" stopColor="#935c38"/><stop offset="1" stopColor="#40281f"/></radialGradient><linearGradient id="brew-cup" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fbf7e9"/><stop offset="1" stopColor="#b4b6a6"/></linearGradient></defs>
    <ellipse cx="264" cy="435" rx="156" ry="25" fill="#182b24" opacity=".3"/><ellipse cx="250" cy="342" rx="205" ry="81" fill="#ebeee1"/><ellipse cx="250" cy="340" rx="172" ry="60" fill="#aaa997"/>
    <path d="M109 252 Q104 396 253 405 Q408 393 392 253" fill="url(#brew-cup)"/><path d="M382 262 Q482 222 469 298 Q467 364 382 351" fill="none" stroke="#ecece0" strokeWidth="25"/>
    <ellipse cx="251" cy="252" rx="154" ry="93" fill="#f7f4e4"/><ellipse cx="251" cy="249" rx="138" ry="78" fill="url(#brew-coffee)"/>
    <path d="M250 316 C186 273 162 252 176 230 C188 211 219 223 238 245 C236 205 265 192 284 213 C315 253 270 291 250 316Z" fill="#f4e9c9"/>
    <path d="M250 298 C216 271 205 248 220 232 C235 221 250 236 252 250 C268 225 283 224 294 239 C311 265 277 287 250 298Z" fill="#fff9e1"/>
    <path d="M252 322 Q263 269 258 226" stroke="#f5e5ba" strokeWidth="7" strokeLinecap="round" fill="none"/></svg>
    <span className="brew-v2-seal">GOOD<br/>VIBES<br/>ONLY ✴</span>
  </div></div></header>;
}
