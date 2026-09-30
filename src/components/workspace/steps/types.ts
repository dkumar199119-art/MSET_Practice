import type { CurrentUser } from "@/lib/rbac";
import type { getWorkspace } from "@/lib/services/workspace";

export interface StepProps {
  offeringId: string;
  user: CurrentUser;
  ws: Awaited<ReturnType<typeof getWorkspace>>;
  readOnly: boolean;
}
