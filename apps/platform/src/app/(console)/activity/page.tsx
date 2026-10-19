import Link from "next/link";
import { actionLabel, describeChange } from "@/components/activity";
import { Alert, Card, EmptyState, PageHeader, TableWrap, Th } from "@/components/ui";
import { platformServerGet } from "@/lib/api/server-fetch";
import type { AuditEntry } from "@/lib/api/platform";
import { getI18n } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/translate";

export default async function ActivityPage() {
  const { t, locale } = await getI18n();
  const fmt = createFormatters(locale);
  const result = await platformServerGet<AuditEntry[]>("/audit?limit=100");

  return (
    <>
      <PageHeader title={t("activity.title")} description={t("activity.subtitle")} />
      {!result.ok ? (
        <Alert tone="danger">{t("common.error")}</Alert>
      ) : result.data.length === 0 ? (
        <Card>
          <EmptyState title={t("overview.noActivity")} />
        </Card>
      ) : (
        <Card>
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>{t("activity.col.when")}</Th>
                  <Th>{t("activity.col.who")}</Th>
                  <Th>{t("activity.col.action")}</Th>
                  <Th>{t("activity.col.restaurant")}</Th>
                  <Th>{t("activity.col.details")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-2/60">
                    <td className="tabular whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt.dateTime(entry.createdAt)}</td>
                    <td className="px-4 py-3">
                      <bdi dir="ltr">{entry.adminEmail}</bdi>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{actionLabel(entry.action, t)}</td>
                    <td className="px-4 py-3">
                      {entry.restaurantId ? (
                        <Link href={`/restaurants/${entry.restaurantId}`} className="text-primary-text hover:underline">
                          <bdi>{entry.restaurantName ?? entry.restaurantId}</bdi>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{describeChange(entry, t) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
