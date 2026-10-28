import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tools Hub | Moonreactor",
  description: "Herramientas para imágenes, video y desarrollo, en un solo lugar.",
  openGraph: {
    title: "Tools Hub | Moonreactor",
    description: "Herramientas para imágenes, video y desarrollo, en un solo lugar.",
    images: [{ url: "/og-tools-hub.png", width: 1200, height: 630, alt: "Moonreactor Tools Hub: herramientas para imágenes, video y desarrollo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tools Hub | Moonreactor",
    description: "Herramientas para imágenes, video y desarrollo, en un solo lugar.",
    images: ["/og-tools-hub.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="gradient-mesh">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
