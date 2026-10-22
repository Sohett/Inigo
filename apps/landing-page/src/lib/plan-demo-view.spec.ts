import { describe, expect, it } from "vitest";
import { escapeHtml, renderMessages } from "@/lib/plan-demo-view";

describe("escapeHtml", () => {
  it("neutralises markup characters", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
  });
});

describe("renderMessages", () => {
  it("escapes message text and skips empty attachments", () => {
    const html = renderMessages([{ side: "out", text: "<script>", time: "07:12", attachments: { title: "X", items: [] } }]);
    expect(html).toBe('<div class="bub out">&lt;script&gt;<time>07:12</time></div>');
  });
});
