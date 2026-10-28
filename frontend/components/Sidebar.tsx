"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, Crop, FileImage, FolderOpen, Home, Image, Wrench, Youtube } from "lucide-react";
import clsx from "clsx";

const navItems = [
  { href: "/tools/optimize-for-web", label: "Optimizar para web", icon: FolderOpen },
  { href: "/tools/git-history", label: "Historial Git", icon: GitBranch },
  { href: "/", label: "Inicio", icon: Home },
  { href: "/tools/image-converter", label: "Conversor de imágenes", icon: Image },
  { href: "/tools/image-editor", label: "Editor de imágenes", icon: Crop },
  { href: "/tools/images-to-pdf", label: "Imágenes a PDF", icon: FileImage },
  { href: "/tools/youtube-downloader", label: "YouTube Downloader", icon: Youtube },
  { href: "/tools/gif-to-jpg", label: "GIF a JPG", icon: FolderOpen },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">Tools Hub</h1>
          <p className="text-xs text-muted-foreground">Moonreactor</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Herramientas
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          Más herramientas próximamente
        </p>
      </div>
    </aside>
  );
}
