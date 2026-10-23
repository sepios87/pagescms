import { getFileExtension } from "@/lib/utils/file";

// Resizing of an image in the browser, before it is sent. Set per media in the
// configuration (`resize`): the image is scaled down to fit within `width` x
// `height` (never enlarged) and, for JPEG and WebP, encoded with `quality`.
export type ResizeOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

const mimeTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const lossyTypes = new Set(["image/jpeg", "image/webp"]);
const defaultQuality = 0.82;

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

const loadImage = async (file: File): Promise<LoadedImage> => {
  if (typeof createImageBitmap === "function") {
    try {
      // Applies the orientation stored in the photo (EXIF)
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Partial support of ImageBitmap: fall back to an <img>
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The browser could not decode this image."));
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
};

// Returns the file to upload: the resized image, or the file itself when there
// is nothing to do (no option, not a JPEG/PNG/WebP, already small enough) or if
// anything goes wrong, so an upload is never blocked by the resizing.
const resizeImage = async (file: File, options?: ResizeOptions): Promise<File> => {
  if (!options || (!options.width && !options.height && options.quality === undefined)) {
    return file;
  }
  const mimeType = mimeTypes[getFileExtension(file.name).toLowerCase()];
  if (!mimeType) return file;

  let image: LoadedImage | undefined;
  try {
    image = await loadImage(file);

    const scale = Math.min(
      1,
      options.width ? options.width / image.width : 1,
      options.height ? options.height / image.height : 1,
    );
    const lossy = lossyTypes.has(mimeType);
    // It already fits and can't be compressed (PNG) or no quality was asked
    if (scale === 1 && (!lossy || options.quality === undefined)) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, lossy ? (options.quality ?? defaultQuality) : undefined),
    );
    if (!blob) return file;
    // Only recompressed, not scaled down: keep the original if it isn't lighter
    if (scale === 1 && blob.size >= file.size) return file;

    return new File([blob], file.name, { type: mimeType, lastModified: file.lastModified });
  } catch (error) {
    console.warn("The image could not be resized, it is sent as it is.", error);
    return file;
  } finally {
    image?.cleanup();
  }
};

const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export { resizeImage, formatFileSize };
