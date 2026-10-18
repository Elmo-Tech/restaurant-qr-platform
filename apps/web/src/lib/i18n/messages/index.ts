import { accountMessages } from './account';
import { announcementsMessages } from './announcements';
import { branchesMessages } from './branches';
import { commonMessages } from './common';
import { contactMessages } from './contact';
import { dashboardMessages } from './dashboard';
import { designMessages } from './design';
import { entitlementsMessages } from './entitlements';
import { hoursMessages } from './hours';
import { suggestionsMessages } from './suggestions';
import { kitchenMessages } from './kitchen';
import { opsMessages } from './ops';
import { errorMessages } from './errors';
import { menuImportMessages } from './menuImport';
import { menuMessages } from './menu';
import { menuStructureMessages } from './menuStructure';
import { ordersMessages } from './orders';
import { presetsMessages } from './presets';
import { productMessages } from './product';
import { profileMessages } from './profile';
import { rolesMessages } from './roles';
import { sessionsMessages } from './sessions';
import { settingsMessages } from './settings';
import { staffMessages } from './staff';
import { tablesMessages } from './tables';
import { variantsMessages } from './variants';

/**
 * FT-10A: the single merged Staff UI dictionary. Add a domain by importing its
 * `defineMessages` module and spreading it into BOTH blocks below.
 * `MessageKey` is derived from the English block, so `t('typo')` fails to
 * compile.
 */
const en = {
  ...accountMessages.en,
  ...announcementsMessages.en,
  ...branchesMessages.en,
  ...commonMessages.en,
  ...contactMessages.en,
  ...dashboardMessages.en,
  ...designMessages.en,
  ...entitlementsMessages.en,
  ...hoursMessages.en,
  ...suggestionsMessages.en,
  ...kitchenMessages.en,
  ...opsMessages.en,
  ...errorMessages.en,
  ...menuImportMessages.en,
  ...menuMessages.en,
  ...menuStructureMessages.en,
  ...ordersMessages.en,
  ...presetsMessages.en,
  ...productMessages.en,
  ...profileMessages.en,
  ...rolesMessages.en,
  ...sessionsMessages.en,
  ...settingsMessages.en,
  ...staffMessages.en,
  ...tablesMessages.en,
  ...variantsMessages.en,
};

const ar = {
  ...accountMessages.ar,
  ...announcementsMessages.ar,
  ...branchesMessages.ar,
  ...commonMessages.ar,
  ...contactMessages.ar,
  ...dashboardMessages.ar,
  ...designMessages.ar,
  ...entitlementsMessages.ar,
  ...hoursMessages.ar,
  ...suggestionsMessages.ar,
  ...kitchenMessages.ar,
  ...opsMessages.ar,
  ...errorMessages.ar,
  ...menuImportMessages.ar,
  ...menuMessages.ar,
  ...menuStructureMessages.ar,
  ...ordersMessages.ar,
  ...presetsMessages.ar,
  ...productMessages.ar,
  ...profileMessages.ar,
  ...rolesMessages.ar,
  ...sessionsMessages.ar,
  ...settingsMessages.ar,
  ...staffMessages.ar,
  ...tablesMessages.ar,
  ...variantsMessages.ar,
};

export const messages = { en, ar } as const;

export type MessageKey = keyof typeof en;

/** The base of a countable phrase (`x.items` for `x.items.one` / `x.items.other`). */
export type PluralBase = {
  [K in MessageKey]: K extends `${infer Base}.other` ? Base : never;
}[MessageKey];
