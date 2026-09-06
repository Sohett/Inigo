import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Inigo coach",
  description: "Inigo backend: WhatsApp bridge to the coach managed agent, plus the admin."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
