/* Standalone design preview: all selections below live only in this page. */
const assets = '../../apps/api/seed-data/makkboz/images/';
const sections = document.querySelector('#sections');
const rail = document.querySelector('#rail');
const search = document.querySelector('#search');
const detail = document.querySelector('#detail');
const notice = document.querySelector('#preview-notice');
const previewCounts = new Map();
let activeProduct = null;
let activeCategory = null;
let quantity = 1;
let noticeTimer;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const toMinor = value => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};
const numberFormat = new Intl.NumberFormat('ar-EG');
const amount = minor => {
  const whole = numberFormat.format(minor / 100n);
  const fraction = minor % 100n;
  return fraction === 0n ? whole : `${whole}٫${numberFormat.format(fraction).padStart(2, '٠')}`;
};
const money = minor => `${amount(minor)} <small>ج.م</small>`;
const minPrice = product => product.variants.length
  ? product.variants.reduce((best, variant) => toMinor(variant.price) < best ? toMinor(variant.price) : best, toMinor(product.variants[0].price))
  : toMinor(product.price);
const keyFor = (category, product) => `${category.key}:${product.index}`;
const shortName = (category, product) => product.name.startsWith(category.name + ' ') ? product.name.slice(category.name.length + 1) : product.name;
const productFor = (categoryKey, index) => menu.find(c => c.key === categoryKey)?.products.find(p => p.index === Number(index));

function announce(text) {
  notice.textContent = text;
  notice.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3500);
}
function refreshKeepingPosition(focusSelector) {
  const position = window.scrollY;
  renderMenu();
  window.scrollTo({ top: position, behavior: 'instant' });
  if (focusSelector) sections.querySelector(focusSelector)?.focus({ preventScroll: true });
}
function renderMenu() {
  const query = search.value.trim().toLocaleLowerCase('ar');
  const filtered = menu.map(category => ({
    ...category,
    products: category.products.filter(product => (product.name + ' ' + product.description).toLocaleLowerCase('ar').includes(query)),
  })).filter(category => category.products.length);
  const offersVisible = renderOffers(query);
  const offersLink = offersVisible ? '<a class="offer-rail-link active" href="#section-offers"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1-4-5-4-5-2 0 1 2 2 5 2Zm0 0c1-4 5-4 5-2 0 1-2 2-5 2Z"/></svg>العروض</a>' : '';
  rail.innerHTML = offersLink + filtered.map((c, index) => `<a href="#section-${esc(c.key)}"${index === 0 && !offersVisible ? ' class="active"' : ''}>${esc(c.name)}</a>`).join('');
  sections.innerHTML = filtered.map(category => `<section class="category" id="section-${esc(category.key)}">
    <div class="category-head">
      ${category.image ? `<img class="category-image" src="${assets + esc(category.image)}" alt="" loading="lazy">` : '<div class="category-fallback" aria-hidden="true">✳</div>'}
      <div class="heading-main"><div class="kicker">من منيو مخبوز</div><h2>${esc(category.name)}</h2><div class="head-line"></div></div>
    </div>
    <div class="rows">${category.products.map(product => {
      const total = previewCounts.get(keyFor(category, product)) || 0;
      const plain = product.variants.length === 0 && product.groups.length === 0;
      const productData = `data-category="${esc(category.key)}" data-index="${product.index}"`;
      return `<article class="item">
        <h3 class="item-name"><button type="button" class="item-title" data-action="details" ${productData}>${esc(shortName(category, product))}</button></h3>
        <span class="price">${product.variants.length ? '<small class="price-from">من</small> ' : ''}${money(minPrice(product))}</span>
        ${plain && total ? `<div class="preview-stepper" role="group" aria-label="كمية ${esc(product.name)} في المعاينة"><button type="button" data-action="minus" ${productData} aria-label="تقليل ${esc(product.name)}">−</button><span>${numberFormat.format(total)}</span><button type="button" data-action="plus" ${productData} aria-label="إضافة ${esc(product.name)} للمعاينة">+</button></div>` : `<button class="open" type="button" data-action="add" ${productData} aria-label="${esc(product.variants.length || product.groups.length ? 'اختيارات ' : 'إضافة ')}${esc(product.name)}">+${total ? `<span class="preview-badge">${numberFormat.format(total)}</span>` : ''}</button>`}
      </article>`;
    }).join('')}</div>
  </section>`).join('');
  document.querySelector('#empty').hidden = filtered.length > 0;
}

