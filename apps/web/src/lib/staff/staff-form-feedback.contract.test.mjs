import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const contact = read('../../app/staff/restaurants/[restaurantId]/settings/profile/ContactCard.tsx');
const profile = read('../../app/staff/restaurants/[restaurantId]/settings/profile/ProfileWorkspace.tsx');
const toast = read('../../components/staff/StaffFeedbackToast.tsx');
const field = read('../../components/ui/FormField.tsx');

test('contact save has both persistent inline errors and visible viewport feedback', () => {
  assert.match(contact, /StaffFeedbackToast/);
  assert.match(contact, /focusInvalidFormField\(formRef\.current, `contact-\$\{field\}`\)/);
  assert.match(contact, /setFieldErrors\(\{ \[field\]: fieldError \}\)/);
  assert.match(contact, /aria-describedby=/);
  assert.match(contact, /ref=\{formRef\}/);
  assert.match(contact, /settingsApi\.updateContact/);
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
  assert.match(field, /id=\{`${htmlFor\}-error`\}/);
  assert.match(field, /role="alert"/);
});
