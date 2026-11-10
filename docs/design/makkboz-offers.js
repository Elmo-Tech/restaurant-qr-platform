/* Standalone preview snapshot of Makhboz's public offer, observed 2026-11-10.
   The actual application still owns offer availability, choices and prices. */
const previewOffers = [{
  id: 'alexandrian-400',
  name: 'عرض الاسكندراني ٤٠٠',
  price: '400.00',
  badge: 'الأكثر طلبًا',
  days: 'كل الأيام',
  available: true,
  image: 'makkboz-concept-assets/alexandrian-offer.webp',
  summary: 'اختار صنف من كل مجموعة، ومعاهم صنفين مضمّنين.',
  slots: [
    { id: 'first', name: 'Offer 400', type: 'single', options: [
      { name: 'شيش طاووق (وسط)', adjustment: '0.00' },
      { name: 'شوكو لوتس (كبير)', adjustment: '0.00' },
    ] },
    { id: 'second', name: 'tt', type: 'single', options: [
      { name: 'لحمة مفرومة بلدي (وسط)', adjustment: '0.00' },
      { name: 'سجق بلدي (كبير)', adjustment: '0.00' },
    ] },
    { id: 'included', name: 'مضمّن في العرض', type: 'fixed', options: [
      { name: 'فراخ (وسط)', adjustment: '0.00' },
      { name: 'فراخ كريسبي (وسط)', adjustment: '0.00' },
    ] },
  ],
}];
// These two cards demonstrate layout only; they are not live Makhboz offers.
const illustrativeOffers = [
  { id: 'example-1', example: true, name: 'عرض إضافي ١', badge: 'مثال توضيحي', summary: 'مكان لاسم العرض ووصفه من بيانات المطعم.', image: '../../apps/api/seed-data/makkboz/images/cat-pizza.webp' },
  { id: 'example-2', example: true, name: 'عرض إضافي ٢', badge: 'مثال توضيحي', summary: 'كل عرض له صورته وسعره واختياراته.', image: '../../apps/api/seed-data/makkboz/images/cat-crepe-savory.webp' },
];
const offersForPreview = previewOffers.length ? [...previewOffers, ...illustrativeOffers] : [];
const offerSection = document.querySelector('#section-offers');
const offerDialog = document.querySelector('#offer-detail');
const previewOfferLines = [];
let selectedOffer = null;
let offerChoices = {};
let offerQuantity = 1;

const giftIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1-4-5-4-5-2 0 1 2 2 5 2Zm0 0c1-4 5-4 5-2 0 1-2 2-5 2Z"/></svg>';

