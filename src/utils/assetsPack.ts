import { zipSync } from "fflate";
import { IMAGE_SLOTS } from "@/services/AppearanceService";

const README = `Wiki Assets Pack

Replace these placeholders with your own art, keeping the file names and sizes:

BANNER.png       1920 x 300    The band behind the wiki's name at the top of every page.
BACKGROUND.png   1920 x 1080   Fixed behind the whole wiki while pages scroll.
WORDMARK.png     500 x 130     Your wiki's logo, shown in place of its name at half size. Use a transparent background.
ICON.png         256 x 256     The wiki's icon, shown beside its name and in the wiki switcher.

PNG, JPG, WebP, and GIF all work. Delete any placeholder you don't replace, then import the ZIP
on the wiki's Appearance page, or drop the images there one by one.
`;

// A labelled grid at the slot's exact size, with lines every 50 px and darker ones every 250 px.
async function placeholder(width: number, height: number, name: string): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f4f1f2";
  context.fillRect(0, 0, width, height);
  for (let at = 0; at <= Math.max(width, height); at += 50) {
    context.strokeStyle = at % 250 === 0 ? "#c9bfc3" : "#e3dcdf";
    context.beginPath();
    context.moveTo(at + 0.5, 0);
    context.lineTo(at + 0.5, height);
    context.moveTo(0, at + 0.5);
    context.lineTo(width, at + 0.5);
    context.stroke();
  }
  context.strokeStyle = "#c41e3a";
  context.lineWidth = 4;
  context.strokeRect(2, 2, width - 4, height - 4);
  const size = Math.max(14, Math.min(height / 5, width / 12));
  context.fillStyle = "#1b191a";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${size}px system-ui, sans-serif`;
  context.fillText(name, width / 2, height / 2 - size * 0.6);
  context.font = `${size * 0.7}px system-ui, sans-serif`;
  context.fillText(`${width} × ${height}`, width / 2, height / 2 + size * 0.6);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob!.arrayBuffer());
}

export async function buildAssetsPack(): Promise<Uint8Array<ArrayBuffer>> {
  const files: Record<string, Uint8Array> = { "README.txt": new TextEncoder().encode(README) };
  for (const { file, width, height } of Object.values(IMAGE_SLOTS)) files[`${file}.png`] = await placeholder(width, height, file);
  return zipSync(files) as Uint8Array<ArrayBuffer>;
}
