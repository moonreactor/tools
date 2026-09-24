import { FileImage, FolderOpen, Image, Wrench, Youtube } from "lucide-react";
import type { Tool } from "@/lib/api";

const iconMap: Record<string, React.ReactNode> = {
  image: <Image className="h-5 w-5" />,
  "file-image": <FileImage className="h-5 w-5" />,
  youtube: <Youtube className="h-5 w-5" />,
  "folder-image": <FolderOpen className="h-5 w-5" />,
  default: <Wrench className="h-5 w-5" />,
};

export function ToolIcon({ icon }: { icon: string }) {
  return <>{iconMap[icon] || iconMap.default}</>;
}

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <a
      href={tool.path}
      className="group block rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        <ToolIcon icon={tool.icon} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-card-foreground">{tool.name}</h3>
      <p className="text-sm text-muted-foreground">{tool.description}</p>
    </a>
  );
}