function ruleText(group) {
  if (group.max === 1) return 'اختار واحد';
  if (group.min === 0) return `اختار لحد ${numberFormat.format(group.max)}`;
  if (group.min === group.max) return `اختار ${numberFormat.format(group.min)}`;
  return `اختار من ${numberFormat.format(group.min)} إلى ${numberFormat.format(group.max)}`;
}
function selectedVariant() {
  const selected = detail.querySelector('input[name="variant"]:checked');
  return selected ? activeProduct.variants[Number(selected.value)] : null;
}
function currentUnit() {
  const variant = selectedVariant();
  let total = variant ? toMinor(variant.price) : minPrice(activeProduct);
  activeProduct.groups.forEach((group, groupIndex) => {
    detail.querySelectorAll(`input[name="group-${groupIndex}"]:checked`).forEach(input => { total += toMinor(group.options[Number(input.value)].price); });
  });
  return total;
}
function stateOfChoices() {
  const missingSize = activeProduct.variants.length > 0 && !selectedVariant();
  const missingGroups = activeProduct.groups.map((group, index) => ({ group, index, count: detail.querySelectorAll(`input[name="group-${index}"]:checked`).length }))
    .filter(({ group, count }) => count < group.min || count > group.max);
  return { missingSize, missingGroups, valid: !missingSize && missingGroups.length === 0 };
}
function updateDetail() {
  const selection = stateOfChoices();
  detail.querySelector('#detail-price').innerHTML = `${!selectedVariant() && activeProduct.variants.length ? '<small class="detail-from">من </small>' : ''}${money(currentUnit())}`;
  detail.querySelector('#detail-total').innerHTML = money(currentUnit() * BigInt(quantity));
  detail.querySelector('#detail-quantity').textContent = numberFormat.format(quantity);
  detail.querySelector('#detail-minus').disabled = quantity <= 1;
  detail.querySelector('#detail-plus').disabled = quantity >= 99;
  detail.querySelector('#preview-confirm').setAttribute('aria-disabled', String(!selection.valid));
  activeProduct.groups.forEach((group, index) => {
    if (group.max <= 1) return;
    const inputs = [...detail.querySelectorAll(`input[name="group-${index}"]`)];
    const maxed = inputs.filter(input => input.checked).length >= group.max;
    inputs.forEach(input => { input.disabled = maxed && !input.checked; });
  });
}
function openDetails(category, product) {
  activeProduct = product;
  activeCategory = category;
  quantity = 1;
  const defaultIndex = product.variants.findIndex(variant => variant.isDefault);
  const picture = product.image ? `<div class="detail-photo"><img src="${assets + esc(product.image)}" alt=""><span>${esc(category.name)}</span></div>` : `<div class="detail-brand" aria-hidden="true"><span>✳</span></div>`;
  const variants = product.variants.length ? `<fieldset class="detail-group" id="detail-sizes" aria-label="الحجم"><div class="detail-group-heading"><div><h3>الحجم</h3><p>اختار واحد</p></div><span class="required-pill">مطلوب</span></div><div class="detail-options">${product.variants.map((v, i) => `<label class="detail-option"><input type="radio" name="variant" value="${i}"${i === defaultIndex ? ' checked' : ''}><span class="option-mark" aria-hidden="true"></span><span class="option-name">${esc(v.name)}</span><span class="option-price">${money(toMinor(v.price))}</span></label>`).join('')}</div></fieldset>` : '';
  const groups = product.groups.map((group, index) => `<fieldset class="detail-group" id="detail-group-${index}" aria-label="${esc(group.name)}"><div class="detail-group-heading"><div><h3>${esc(group.name)}</h3><p>${esc(ruleText(group))}${group.helper ? ` · ${esc(group.helper)}` : ''}</p></div><span class="${group.min > 0 ? 'required-pill' : 'optional-pill'}">${group.min > 0 ? 'مطلوب' : 'اختياري'}</span></div><div class="detail-options">${group.options.map((option, optionIndex) => `<label class="detail-option"><input type="${group.max === 1 ? 'radio' : 'checkbox'}" name="group-${index}" value="${optionIndex}"><span class="option-mark" aria-hidden="true"></span><span class="option-name">${esc(option.name)}</span>${toMinor(option.price) > 0n ? `<span class="option-price">+ ${money(toMinor(option.price))}</span>` : ''}</label>`).join('')}</div></fieldset>`).join('');
  detail.innerHTML = `<div class="detail-shell"><header class="detail-top"><span>من منيو مخبوز</span><button type="button" class="detail-close" aria-label="إغلاق">×</button></header><div class="detail-content">${picture}<div class="detail-title-row"><h2 id="detail-title">${esc(product.name)}</h2><span id="detail-price" class="detail-main-price"></span></div>${product.description ? `<p class="detail-description">${esc(product.description)}</p>` : ''}${variants}${groups}</div><footer class="detail-footer"><p class="detail-disclaimer">معاينة للتصميم · لن يُرسل طلب</p><p id="detail-error" class="detail-error" role="alert" hidden></p><div class="detail-actions"><div class="detail-stepper" role="group" aria-label="الكمية"><button id="detail-minus" type="button" aria-label="تقليل الكمية">−</button><span id="detail-quantity" aria-live="polite"></span><button id="detail-plus" type="button" aria-label="زيادة الكمية">+</button></div><button id="preview-confirm" type="button" aria-disabled="true"><span>أضف للمعاينة</span><strong id="detail-total"></strong></button></div></footer></div>`;
  updateDetail();
  detail.showModal();
}

