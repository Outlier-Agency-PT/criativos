"use client";


interface OptimizeImageOptions {
  maxBytes?: number;
  maxDimension?: number;
  initialQuality?: number;
  minQuality?: number;
}

const DEFAULT_OPTIONS: Required<OptimizeImageOptions> = {
  maxBytes: 4 * 1024 * 1024,
  maxDimension: 1600,
  initialQuality: 0.82,
  minQuality: 0.55,
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Erro ao processar imagem"));
    };

    image.src = objectUrl;
  });
}

export async function optimizeImageForUpload(
  file: File,
  options: OptimizeImageOptions = {}
): Promise<File> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const image = await loadImage(file);

  const needsResize =
    file.size > config.maxBytes ||
    image.width > config.maxDimension ||
    image.height > config.maxDimension;

  if (!needsResize) {
    return file;
  }

  const scale = Math.min(
    config.maxDimension / image.width,
    config.maxDimension / image.height,
    1
  );

  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let quality = config.initialQuality;

  while (quality >= config.minQuality) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );

    if (!blob) {
      break;
    }

    if (blob.size <= config.maxBytes || quality <= config.minQuality) {
      const optimizedName = file.name.replace(/\.[^.]+$/, ".jpg");
      return new File([blob], optimizedName, { type: "image/jpeg" });
    }

    quality -= 0.08;
  }

  return file;
}

