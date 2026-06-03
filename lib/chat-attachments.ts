export type ChatAttachment = {
  id: string
  name: string
  mimeType: string
  type: 'image' | 'document'
  url?: string
  /** Raw base64 without data: prefix — for vision models */
  base64?: string
  textExtract?: string
}

export function formatAttachmentsForMessage(
  text: string,
  attachments: ChatAttachment[]
): string {
  if (!attachments.length) return text;
  const blocks = attachments.map(a => {
    if (a.textExtract) {
      return `\n\n--- Datei: ${a.name} ---\n${a.textExtract.slice(0, 12000)}`;
    }
    if (a.type === 'image' && a.url) {
      return `\n\n[Bild angehängt: ${a.name}](${a.url})`;
    }
    if (a.url) return `\n\n[Anhang: ${a.name}](${a.url})`;
    return `\n\n[Anhang: ${a.name}]`;
  });
  return `${text.trim()}${blocks.join('')}`.trim();
}

export function attachmentsForApi(attachments: ChatAttachment[]) {
  return attachments
    .filter(a => a.type === 'image' && a.base64 && a.mimeType)
    .map(a => ({ mimeType: a.mimeType, base64: a.base64! }));
}
