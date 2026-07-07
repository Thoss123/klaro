import { describe, it, expect } from 'vitest';
import {
  PHASE_MINDSET_NUMBERS,
  formatMindsetBlock,
  parseMindsets,
} from '@/lib/mindset';

const SAMPLE_MD = `# Test

## 1. Kosten sind Investition

**Die Haltung:**
Der Preis ist irrelevant als reiner Kostenpunkt.

**Wann kommt das auf?**
Bei Tool-Diskussionen.

---

## 2. KI ist Standard

**Die Haltung:**
Es gibt kein Ausprobieren mehr.

**Wann kommt das auf?**
In Phase 1.

---

## 7. Daten muss fließen

**Die Haltung:**
Daten ist wertvoll, wenn es zusammenfließt.

**Wann kommt das auf?**
In Phase 2.
`;

describe('mindset parsing', () => {
  it('parses haltung excerpts from markdown sections', () => {
    const parsed = parseMindsets(SAMPLE_MD);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      number: 1,
      title: 'Kosten sind Investition',
      haltung: 'Der Preis ist irrelevant als reiner Kostenpunkt.',
    });
  });

  it('maps 3 app phases to roadmap mindsets', () => {
    expect(PHASE_MINDSET_NUMBERS.diagnose).toEqual([2, 4]);
    expect(PHASE_MINDSET_NUMBERS.analyse).toEqual([1, 3, 4, 6, 7]);
    expect(PHASE_MINDSET_NUMBERS.umsetzung).toEqual([5, 8]);
  });

  it('formats a compact coach block for diagnose', () => {
    const block = formatMindsetBlock('diagnose');
    expect(block).toContain('Deine Haltung zu diesem Thema');
    expect(block).toContain('KI ist kein Experiment');
    expect(block).toContain('Menschen sind für Strategie');
    expect(block).not.toContain('Automatisierungs-Kosten sind Investitionen');
  });

  it('includes cost mindset in analyse (tool recommendations)', () => {
    const block = formatMindsetBlock('analyse');
    expect(block).toContain('Automatisierungs-Kosten sind Investitionen');
    expect(block).toContain('Daten ist Öl');
  });

  it('includes deploy mindsets in umsetzung', () => {
    const block = formatMindsetBlock('umsetzung');
    expect(block).toContain('Anfang ist mühsam');
    expect(block).toContain('Automation ohne Messung');
  });

  it('normalizes legacy plan phase to analyse mindsets', () => {
    const analyseBlock = formatMindsetBlock('analyse');
    const planBlock = formatMindsetBlock('plan');
    expect(planBlock).toBe(analyseBlock);
  });

  it('instructs coach not to preach mindsets explicitly', () => {
    const block = formatMindsetBlock('diagnose');
    expect(block).toContain('nicht predigen');
    expect(block).toContain('erwähne nie');
  });
});