function renderOffers(query) {
  const show = !query && offersForPreview.length > 0;
  const oldScroll = offerSection.querySelector('.offers-grid')?.scrollLeft || 0;
  offerSection.hidden = !show;
  if (!show) return false;
  const multiple = offersForPreview.length > 1;
  offerSection.innerHTML = `<div class="offers-heading"><div class="offers-heading-title"><span class="offers-icon">${giftIcon}</span><div><span class="offers-kicker">من بيت مخبوز</span><h2 id="offers-title">عروض مخبوز</h2></div></div><span class="offers-heading-line" aria-hidden="true"></span>${multiple ? '<div class="offers-controls" aria-label="تصفح العروض"><button type="button" data-scroll-offers="previous" aria-label="العروض السابقة">→</button><button type="button" data-scroll-offers="next" aria-label="العروض التالية">←</button></div>' : ''}</div>${illustrativeOffers.length ? '<p class="offers-preview-note">العرضان الإضافيان أمثلة توضيحية للمعاينة.</p>' : ''}
    <div class="offers-grid${multiple ? ' has-multiple' : ''}"${multiple ? ' tabindex="0" role="region" aria-label="اسحب لتصفح العروض"' : ''}>${offersForPreview.map(offer => {
      const count = previewOfferLines.filter(line => line.id === offer.id).reduce((total, line) => total + line.quantity, 0);
      return `<article class="offer-card${offer.available === false ? ' is-unavailable' : ''}">
        <div class="offer-card-copy"><div class="offer-badge">${giftIcon}${esc(offer.badge)}</div><h3>${esc(offer.name)}</h3><p>${esc(offer.summary)}</p>${offer.days ? `<span class="offer-days"><span aria-hidden="true">✦</span> ${esc(offer.days)}</span>` : ''}</div>
        <div class="offer-visual" aria-hidden="true">${offer.image ? `<div class="offer-photo${offer.example ? ' is-example' : ''}" style="background-image:url('${esc(offer.image)}')"></div>` : `<div class="offer-photo offer-photo-fallback">${giftIcon}</div>`}</div>
        <div class="offer-card-footer"><div class="offer-price"><span>سعر العرض</span><strong>${offer.example ? '—' : money(toMinor(offer.price))}</strong></div>
          ${offer.available !== false ? `<button type="button" class="offer-open" data-open-offer="${esc(offer.id)}">تفاصيل العرض <span aria-hidden="true">←</span></button>` : '<span class="offer-unavailable">غير متاح النهاردة</span>'}</div>
        ${count ? `<div class="offer-preview-count">${numberFormat.format(count)} في المعاينة</div>` : ''}
      </article>`;
    }).join('')}</div>${multiple ? '<p class="offers-swipe-hint" aria-hidden="true">اسحب يمين أو شمال للتنقل <span>↔</span></p>' : ''}`;
  if (multiple) {
    const track = offerSection.querySelector('.offers-grid');
    track.scrollLeft = oldScroll;
    track.addEventListener('scroll', updateOfferControls, { passive: true });
    requestAnimationFrame(updateOfferControls);
  }
  return true;
}

function updateOfferControls() {
  const track = offerSection.querySelector('.offers-grid.has-multiple');
  if (!track) return;
  const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
  const position = Math.abs(track.scrollLeft);
  const controls = offerSection.querySelector('.offers-controls');
  controls.hidden = maximum < 2;
  const hint = offerSection.querySelector('.offers-swipe-hint');
  if (hint) hint.hidden = maximum < 2;
  controls.querySelector('[data-scroll-offers="previous"]').disabled = position <= 2;
  controls.querySelector('[data-scroll-offers="next"]').disabled = position >= maximum - 2;
}
window.addEventListener('resize', updateOfferControls, { passive: true });

function openIllustrativeOffer(offer) {
  offerDialog.innerHTML = `<div class="offer-sheet"><div class="offer-sheet-top"><span>${giftIcon} مثال توضيحي</span><button type="button" class="offer-close" aria-label="إغلاق">×</button></div><div class="offer-example-sheet"><div class="offer-example-icon">${giftIcon}</div><h2 id="offer-detail-title">${esc(offer.name)}</h2><p>مثال لشكل عرض إضافي في المعاينة. تفاصيل العرض الفعلي وسعره واختياراته هتظهر هنا.</p><button type="button" class="offer-close offer-example-done">تمام</button></div></div>`;
  offerDialog.showModal();
}

