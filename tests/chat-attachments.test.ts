import { describe, it, expect } from 'vitest';
import {
  embedUserAttachments,
  parseUserAttachments,
  formatAttachmentsForCoach,
  stripLegacyAttachmentBlocks,
} from '@/lib/chat-attachments';

describe('chat attachments display', () => {
  it('embeds hidden metadata without OCR in visible text', () => {
    const stored = embedUserAttachments('was ist im bild', [
      {
        id: '1',
        name: 'grafik.png',
        mimeType: 'image/png',
        type: 'image',
        url: 'https://example.com/a.png',
        textExtract: 'SECRET OCR TEXT',
      },
    ]);
    expect(stored).toContain('was ist im bild');
    expect(stored).not.toContain('SECRET OCR TEXT');
    expect(stored).not.toContain('grafik.png');
    expect(stored).toContain('<user_attachments>');
  });

  it('parses previews and strips legacy OCR blocks', () => {
    const legacy =
      'was ist im bild\n\n--- Bild (OCR): grafik.png ---\nZeile 1\nZeile 2';
    const { text, attachments } = parseUserAttachments(legacy);
    expect(text).toBe('was ist im bild');
    expect(attachments).toEqual([]);
  });

  it('coach context skips image OCR', () => {
    const coach = formatAttachmentsForCoach('frage', [
      {
        id: '1',
        name: 'grafik.png',
        mimeType: 'image/png',
        type: 'image',
        textExtract: 'OCR dump',
      },
    ]);
    expect(coach).toBe('frage');
  });

  it('coach context keeps document text', () => {
    const coach = formatAttachmentsForCoach('', [
      {
        id: '1',
        name: 'notes.txt',
        mimeType: 'text/plain',
        type: 'document',
        textExtract: 'Inhalt',
      },
    ]);
    expect(coach).toContain('Inhalt');
  });

  it('stripLegacyAttachmentBlocks removes old markers', () => {
    expect(
      stripLegacyAttachmentBlocks('hi\n\n--- Bild (OCR): x.png ---\nfoo'),
    ).toBe('hi');
  });
});