search.addEventListener('input', renderMenu);
sections.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const category = menu.find(c => c.key === button.dataset.category);
  const product = productFor(button.dataset.category, button.dataset.index);
  if (!category || !product) return;
  const key = keyFor(category, product);
  if (button.dataset.action === 'details' || (button.dataset.action === 'add' && (product.variants.length || product.groups.length))) {
    openDetails(category, product);
    return;
  }
  const count = previewCounts.get(key) || 0;
  const next = button.dataset.action === 'minus' ? Math.max(0, count - 1) : Math.min(99, count + 1);
  previewCounts.set(key, next);
  announce(next ? `${product.name} · إضافة للمعاينة فقط` : `تمت إزالة ${product.name} من المعاينة`);
  const wantedAction = button.dataset.action === 'minus' && next === 0 ? 'add' : (button.dataset.action === 'add' ? 'plus' : button.dataset.action);
  refreshKeepingPosition(`[data-action="${wantedAction}"][data-category="${category.key}"][data-index="${product.index}"]`);
});
detail.addEventListener('change', () => {
  detail.querySelector('#detail-error').hidden = true;
  updateDetail();
});
detail.addEventListener('click', event => {
  if (event.target.closest('.detail-close')) { detail.close(); return; }
  if (event.target.closest('#detail-minus')) { quantity = Math.max(1, quantity - 1); updateDetail(); return; }
  if (event.target.closest('#detail-plus')) { quantity = Math.min(99, quantity + 1); updateDetail(); return; }
  if (!event.target.closest('#preview-confirm')) return;
  const state = stateOfChoices();
  if (!state.valid) {
    const error = detail.querySelector('#detail-error');
    error.textContent = state.missingSize ? 'اختار الحجم الأول' : `كمّل اختيار ${state.missingGroups[0].group.name}`;
    error.hidden = false;
    const field = state.missingSize ? detail.querySelector('#detail-sizes') : detail.querySelector(`#detail-group-${state.missingGroups[0].index}`);
    field?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  const key = keyFor(activeCategory, activeProduct);
  previewCounts.set(key, (previewCounts.get(key) || 0) + quantity);
  announce(`${activeProduct.name} · إضافة للمعاينة فقط`);
  const focusAction = activeProduct.variants.length || activeProduct.groups.length ? 'add' : 'plus';
  const focusSelector = `[data-action="${focusAction}"][data-category="${activeCategory.key}"][data-index="${activeProduct.index}"]`;
  detail.close();
  refreshKeepingPosition(focusSelector);
});
window.addEventListener('scroll', () => {
  const visible = [...(document.querySelector('#section-offers').hidden ? [] : [document.querySelector('#section-offers')]), ...sections.querySelectorAll('.category')];
  let current = visible[0];
  for (const section of visible) if (section.getBoundingClientRect().top <= 140) current = section;
  rail.querySelectorAll('a').forEach(link => link.classList.toggle('active', !!current && link.getAttribute('href') === '#' + current.id));
}, { passive: true });
renderMenu();
if (location.hash === '#section-offers' && !offerSection.hidden) {
  requestAnimationFrame(() => offerSection.scrollIntoView({ behavior: 'instant', block: 'start' }));
}
