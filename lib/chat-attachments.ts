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

export type StoredUserAttachment = {
  type: 'image' | 'document'
  url?: string
  preview?: string
}

const USER_ATTACHMENTS_TAG = 'user_attachments';

/** Visible chat text only — no OCR, no filenames. */
export function formatAttachmentsForDisplay(text: string): string {
  return text.trim();
}

/** Persist user text + hidden attachment metadata for bubble previews (not shown as raw text). */
export function embedUserAttachments(text: string, attachments: ChatAttachment[]): string {
  if (!attachments.length) return text.trim();

  const payload: StoredUserAttachment[] = attachments.map(a => ({
    type: a.type,
    url: a.url,
    preview:
      a.type === 'image' && !a.url && a.base64 && a.mimeType
        ? `data:${a.mimeType};base64,${a.base64}`
        : undefined,
  }));

  const visible = text.trim();
  const tag = `<${USER_ATTACHMENTS_TAG}>${JSON.stringify(payload)}</${USER_ATTACHMENTS_TAG}>`;
  return visible ? `${visible}\n${tag}` : tag;
}

export function parseUserAttachments(content: string): {
  text: string
  attachments: StoredUserAttachment[]
} {
  if (!content) return { text: '', attachments: [] };

  const match = content.match(
    new RegExp(`<${USER_ATTACHMENTS_TAG}>([\\s\\S]*?)<\\/${USER_ATTACHMENTS_TAG}>`, 'i'),
  );
  if (!match) {
    return { text: stripLegacyAttachmentBlocks(content), attachments: [] };
  }

  const text = content
    .replace(
      new RegExp(`<${USER_ATTACHMENTS_TAG}>[\\s\\S]*?<\\/${USER_ATTACHMENTS_TAG}>`, 'i'),
      '',
    )
    .trim();

  try {
    const parsed = JSON.parse(match[1]) as StoredUserAttachment[];
    return {
      text: stripLegacyAttachmentBlocks(text),
      attachments: Array.isArray(parsed) ? parsed : [],
    };
  } catch {
    return { text: stripLegacyAttachmentBlocks(text), attachments: [] };
  }
}

/** Remove leaked OCR / filename blocks from older messages. */
export function stripLegacyAttachmentBlocks(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(/---\s*(?:Bild\s*\(OCR\)|Datei):\s*[^\n]+\s*---[\s\S]*?(?=\n\n---|\n\n\[|$)/gi, '');
  out = out.replace(/\n*\[Bild angehängt:[^\]]+\]/gi, '');
  out = out.replace(/\n*\[Anhang:[^\]]+\](?:\([^)]+\))?/gi, '');
  return out.trim();
}

/** Coach/API context for the current turn — documents only; images go via vision. */
export function formatAttachmentsForCoach(text: string, attachments: ChatAttachment[]): string {
  const base = text.trim();
  const docBlocks = attachments
    .filter(a => a.type === 'document' && a.textExtract)
    .map(a => `\n\n--- Datei ---\n${a.textExtract!.slice(0, 12000)}`);

  if (!docBlocks.length) return base || ' ';
  return `${base || 'Siehe Anhang.'}${docBlocks.join('')}`.trim();
}

export function attachmentsForApi(attachments: ChatAttachment[]) {
  return attachments
    .filter(a => a.type === 'image' && a.base64 && a.mimeType)
    .map(a => ({ mimeType: a.mimeType, base64: a.base64! }));
}

/** @deprecated Use embedUserAttachments + formatAttachmentsForCoach */
export function formatAttachmentsForMessage(text: string, attachments: ChatAttachment[]): string {
  return embedUserAttachments(formatAttachmentsForDisplay(text), attachments);
}
