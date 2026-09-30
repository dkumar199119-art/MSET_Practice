import { migrate } from "../../scripts/migrate";
import { seed } from "../../scripts/seed";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://obe_owner:obe_owner@localhost:5432/obe_e2e";
  await migrate(url, { reset: true, quiet: true });
  await seed(url, { quiet: true, students: 12 });
}
