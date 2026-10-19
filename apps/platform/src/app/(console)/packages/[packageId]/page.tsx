import { PackageEditor } from "../PackageEditor";

export default async function PackagePage({ params }: PageProps<"/packages/[packageId]">) {
  const { packageId } = await params;
  return <PackageEditor packageId={packageId} />;
}
