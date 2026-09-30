"use client";
import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Heading3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";

/** Minimal rich-text editor (bold, italic, headings, lists). Output is sanitised HTML. */
export function RichText({ value, onChange, readOnly, placeholder }: { value: string; onChange: (html: string) => void; readOnly?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = sanitize(value);
  }, [value]);
  const cmd = (c: string, arg?: string) => {
    document.execCommand(c, false, arg);
    if (ref.current) onChange(sanitize(ref.current.innerHTML));
  };
  return (
    <div className={cn("rounded-xl border border-lavender-200 bg-white/85", readOnly && "bg-lavender-50/50")}>
      {!readOnly && (
        <div className="flex gap-1 border-b border-line px-2 py-1">
          {[
            [Bold, "bold", "Bold"], [Italic, "italic", "Italic"], [Heading3, "formatBlock", "Heading"], [List, "insertUnorderedList", "Bullets"], [ListOrdered, "insertOrderedList", "Numbered"],
          ].map(([Icon, c, label]) => {
            const I = Icon as typeof Bold;
            return (
              <button key={label as string} type="button" aria-label={label as string} className="rounded-md p-1.5 text-ink-2 hover:bg-lavender-100"
                onMouseDown={(e) => { e.preventDefault(); cmd(c as string, c === "formatBlock" ? "h3" : undefined); }}>
                <I className="size-4" />
              </button>
            );
          })}
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning role="textbox" aria-multiline aria-label={placeholder}
        data-placeholder={placeholder}
        className="prose-lite min-h-28 px-3 py-2 text-sm leading-relaxed outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)]"
        onInput={(e) => onChange(sanitize((e.target as HTMLDivElement).innerHTML))} />
    </div>
  );
}

/** Client-side clean-up for display; the server re-sanitises with sanitizeHtml before saving. */
export const sanitize = sanitizeHtml;
