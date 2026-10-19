import { BrandLoader } from "@/components/brand/BrandLoader";

/** Shown inside the console frame while a page is being prepared. */
export default function ConsoleLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrandLoader />
    </div>
  );
}
