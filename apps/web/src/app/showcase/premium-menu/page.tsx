import type { Metadata } from "next";

import { PremiumMenuShowcase } from "./PremiumMenuShowcase";

export const metadata: Metadata = {
  title: "elmo cafe — Premium menu concept",
  description: "A premium Wayta menu concept built around the platform's real menu structure.",
};

export default function PremiumMenuShowcasePage() {
  return <PremiumMenuShowcase />;
}
