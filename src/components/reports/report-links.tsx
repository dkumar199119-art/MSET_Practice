import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function ReportLinks({ query }: { query: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["PDF", "XLSX", "CSV"] as const).map((f) => (
        <a key={f} className={buttonVariants({ size: "sm", variant: f === "PDF" ? "default" : "secondary" })} href={`/api/reports?${new URLSearchParams({ ...query, format: f })}`}>
          <Download /> {f === "XLSX" ? "Excel" : f}
        </a>
      ))}
    </div>
  );
}
