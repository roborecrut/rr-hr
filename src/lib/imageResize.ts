/**
 * Universal logo optimizer. Reads any user-picked image (PNG/JPG/SVG/WebP),
 * fits it into a 256×256 transparent canvas (object-fit: contain), and returns
 * a WebP Blob ~20–40KB. SVG inputs are rasterized via <img> + Canvas as well.
 */
export async function resizeToWebP(
  file: File,
  size = 256,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number; bytes: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    // Transparent background, contain-fit
    ctx.clearRect(0, 0, size, size);
    const ratio = Math.min(size / img.width, size / img.height);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const dx = Math.round((size - w) / 2);
    const dy = Math.round((size - h) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, w, h);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))),
        "image/webp",
        quality,
      ),
    );
    return { blob, width: size, height: size, bytes: blob.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}