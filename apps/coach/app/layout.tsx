import type { ReactNode } from "react";

export const metadata = {
  title: "Inigo coach",
  description: "Inigo backend: WhatsApp bridge to the coach managed agent (admin UI to come)."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
