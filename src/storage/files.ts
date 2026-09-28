import { newId } from '../model/factory';
import type { Asset } from '../model/types';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml';

export function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return true;
  return /\.(png|jpe?g|svg)$/i.test(file.name);
}

function guessMime(file: File): string {
  if (file.type) return file.type;
  if (/\.svg$/i.test(file.name)) return 'image/svg+xml';
  if (/\.png$/i.test(file.name)) return 'image/png';
  return 'image/jpeg';
}

export function readFileAsDataUrl(file: File, mime?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let url = String(reader.result);
      // 拡張子のみで判別した場合は MIME を補正
      if (mime && url.startsWith('data:application/octet-stream')) {
        url = url.replace('data:application/octet-stream', `data:${mime}`);
      } else if (mime && url.startsWith('data:;')) {
        url = url.replace('data:;', `data:${mime};`);
      }
      resolve(url);
    };
    reader.onerror = () => reject(reader.error ?? new Error('ファイルを読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('ファイルを読み込めませんでした。'));
    reader.readAsText(file);
  });
}

/** 画像サイズを取得 (SVG でサイズ不明な場合は既定値) */
export function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 1600;
      const height = img.naturalHeight || 1200;
      resolve({ width, height });
    };
    img.onerror = () => reject(new Error('画像として読み込めませんでした。'));
    img.src = dataUrl;
  });
}

/** 画像ファイル → アセット */
export async function imageFileToAsset(file: File): Promise<{ asset: Asset; width: number; height: number }> {
  if (!isAcceptedImage(file)) throw new Error('PNG / JPG / SVG 画像を選択してください。');
  const mime = guessMime(file);
  const dataUrl = await readFileAsDataUrl(file, mime);
  const { width, height } = await measureImage(dataUrl);
  return { asset: { id: newId('img'), name: file.name, mime, dataUrl }, width, height };
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  triggerDownload(dataUrl, filename);
}

/** ファイル名に使えない文字を除去 */
export function safeFileName(name: string, fallback = 'operation'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}
