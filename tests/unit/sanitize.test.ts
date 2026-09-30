import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("keeps simple formatting and strips attributes", () => {
    expect(sanitizeHtml('<p class="x" onclick="alert(1)">Hi <b>there</b></p>')).toBe("<p>Hi <b>there</b></p>");
  });
  it("removes scripts, handlers and unknown tags", () => {
    expect(sanitizeHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:x">link</a>')).toBe("link");
    expect(sanitizeHtml("<font><img src=x onerror=alert(1)></font>ok")).toBe("ok");
    expect(sanitizeHtml("<p/onmouseover=alert(1)>x</p>")).toBe("<p>x</p>");
    expect(sanitizeHtml("a &lt; b")).toBe("a &lt; b");
    expect(sanitizeHtml("1 < 2")).toBe("1 &lt; 2");
  });
});
