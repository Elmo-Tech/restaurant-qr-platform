import { redirect } from 'next/navigation';

/** Direct /settings links remain valid and open the new Settings overview. */
export default async function SettingsRootPage({ params }: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  redirect(`/staff/restaurants/${encodeURIComponent(restaurantId)}/settings/overview`);
}
