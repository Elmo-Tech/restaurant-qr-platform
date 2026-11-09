import assert from "node:assert/strict";
import { test } from "node:test";
import { menuUrl } from "./menu-url.ts";
import { restaurantSlugFromHost, shareMenuUrl } from "./subdomain-host.ts";

test("restaurant slugs use the configured subdomain", () => {
  assert.equal(
    menuUrl("http://localhost:3000", "makhboz", "http://localhost:3000"),
    "http://makhboz.localhost:3000",
  );
  assert.equal(
    menuUrl("https://menu.example.com", "makhboz", "https://waytaapp.com"),
    "https://makhboz.waytaapp.com",
  );
});

test("host recognition rejects unrelated, nested, reserved and malformed hosts", () => {
  assert.equal(restaurantSlugFromHost("Makhboz.localhost:3000"), "makhboz");
  assert.equal(restaurantSlugFromHost("makhboz.waytaapp.com"), "makhboz");
  for (const host of [
    "control.waytaapp.com",
    "www.waytaapp.com",
    "makhboz.waytaapp.com.evil.test",
    "one.two.waytaapp.com",
    "-bad.waytaapp.com",
    "localhost:3000",
  ]) {
    assert.equal(restaurantSlugFromHost(host), null);
  }
});

test("opaque table and legacy codes keep their stable path", () => {
  const code = "A".repeat(43);
  assert.equal(
    menuUrl("https://menu.example.com", code, "https://waytaapp.com"),
    `https://menu.example.com/q/${code}`,
  );
  assert.equal(
    menuUrl("https://menu.example.com", "makhboz"),
    "https://menu.example.com/q/makhboz",
  );
});

test("sharing from a former restaurant host uses its current slug", () => {
  assert.equal(
    shareMenuUrl("http://old.localhost:3000", "makhboz"),
    "http://makhboz.localhost:3000",
  );
  assert.equal(
    shareMenuUrl("https://menu.example.com", "makhboz"),
    "https://menu.example.com/q/makhboz",
  );
});
