import { restaurantMenuUrl } from './menu-link';

describe('restaurant menu URL', () => {
  it('uses a local or production subdomain when explicitly enabled', () => {
    expect(
      restaurantMenuUrl(
        'makhboz',
        'http://localhost:3000',
        'http://localhost:3000',
      ),
    ).toBe('http://makhboz.localhost:3000');
    expect(
      restaurantMenuUrl(
        'makhboz',
        'https://menu.example.com',
        'https://waytaapp.com',
      ),
    ).toBe('https://makhboz.waytaapp.com');
  });

  it('retains the existing path until subdomains are configured', () => {
    expect(restaurantMenuUrl('makhboz', 'https://menu.example.com/')).toBe(
      'https://menu.example.com/q/makhboz',
    );
  });
});
