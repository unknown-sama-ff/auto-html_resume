import type { MaterialImage } from '../types';

export type MaterialFormat = 'text' | 'pdf' | 'docx' | 'html' | 'image';
export type ParsedMaterial = { name: string; text: string; format: MaterialFormat; image?: MaterialImage };
const MAX_TEXT_LENGTH = 45000;
const MAX_TEXT_BYTES = 200000;
const MAX_DOCUMENT_BYTES = 10000000;

function assertTextLength(text: string) {
  const normalized = text.split(String.fromCharCode(0)).join('').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length > MAX_TEXT_LENGTH) throw new Error('文件文字超过 45,000 字，请精简后上传。');
  if (normalized.length < 10) throw new Error('文件中没有提取到足够文字，请粘贴内容或上传页面截图。');
  return normalized;
}

async function readTextFile(file: File): Promise<ParsedMaterial> {
  if (file.size > MAX_TEXT_BYTES) throw new Error('文本文件过大，请控制在 200 KB 内。');
  return { name: file.name, format: 'text', text: assertTextLength(await file.text()) };
}

function htmlToText(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,noscript,template,svg,canvas,iframe').forEach(node => node.remove());
  const title = document.title.trim();
  const body = document.body;
  const text = body ? body.innerText || body.textContent || '' : document.documentElement.textContent || '';
  return [title, text].filter(Boolean).join('\n');
}

async function readHtmlFile(file: File): Promise<ParsedMaterial> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('HTML 文件请控制在 10 MB 内。');
  return { name: file.name, format: 'html', text: assertTextLength(htmlToText(await file.text())) };
}

async function readDocxFile(file: File): Promise<ParsedMaterial> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Word 文件请控制在 10 MB 内。');
  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { name: file.name, format: 'docx', text: assertTextLength(result.value) };
  } catch (error) {
    if (error instanceof Error && /45,000|文件中没有|Word 文件/.test(error.message)) throw error;
    throw new Error('无法读取 Word 文件。请上传未加密的 .docx；旧版 .doc 请先另存为 .docx。');
  }
}

async function readPdfFile(file: File): Promise<ParsedMaterial> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('PDF 请控制在 10 MB 内。');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 15) throw new Error('PDF 最多支持 15 页，请先精简。');
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
      if (text.length > MAX_TEXT_LENGTH) throw new Error('PDF 文字超过 45,000 字，请精简后上传。');
    }
    return { name: file.name, format: 'pdf', text: assertTextLength(text) };
  } catch (error) {
    if (error instanceof Error && (/45,000|文件中没有|扫描件/.test(error.message))) throw error;
    throw new Error('无法读取 PDF，请确认文件完整且未加密。扫描件请上传截图或粘贴文字。');
  } finally {
    await task.destroy();
  }
}

async function readImageFile(file: File): Promise<ParsedMaterial> {
  if (file.size > 2000000) throw new Error('图片请控制在 2 MB 内（PNG/JPEG/WebP）。');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
  const mimeType = file.type as MaterialImage['mimeType'];
  return { name: file.name, format: 'image', text: '', image: { name: file.name, mimeType, dataUrl } };
}

export async function readMaterial(file: File): Promise<ParsedMaterial> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith('.txt') || type === 'text/plain') return readTextFile(file);
  if (name.endsWith('.pdf') || type === 'application/pdf') return readPdfFile(file);
  if (name.endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return readDocxFile(file);
  if (name.endsWith('.doc')) throw new Error('暂不支持旧版 .doc，请在 Word 中另存为 .docx 后重新上传。');
  if (name.endsWith('.html') || name.endsWith('.htm') || type === 'text/html') return readHtmlFile(file);
  if (['image/png', 'image/jpeg', 'image/webp'].includes(type)) return readImageFile(file);
  throw new Error('支持 TXT、PDF、Word .docx、HTML，以及 PNG/JPEG/WebP 图片。');
}
