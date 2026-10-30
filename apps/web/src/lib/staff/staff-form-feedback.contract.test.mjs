import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const contact = read('../../app/staff/restaurants/[restaurantId]/settings/profile/ContactCard.tsx');
const profile = read('../../app/staff/restaurants/[restaurantId]/settings/profile/ProfileWorkspace.tsx');
const toast = read('../../components/staff/StaffFeedbackToast.tsx');
const field = read('../../components/ui/FormField.tsx');
const phone = read('../../components/staff/InternationalPhoneField.tsx');

test('contact save has both persistent inline errors and visible viewport feedback', () => {
  assert.match(contact, /StaffFeedbackToast/);
  assert.match(contact, /focusInvalidFormField\(formRef\.current, `contact-\$\{firstInvalid\}`\)/);
  assert.match(contact, /if \(isSaving\) return;/);
  assert.match(contact, /setFieldErrors\(\{ \[field\]: fieldError \}\)/);
  assert.match(contact, /aria-describedby=/);
  assert.match(contact, /ref=\{formRef\}/);
  assert.match(contact, /settingsApi\.updateContact/);
  assert.match(contact, /InternationalPhoneField/);
  assert.match(contact, /normalizePhoneDraft/);
  assert.match(contact, /if \(!phone.edited\) continue;/);
  assert.match(contact, /setPhoneDrafts\(phoneDraftsFromContact\(nextDraft\)\)/);
  assert.match(contact, /input\('hotline', '16512'\)/);
  assert.doesNotMatch(contact, /input\('whatsapp',/);
});

test('profile feedback covers name, image upload and removal while keeping original API calls', () => {
  assert.match(profile, /StaffFeedbackToast/);
  assert.match(profile, /focusInvalidFormField\(nameFormRef\.current, 'restaurant-name'\)/);
  assert.match(profile, /aria-describedby=/);
  for(const operation of ['updateRestaurantProfile', 'uploadRestaurantLogo', 'removeRestaurantLogo',
    'uploadRestaurantCover', 'removeRestaurantCover']) {
    assert.ok(profile.includes('settingsApi.' + operation), 'Missing original operation: ' + operation);
  }
});

test('Toast is keyboard-dismissible, polite for success and persistent validation remains inline', () => {
  assert.match(toast, /role=\{variant === 'error' \? 'alert' : 'status'\}/);
  assert.match(toast, /aria-label=\{t\('common\.close'\)\}/);
  assert.match(toast, /focus-visible:outline-2/);
  assert.match(toast, /safe-area-inset-top/);
  assert.match(toast, /setTimeout/);
  assert.ok(field.includes('id={`${htmlFor}-error`}'));
  assert.match(field, /role="alert"/);
});

test('Phone and WhatsApp render ONE integrated input with a compact country prefix', () => {
  assert.match(phone, /flex h-12 min-w-0 items-center overflow-hidden rounded-xl border/);
  assert.match(phone, /getCountryCallingCode\(value\.country\)/);
  assert.match(phone, /border-e border-input/);
  assert.match(phone, /aria-expanded=\{isOpen\}/);
  assert.match(phone, /aria-haspopup="dialog"/);
  assert.match(phone, /aria-controls=/);
  assert.doesNotMatch(phone, /<Select/); // reject the former two-side-by-side-controls layout
  assert.match(phone, /wayta-common-flags\.svg/);
});

test('Country picker has search, keyboard navigation, mobile presentation and accessibility', () => {
  assert.match(phone, /type="search"/);
  assert.match(phone, /normalizedSearch/);
  assert.match(phone, /onSearchKeyDown/);
  assert.match(phone, /ArrowDown/);
  assert.match(phone, /ArrowUp/);
  assert.match(phone, /role="dialog"/);
  assert.match(phone, /sm:absolute/);
  assert.match(phone, /fixed inset-x-3 bottom-3/);
  assert.match(phone, /prefers-reduced-motion|focus-visible/);
  assert.match(phone, /aria-activedescendant/);
  assert.match(phone, /src=\{\`https:\/\/flagcdn\.com\/w40\//);
});
