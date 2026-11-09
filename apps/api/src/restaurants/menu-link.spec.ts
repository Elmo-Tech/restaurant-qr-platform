import { restaurantMenuUrl } from './menu-link';

describe('restaurant menu URL', () => {
  it('uses the configured restaurant base domain', () => {
    expect(
      restaurantMenuUrl('makhboz', 'https://menu.example.com', 'waytaapp.com'),
    ).toBe('https://makhboz.waytaapp.com/');
  });

  it('retains the existing path until subdomains are configured', () => {
    expect(restaurantMenuUrl('makhboz', 'https://menu.example.com/')).toBe(
      'https://menu.example.com/q/makhboz',
    );
  });
  it('never generates a tenant host for reserved or invalid slugs', () => {
    expect(
      restaurantMenuUrl('control', 'https://waytaapp.com', 'waytaapp.com'),
    ).toBe('https://waytaapp.com/q/control');
    expect(
      restaurantMenuUrl('bad.slug', 'https://waytaapp.com', 'waytaapp.com'),
    ).toBe('https://waytaapp.com/q/bad.slug');
  });
});
