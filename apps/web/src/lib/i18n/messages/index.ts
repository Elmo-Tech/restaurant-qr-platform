import { commonMessages } from './common';
import { errorMessages } from './errors';
import { menuMessages } from './menu';
import { menuStructureMessages } from './menuStructure';
import { ordersMessages } from './orders';
import { presetsMessages } from './presets';
import { productMessages } from './product';
import { settingsMessages } from './settings';
import { tablesMessages } from './tables';

/**
 * FT-10A: the single merged Staff UI dictionary. Add a domain by importing its
 * `defineMessages` module and spreading it into BOTH blocks below.
 * `MessageKey` is derived from the English block, so `t('typo')` fails to
 * compile.
 */
const en = {
  ...commonMessages.en,
  ...errorMessages.en,
  ...menuMessages.en,
  ...menuStructureMessages.en,
  ...ordersMessages.en,
  ...presetsMessages.en,
  ...productMessages.en,
  ...settingsMessages.en,
  ...tablesMessages.en,
};

const ar = {
  ...commonMessages.ar,
  ...errorMessages.ar,
  ...menuMessages.ar,
  ...menuStructureMessages.ar,
  ...ordersMessages.ar,
  ...presetsMessages.ar,
  ...productMessages.ar,
  ...settingsMessages.ar,
  ...tablesMessages.ar,
};

export const messages = { en, ar } as const;

export type MessageKey = keyof typeof en;

/** The base of a countable phrase (`x.items` for `x.items.one` / `x.items.other`). */
export type PluralBase = {
  [K in MessageKey]: K extends `${infer Base}.other` ? Base : never;
}[MessageKey];
