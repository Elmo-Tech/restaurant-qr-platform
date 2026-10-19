import { RestaurantDetailView } from "./RestaurantDetailView";

export default async function RestaurantDetailPage({ params }: PageProps<"/restaurants/[restaurantId]">) {
  const { restaurantId } = await params;
  return <RestaurantDetailView restaurantId={restaurantId} />;
}
