import Image from "next/image";
import { GitBranch, Crop, FileImage, FolderOpen, Image as ImageIcon, Wrench, Youtube } from "lucide-react";
import type { Tool } from "@/lib/api";

const iconMap: Record<string, React.ReactNode> = {
  "git-branch": <GitBranch className="h-4 w-4" />,
  image: <ImageIcon className="h-4 w-4" />,
  crop: <Crop className="h-4 w-4" />,
  "file-image": <FileImage className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
  "folder-image": <FolderOpen className="h-4 w-4" />,
  default: <Wrench className="h-4 w-4" />,
};

const toolImages: Record<string, string> = {
  "optimize-for-web": "/tools/tool-folder-to-webp.png",
  "git-history": "/tools/tool-git-historial.png",
  "image-converter": "/tools/tool-image-converter.png",
  "images-to-pdf": "/tools/tool-images-to-pdf.png",
  "youtube-downloader": "/tools/tool-youtube-downloader.png",
  "gif-to-jpg": "/tools/tool-gif-to-jpg.png",
  "image-editor": "/tools/tool-image-editor.png",
};

export function ToolIcon({ icon }: { icon: string }) {
  return <>{iconMap[icon] || iconMap.default}</>;
}

export function ToolCard({ tool }: { tool: Tool }) {
  const imageSrc = toolImages[tool.id];

  return (
    <a
      href={tool.path}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
    >
      {imageSrc ? (
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-primary/10 text-primary">
          <ToolIcon icon={tool.icon} />
        </div>
      )}

      <div className="p-5">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <ToolIcon icon={tool.icon} />
          <h3 className="text-lg font-semibold text-card-foreground">{tool.name}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      </div>
    </a>
  );
}
