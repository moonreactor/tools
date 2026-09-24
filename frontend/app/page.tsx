import { ToolCard } from "@/components/ToolCard";
import { fetchTools } from "@/lib/api";
import { Sparkles } from "lucide-react";

export default async function HomePage() {
  let tools = [];
  try {
    tools = await fetchTools();
  } catch {
    tools = [
      {
        id: "image-converter",
        name: "Conversor de imágenes",
        description: "Convierte archivos HEIC/HEIF a JPG o PNG",
        path: "/tools/image-converter",
        icon: "image",
      },
      {
        id: "images-to-pdf",
        name: "Imágenes a PDF",
        description: "Armá un PDF con varias imágenes, una por página",
        path: "/tools/images-to-pdf",
        icon: "file-image",
      },
      {
        id: "youtube-downloader",
        name: "Descargador YouTube",
        description: "Descargá video, audio o transcripción desde un link",
        path: "/tools/youtube-downloader",
        icon: "youtube",
      },
      {
        id: "gif-to-jpg",
        name: "GIF a JPG (carpeta)",
        description: "Recorre una carpeta, convierte .gif a .jpg y reemplaza los originales",
        path: "/tools/gif-to-jpg",
        icon: "folder-image",
      },
    ];
  }

  return (
    <div className="p-8">
      <div className="mb-10">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium">Moonreactor Tools</span>
        </div>
        <h1 className="mb-3 text-3xl font-bold tracking-tight">
          Hub de herramientas
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Seleccioná una herramienta del menú lateral o desde las tarjetas de abajo.
          Vamos agregando más utilidades con el tiempo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