function chosenCount(slot) {
  return Object.values(offerChoices[slot.id] || {}).reduce((sum, count) => sum + count, 0);
}
function completeSlot(slot) {
  return slot.type === 'fixed' || chosenCount(slot) === (slot.type === 'multi' ? slot.count : 1);
}
function offerUnitPrice() {
  return selectedOffer.slots.reduce((total, slot) => {
    const choices = offerChoices[slot.id] || {};
    return total + slot.options.reduce((sum, option, index) => sum + toMinor(option.adjustment || '0') * BigInt(choices[index] || 0), 0n);
  }, toMinor(selectedOffer.price));
}
function slotMarkup(slot, slotIndex) {
  const isFixed = slot.type === 'fixed';
  const requirement = isFixed ? 'مضمّن' : (slot.type === 'multi' ? `اختار ${numberFormat.format(slot.count)}` : 'اختيار واحد');
  const options = slot.options.map((option, optionIndex) => {
    const adjustment = toMinor(option.adjustment || '0');
    if (isFixed) return `<li class="offer-included-row"><span class="offer-included-mark" aria-hidden="true">✓</span><span>${esc(option.name)}</span></li>`;
    if (slot.type === 'single') return `<label class="offer-option"><input type="radio" name="offer-slot-${slotIndex}" value="${optionIndex}" data-offer-slot="${slotIndex}"><span class="offer-option-mark" aria-hidden="true"></span><span class="offer-option-name">${esc(option.name)}</span>${adjustment > 0n ? `<span class="offer-adjustment">+ ${money(adjustment)}</span>` : ''}</label>`;
    return `<div class="offer-option offer-multi-option"><span class="offer-option-name">${esc(option.name)}</span>${adjustment > 0n ? `<span class="offer-adjustment">+ ${money(adjustment)}</span>` : ''}<div class="offer-multi-stepper"><button type="button" data-multi="minus" data-slot="${slotIndex}" data-option="${optionIndex}" aria-label="تقليل ${esc(option.name)}">−</button><span data-multi-count="${slotIndex}-${optionIndex}">٠</span><button type="button" data-multi="plus" data-slot="${slotIndex}" data-option="${optionIndex}" aria-label="إضافة ${esc(option.name)}">+</button></div></div>`;
  }).join('');
  return `<fieldset class="offer-slot" id="offer-slot-${slotIndex}" aria-label="${esc(slot.name)}"><div class="offer-slot-header"><div><span class="offer-slot-eyebrow">${isFixed ? 'مع العرض' : `اختيار ${numberFormat.format(slotIndex + 1)}`}</span><h3 dir="auto">${esc(slot.name)}</h3></div><span class="offer-slot-state" data-slot-state="${slotIndex}">${requirement}</span></div>${isFixed ? `<ul class="offer-included-list">${options}</ul>` : `<div class="offer-option-list">${options}</div>`}</fieldset>`;
}
function updateOfferSheet() {
  const missingIndex = selectedOffer.slots.findIndex(slot => !completeSlot(slot));
  const missing = selectedOffer.slots[missingIndex];
  offerDialog.querySelector('#offer-missing').textContent = missing ? `كمّل اختيار: ${missing.name}` : 'اختياراتك جاهزة';
  offerDialog.querySelector('#offer-missing').classList.toggle('is-ready', !missing);
  offerDialog.querySelector('#offer-confirm').setAttribute('aria-disabled', String(!!missing));
  offerDialog.querySelector('#offer-total').innerHTML = money(offerUnitPrice() * BigInt(offerQuantity));
  offerDialog.querySelector('#offer-quantity').textContent = numberFormat.format(offerQuantity);
  offerDialog.querySelector('#offer-minus').disabled = offerQuantity <= 1;
  offerDialog.querySelector('#offer-plus').disabled = offerQuantity >= 99;
  selectedOffer.slots.forEach((slot, index) => {
    const state = offerDialog.querySelector(`[data-slot-state="${index}"]`);
    if (slot.type !== 'fixed') {
      state.textContent = completeSlot(slot) ? 'تم الاختيار' : (slot.type === 'multi' ? `اختار ${numberFormat.format(slot.count)}` : 'اختيار واحد');
      state.classList.toggle('is-complete', completeSlot(slot));
    }
    if (slot.type === 'multi') slot.options.forEach((_, optionIndex) => {
      const count = offerChoices[slot.id]?.[optionIndex] || 0;
      offerDialog.querySelector(`[data-multi-count="${index}-${optionIndex}"]`).textContent = numberFormat.format(count);
      offerDialog.querySelector(`[data-multi="minus"][data-slot="${index}"][data-option="${optionIndex}"]`).disabled = count === 0;
      offerDialog.querySelector(`[data-multi="plus"][data-slot="${index}"][data-option="${optionIndex}"]`).disabled = chosenCount(slot) >= slot.count;
    });
  });
}
function openOfferSheet(offer) {
  selectedOffer = offer;
  offerChoices = {};
  offerQuantity = 1;
  offerDialog.innerHTML = `<div class="offer-sheet"><div class="offer-sheet-top"><span>${giftIcon} من عروض مخبوز</span><button type="button" class="offer-close" aria-label="إغلاق">×</button></div>
    <div class="offer-sheet-body"><div class="offer-sheet-image" style="background-image:url('${esc(offer.image)}')" aria-hidden="true"><span>${esc(offer.badge)}</span></div>
      <div class="offer-sheet-intro"><div><span class="offer-sheet-kicker">عرض مخبوز</span><h2 id="offer-detail-title">${esc(offer.name)}</h2><p>${esc(offer.days)} · سعر العرض ثابت</p></div><strong>${money(toMinor(offer.price))}</strong></div>
      <div class="offer-sheet-slots">${offer.slots.map(slotMarkup).join('')}</div></div>
    <div class="offer-sheet-footer"><p class="offer-demo-note">معاينة للتصميم · لن يُرسل طلب</p><p id="offer-missing" class="offer-missing" role="status" aria-live="polite"></p><div class="offer-sheet-actions"><div class="offer-quantity" role="group" aria-label="الكمية"><button type="button" id="offer-minus" aria-label="تقليل الكمية">−</button><span id="offer-quantity"></span><button type="button" id="offer-plus" aria-label="زيادة الكمية">+</button></div><button type="button" id="offer-confirm" aria-disabled="true"><span>أضف للمعاينة</span><strong id="offer-total"></strong></button></div></div></div>`;
  updateOfferSheet();
  offerDialog.showModal();
}

