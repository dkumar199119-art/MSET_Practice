/**
 * File storage adapter. Uses Supabase Storage when SUPABASE_SERVICE_ROLE_KEY and
 * NEXT_PUBLIC_SUPABASE_URL are configured (bucket "evidence"); otherwise the
 * local ./storage directory (development).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BUCKET = "evidence";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

export async function putObject(prefix: string, fileName: string, data: Buffer, contentType: string) {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
  const key = `${prefix}/${randomUUID()}-${safe}`;
  const sha256 = createHash("sha256").update(data).digest("hex");
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sb.key}`, "Content-Type": contentType, "x-upsert": "false" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
    return { storagePath: `supabase:${key}`, sha256 };
  }
  const full = path.join(process.cwd(), "storage", key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { storagePath: `local:${key}`, sha256 };
}

export async function getObject(storagePath: string): Promise<Buffer> {
  const [kind, key] = [storagePath.slice(0, storagePath.indexOf(":")), storagePath.slice(storagePath.indexOf(":") + 1)];
  if (key.includes("..")) throw new Error("Invalid storage path");
  if (kind === "supabase") {
    const sb = supabase();
    if (!sb) throw new Error("Supabase storage is not configured");
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${key}`, { headers: { Authorization: `Bearer ${sb.key}` } });
    if (!res.ok) throw new Error(`Storage download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(path.join(process.cwd(), "storage", key));
}
