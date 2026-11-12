import type { PublicMenuModifierGroup } from './types';

/**
 * One effective Modifier view across every Guest template, Cart and Order UI.
 * No size override means inherit the Product's existing group/option rules.
 * The Backend applies the identical rules AGAIN while pricing and accepting.
 */
export function modifierGroupsForSize(
  groups: PublicMenuModifierGroup[],
  variantId: string | null,
  productHasSizes: boolean,
): PublicMenuModifierGroup[] {
  // Do not invite choosing add-ons until the required size is known.
  if (productHasSizes && !variantId) return [];
  if (!variantId) return groups;
  return groups.flatMap(group => {
    if (group.disabledVariantIds?.includes(variantId)) return [];
    const options = group.options.flatMap(option => {
      const rule = option.sizeOverrides?.find(setting => setting.variantId === variantId);
      if (rule?.enabled === false) return [];
      return [{
        ...option,
        priceAdjustment: rule?.priceAdjustment ?? option.priceAdjustment,
      }];
    });
    // Optional groups with no valid options are unnecessary; required groups
    // stay visible as invalid rather than silently bypassing requirements.
    return options.length === 0 && group.minimumSelections === 0
      ? [] : [{ ...group, options }];
  });
}

/** Preserve still-valid choices when switching size, but drop hidden options. */
export function allowedModifierSelection(
  groups: PublicMenuModifierGroup[],
  selectedByGroup: Record<string, string[]>,
): Record<string, string[]> {
  const updated: Record<string, string[]> = {};
  for (const group of groups) {
    const allowed = new Set(group.options.map(option => option.id));
    updated[group.id] = (selectedByGroup[group.id] ?? [])
      .filter(id => allowed.has(id))
      .slice(0, group.maximumSelections);
  }
  return updated;
}