offerSection.addEventListener('click', event => {
  const direction = event.target.closest('[data-scroll-offers]');
  if (direction) {
    const track = offerSection.querySelector('.offers-grid');
    const card = track.querySelector('.offer-card');
    const distance = card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap || '0');
    track.scrollBy({ left: direction.dataset.scrollOffers === 'next' ? -distance : distance, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  const button = event.target.closest('[data-open-offer]');
  const offer = button && offersForPreview.find(item => item.id === button.dataset.openOffer);
  if (!offer || offer.available === false) return;
  if (offer.example) openIllustrativeOffer(offer);
  else openOfferSheet(offer);
});
offerDialog.addEventListener('change', event => {
  const input = event.target.closest('input[data-offer-slot]');
  if (!input) return;
  const slot = selectedOffer.slots[Number(input.dataset.offerSlot)];
  offerChoices[slot.id] = { [Number(input.value)]: 1 };
  updateOfferSheet();
});
offerDialog.addEventListener('click', event => {
  if (event.target.closest('.offer-close')) { offerDialog.close(); return; }
  if (event.target.closest('#offer-minus')) { offerQuantity = Math.max(1, offerQuantity - 1); updateOfferSheet(); return; }
  if (event.target.closest('#offer-plus')) { offerQuantity = Math.min(99, offerQuantity + 1); updateOfferSheet(); return; }
  const multi = event.target.closest('[data-multi]');
  if (multi) {
    const slot = selectedOffer.slots[Number(multi.dataset.slot)];
    const index = Number(multi.dataset.option);
    const choices = offerChoices[slot.id] || {};
    const current = choices[index] || 0;
    choices[index] = multi.dataset.multi === 'minus' ? Math.max(0, current - 1) : Math.min(current + 1, current + slot.count - chosenCount(slot));
    offerChoices[slot.id] = choices;
    updateOfferSheet();
    return;
  }
  if (!event.target.closest('#offer-confirm')) return;
  const missing = selectedOffer.slots.findIndex(slot => !completeSlot(slot));
  if (missing !== -1) {
    offerDialog.querySelector(`#offer-slot-${missing}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  previewOfferLines.push({ id: selectedOffer.id, quantity: offerQuantity, choices: structuredClone(offerChoices) });
  const offerId = selectedOffer.id;
  offerDialog.close();
  renderOffers(search.value.trim());
  announce(`${selectedOffer.name} · إضافة للمعاينة فقط`);
  [...offerSection.querySelectorAll('[data-open-offer]')].find(button => button.dataset.openOffer === offerId)?.focus({ preventScroll: true });
});
