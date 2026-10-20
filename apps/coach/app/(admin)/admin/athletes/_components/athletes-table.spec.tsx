// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AthleteRosterEntry } from "@/domain/athleteRoster";

const renders = { count: 0 };

vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    // Called once per render of the table: counting it counts the renders. Read from the real
    // (happy-dom) URL, so the table's own `replaceState` feeds back like it does under Next.
    renders.count += 1;
    return new URLSearchParams(window.location.search);
  }
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

const { AthletesTable } = await import("./athletes-table");

const rows: AthleteRosterEntry[] = [
  {
    id: "a-1",
    displayName: "Thomas",
    phoneNum: "+32470000001",
    whatsappLid: null,
    status: "active",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    plan: { name: "Gran Fondo", status: "active" },
    latestProposition: { weekStart: "2026-10-12", status: "applied" }
  },
  {
    id: "a-2",
    displayName: "Julie",
    phoneNum: null,
    whatsappLid: "123@lid",
    status: "onboarding",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    plan: null,
    latestProposition: null
  }
];

// React only flushes `act` updates when told it runs in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

/** Let the table's queued state updates run, and whatever renders they trigger. */
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

// Each starting URL feeds the table a different `sorting`: the default constant, or one read
// from the URL. Both must keep their reference across renders.
describe.each(["", "?sort=-name", "?status=active&sort=plan"])("AthletesTable at %j", (search) => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/admin/athletes${search}`);
  });

  it("settles after a re-render instead of looping (prod freeze, INI-52)", { timeout: 5000 }, async () => {
    act(() => root.render(<AthletesTable rows={rows} />));
    await settle();

    // A parent re-render with the same rows, as during a navigation to another admin page.
    renders.count = 0;
    act(() => root.render(<AthletesTable rows={rows} />));
    await settle();

    expect(renders.count).toBeLessThan(5);
    expect(container.textContent).toContain("Thomas");
  });

  it("settles while the admin types in the search box, and filters", { timeout: 5000 }, async () => {
    act(() => root.render(<AthletesTable rows={rows} />));
    await settle();

    renders.count = 0;
    const input = container.querySelector("input");
    if (!input) throw new Error("search box not rendered");
    act(() => {
      // React listens to the native setter, not to a plain assignment.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "zzz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();

    expect(renders.count).toBeLessThan(5);
    expect(new URLSearchParams(window.location.search).get("q")).toBe("zzz");
    expect(container.textContent).not.toContain("Thomas");
    expect(container.textContent).toContain("Aucun athlète ne correspond.");
  });
});
