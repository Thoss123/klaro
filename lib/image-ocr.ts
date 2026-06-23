const OCR_MODEL = 'mistral-ocr-latest';

export type OcrPage = { markdown?: string };

/** Flatten Mistral OCR pages into plain text. */
export function parseOcrPages(pages: unknown): string {
  if (!Array.isArray(pages)) return '';
  return pages
    .map(p => (p && typeof p === 'object' && typeof (p as OcrPage).markdown === 'string'
      ? (p as OcrPage).markdown
      : ''))
    .join('\n\n')
    .trim();
}

/** Extract text from an image via Mistral OCR (mistral-ocr-latest). */
export async function extractTextFromImage(
  base64: string,
  mimeType: string,
  apiKey: string,
): Promise<string | undefined> {
  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      document: {
        type: 'image_url',
        image_url: `data:${mimeType};base64,${base64}`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn('[ocr] Mistral OCR failed:', err?.message || res.status);
    return undefined;
  }

  const data = await res.json();
  const text = parseOcrPages(data?.pages);
  return text || undefined;
}

/**
 * Extract text from a PDF via Mistral OCR (mistral-ocr-latest) — Fallback für
 * gescannte/bildbasierte PDFs, aus denen pdf-parse keinen Text bekommt.
 * Nutzt document_url (data-URI), nicht image_url.
 */
export async function extractTextFromPdf(
  base64: string,
  apiKey: string,
): Promise<string | undefined> {
  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${base64}`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn('[ocr] Mistral PDF OCR failed:', err?.message || res.status);
    return undefined;
  }

  const data = await res.json();
  const text = parseOcrPages(data?.pages);
  return text || undefined;
}
