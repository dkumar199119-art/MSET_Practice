import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { recentNotifications } from "@/lib/services/dashboards";
import { markNotificationsReadAction } from "@/app/actions/misc";
import { Card, CardBody, Empty, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/action";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const user = await requireUser();
  const items = await recentNotifications(user);
  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" actions={items.some((i) => !i.is_read) && <ActionButton variant="secondary" action={markNotificationsReadAction}>Mark all read</ActionButton>} />
      {items.length === 0 ? <Empty icon={<Bell />} title="No notifications" /> : (
        <Card><CardBody className="divide-y divide-line">
          {items.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">{!n.is_read && <span className="size-2 rounded-full bg-violet-600" aria-label="unread" />}{n.title}</div>
                <div className="text-sm text-ink-2">{n.body}</div>
                <div className="text-xs text-muted">{fmtDate(n.created_at)}</div>
              </div>
              {n.link && <Link href={n.link} className="shrink-0 text-sm text-violet-700 hover:underline">Open</Link>}
            </div>
          ))}
        </CardBody></Card>
      )}
    </div>
  );
}
