"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import { getOnboardingDuplicates, type OnboardingDuplicates } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { OnboardingStatusBadge } from "../shared";

/**
 * Possible duplicates of the customer in step 1. WARNINGS ONLY: nothing is attached or merged, and an
 * owner e-mail that already has an account will be refused at provisioning (DEC-047).
 * Refreshed after every save (`revision`).
 */
export function DuplicatesPanel({ caseId, revision }: { caseId: string; revision: number }) {
  const { t } = useI18n();
  const [data, setData] = useState<OnboardingDuplicates | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOnboardingDuplicates(caseId)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch(() => undefined); // warnings are a help, never a blocker
    return () => {
      cancelled = true;
    };
  }, [caseId, revision]);

  if (
    !data ||
    (!data.ownerEmailInUse && data.similarRestaurants.length === 0 && data.otherOpenCases.length === 0 && data.matchingLeads.length === 0)
  ) {
    return null;
  }

  return (
    <Card className="border-warning/40">
      <CardHeader title={t("onboarding.dup.title")} description={t("onboarding.dup.hint")} />
      <div className="space-y-4 p-5 text-sm" role="status">
        {data.ownerEmailInUse ? (
          <section>
            <h3 className="font-medium text-warning">{t("onboarding.dup.emailInUse")}</h3>
            {data.ownerRestaurants.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted-foreground">
                {data.ownerRestaurants.map((restaurant) => (
                  <li key={restaurant.id}>
                    <Link href={`/restaurants/${restaurant.id}`} className="text-primary-text hover:underline">
                      <bdi>{restaurant.name}</bdi>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {data.similarRestaurants.length > 0 ? (
          <section>
            <h3 className="font-medium text-foreground">{t("onboarding.dup.similar")}</h3>
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted-foreground">
              {data.similarRestaurants.map((restaurant) => (
                <li key={restaurant.id}>
                  <Link href={`/restaurants/${restaurant.id}`} className="text-primary-text hover:underline">
                    <bdi>{restaurant.name}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {data.otherOpenCases.length > 0 ? (
          <section>
            <h3 className="font-medium text-foreground">{t("onboarding.dup.cases")}</h3>
            <ul className="mt-1 space-y-1">
              {data.otherOpenCases.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/onboarding/${item.id}`} className="text-primary-text hover:underline">
                    <bdi>{item.restaurantName ?? t("onboarding.unnamed")}</bdi>
                  </Link>
                  <OnboardingStatusBadge status={item.status} t={t} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {data.matchingLeads.length > 0 ? (
          <section>
            <h3 className="font-medium text-foreground">{t("onboarding.dup.leads")}</h3>
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted-foreground">
              {data.matchingLeads.map((lead) => (
                <li key={lead.id}>
                  <Link href="/leads" className="text-primary-text hover:underline">
                    <bdi>{lead.name}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
