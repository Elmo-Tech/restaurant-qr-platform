import { redirect } from "next/navigation";

/** No standalone landing page exists yet -- the Staff area owns its own deterministic auth redirect (Section 7). */
export default function Home() {
  redirect("/staff");
}
