import { BrandLoader } from '../../../../components/brand/BrandLoader';

/** Shown inside the workspace shell while a section (Dashboard, Orders, Menu...) is being prepared. */
export default function RestaurantSectionLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrandLoader />
    </div>
  );
}
