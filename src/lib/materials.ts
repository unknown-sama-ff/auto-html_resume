import type { MaterialImage } from '../types';
export type ParsedMaterial = { name: string; text: string; image?: MaterialImage };
export async function readMaterial(file: File): Promise<ParsedMaterial> {
  if (/\.txt$/i.test(file.name) || file.type === 'text/plain') {
    if (file.size > 200000) throw new Error('文本文件过大，请控制在 200 KB 内。');
    const text = await file.text();
    if (text.length > 45000) throw new Error('文本超过 45,000 字，请精简后上传。');
    return { name: file.name, text };
  }
  if (/\.pdf$/i.test(file.name)) {
    if (file.size > 10000000) throw new Error('PDF 请控制在 10 MB 内。');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 15) throw new Error('PDF 最多支持 15 页，请先精简。');
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); const content = await page.getTextContent();
        text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
        if (text.length > 45000) throw new Error('PDF 文字过多，请精简到 45,000 字以内。');
      }
      if (text.trim().length < 10) throw new Error('该 PDF 无可提取文字（可能是扫描件）。请上传页面截图或粘贴文字；图片识别需要支持视觉的模型。');
      return { name: file.name, text };
    } catch (error) {
      if (error instanceof Error && !error.message.includes('Invalid PDF')) throw error;
      throw new Error('无法读取 PDF，请确认文件完整且未加密。');
    } finally { await task.destroy(); }
  }
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    if (file.size > 2000000) throw new Error('图片请控制在 2 MB 内（PNG/JPEG/WebP）。');
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败')); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file); });
    const mimeType = file.type as MaterialImage['mimeType'];
    return { name: file.name, text: '', image: { name: file.name, mimeType, dataUrl } };
  }
  throw new Error('目前支持 TXT、带文字的 PDF 和 PNG/JPEG/WebP 图片。Word 文件请先导出 PDF。');
}
