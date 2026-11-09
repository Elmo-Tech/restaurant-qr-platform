import assert from 'node:assert/strict';
import test from 'node:test';
import { restaurantSlugFromHost, genericMenuUrl, validRestaurantHostSlug } from './restaurant-subdomains.ts';

test('accepts exactly one safe restaurant subdomain', () => {
  assert.equal(restaurantSlugFromHost('Pizza-House.WAYTAAPP.COM:443', 'waytaapp.com'), 'pizza-house');
  assert.equal(restaurantSlugFromHost('pizza-house.waytaapp.com', 'waytaapp.com'), 'pizza-house');
  for (const host of ['waytaapp.com', 'control.waytaapp.com', 'www.waytaapp.com',
    'a.b.waytaapp.com', 'pizza-house.waytaapp.com.evil.com', 'ab.waytaapp.com',
    '-bad.waytaapp.com', 'mail.waytaapp.com', 'pizza--house.waytaapp.com']) {
    assert.equal(restaurantSlugFromHost(host, 'waytaapp.com'), null, host);
  }
});

test('generic menus get a subdomain, table code continues on /q/{code}', () => {
  assert.equal(genericMenuUrl('https://waytaapp.com', 'pizza-house', 'waytaapp.com'),
    'https://pizza-house.waytaapp.com/');
  const tableCode = 'A'.repeat(43);
  assert.equal(validRestaurantHostSlug(tableCode), false);
  assert.equal(genericMenuUrl('https://waytaapp.com', tableCode, 'waytaapp.com'),
    `https://waytaapp.com/q/${tableCode}`);
  assert.equal(genericMenuUrl('https://dev.example', 'pizza-house', undefined),
    'https://dev.example/q/pizza-house');
});
