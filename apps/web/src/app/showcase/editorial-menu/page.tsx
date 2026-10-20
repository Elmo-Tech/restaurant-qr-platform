import type { Metadata } from "next";

import { EditorialMenuShowcase } from "./EditorialMenuShowcase";

export const metadata: Metadata = {
  title: "elmo cafe — Editorial menu concept",
  description: "A responsive editorial QR menu concept for the Restaurant QR Platform.",
};

export default function EditorialMenuShowcasePage() {
  return <EditorialMenuShowcase />;
}
