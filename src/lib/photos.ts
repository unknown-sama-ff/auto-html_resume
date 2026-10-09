const MAX_PHOTO_BYTES = 10_000_000;
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type DecodedPhoto = { source: CanvasImageSource; width: number; height: number; release: () => void };
type ProcessedImage = { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; dataUrl: string };
type ImageOptions = { label: string; noun: string; maxBytes: number; edges: number[]; qualities: number[]; preserveOriginal?: boolean; losslessPng?: boolean };

async function decodePhoto(file: File, noun: string): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch { /* Fall through to Image for partial browser support. */ }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error(`图片读取超时，请重新选择${noun}。`)), 15000);
      function finish(error?: Error) {
        window.clearTimeout(timeout); image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      }
      image.onload = () => finish();
      image.onerror = () => finish(new Error(`无法读取${noun}，请选择完整的 PNG、JPEG 或 WebP 图片。`));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) { image.src = ''; URL.revokeObjectURL(url); throw error; }
}

function encodePhoto(canvas: HTMLCanvasElement, type: string, quality: number, noun: string): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`${noun}压缩失败，请重新选择${noun}。`)), type, quality));
}

function readDataUrl(blob: Blob, noun: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`${noun}读取失败`));
    reader.onerror = () => reject(new Error(`${noun}读取失败`));
    reader.onabort = () => reject(new Error(`${noun}读取已取消`));
    reader.readAsDataURL(blob);
  });
}

async function processPhoto(file: File, options: ImageOptions): Promise<ProcessedImage> {
  const { noun } = options;
  const mimeType = file.type.toLowerCase();
  if (!PHOTO_TYPES.includes(mimeType)) throw new Error(`${options.label}请选择 PNG、JPEG 或 WebP 图片。`);
  if (file.size > MAX_PHOTO_BYTES) throw new Error(`${options.label}原图请控制在 10 MB 内，上传后会自动压缩。`);
  if (!file.size) throw new Error(`${noun}文件为空，请重新选择${noun}。`);
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const validSignature = [
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte),
    signature[0] === 255 && signature[1] === 216 && signature[2] === 255,
    signature[0] === 82 && signature[1] === 73 && signature[2] === 70 && signature[3] === 70 && signature[8] === 87 && signature[9] === 69 && signature[10] === 66 && signature[11] === 80,
  ][PHOTO_TYPES.indexOf(mimeType)];
  if (!validSignature) throw new Error(`无法读取${noun}，请选择完整的 PNG、JPEG 或 WebP 图片。`);
  const decoded = await decodePhoto(file, noun);
  const canvas = document.createElement('canvas');
  const result = async (blob: Blob): Promise<ProcessedImage> => ({ mimeType: blob.type as ProcessedImage['mimeType'], dataUrl: await readDataUrl(blob, noun) });
  try {
    if (!decoded.width || !decoded.height) throw new Error(`${noun}尺寸无效，请重新选择${noun}。`);
    if (options.preserveOriginal && file.size <= options.maxBytes && Math.max(decoded.width, decoded.height) <= options.edges[0]) return result(file);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`浏览器无法处理${noun}，请更换浏览器后重试。`);
    let format = 'image/webp';
    for (const maxEdge of options.edges) {
      const ratio = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
      canvas.width = Math.max(1, Math.round(decoded.width * ratio));
      canvas.height = Math.max(1, Math.round(decoded.height * ratio));
      if (options.losslessPng && mimeType === 'image/png') {
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        const png = await encodePhoto(canvas, 'image/png', 1, noun);
        if (png.type === 'image/png' && png.size <= options.maxBytes) return result(png);
      }
      for (const quality of options.qualities) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (format === 'image/jpeg') { context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height); }
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        let blob = await encodePhoto(canvas, format, quality, noun);
        if (format === 'image/webp' && blob.type !== 'image/webp') {
          format = 'image/jpeg'; context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height); blob = await encodePhoto(canvas, format, quality, noun);
        }
        if (blob.type !== format) throw new Error(`浏览器不支持${noun}压缩，请更换浏览器后重试。`);
        if (blob.size <= options.maxBytes) return result(blob);
      }
    }
    throw new Error(`${noun}压缩后仍然过大，请选择尺寸较小的${noun}。`);
  } finally { decoded.release(); canvas.width = 0; canvas.height = 0; }
}

export async function readAvatarPhoto(file: File): Promise<string> {
  const image = await processPhoto(file, { label: '证件照', noun: '照片', maxBytes: 1_500_000, edges: [1600, 1280, 1024], qualities: [0.9, 0.82, 0.72, 0.62] });
  return image.dataUrl;
}

export function readMaterialImage(file: File): Promise<ProcessedImage> {
  return processPhoto(file, { label: '资料图片 / 岗位截图', noun: '图片', maxBytes: 2_000_000, edges: [3200, 2800, 2400, 2000, 1600], qualities: [0.95, 0.9, 0.85, 0.8], preserveOriginal: true, losslessPng: true });
}
