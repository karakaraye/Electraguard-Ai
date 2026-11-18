import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "ElectraGuard AI",
  description: "Election observation and incident documentation",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">ElectraGuard AI</header>
        <main>{children}</main>
      </body>
    </html>
  );
}
