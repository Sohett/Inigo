import type { ReactNode } from "react";

export const metadata = {
  title: "Intervals.icu MCP server",
  description: "Remote MCP server exposing Intervals.icu data to managed agents."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
