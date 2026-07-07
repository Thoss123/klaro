import { describe, expect, it } from 'vitest';
import { parseOptionsTag } from '@/components/chat/OptionsCard';

describe('parseOptionsTag', () => {
  it('parses legacy single-question options', () => {
    const parsed = parseOptionsTag(
      'Passt das?\n<options>{"question":"Passt das so?","choices":[{"id":"yes","label":"Ja"},{"id":"edit","label":"Ändern"}]}</options>',
    );

    expect(parsed?.question).toBe('Passt das so?');
    expect(parsed?.choices.map(c => c.label)).toEqual(['Ja', 'Ändern']);
    expect(parsed?.questions).toBeUndefined();
  });

  it('parses stacked questions with choices and open text fields', () => {
    const parsed = parseOptionsTag(
      '<options>{"title":"Kurz gesammelt","questions":[{"id":"tool","question":"Womit macht ihr das heute?","choices":["Word","CRM","Anders"]},{"id":"count","question":"Wie oft pro Monat?","placeholder":"z. B. 20"}]}</options>',
    );

    expect(parsed?.question).toBe('Kurz gesammelt');
    expect(parsed?.choices).toEqual([]);
    expect(parsed?.questions).toEqual([
      {
        id: 'tool',
        question: 'Womit macht ihr das heute?',
        choices: [
          { id: '1', label: 'Word' },
          { id: '2', label: 'CRM' },
          { id: '3', label: 'Anders' },
        ],
        placeholder: undefined,
      },
      {
        id: 'count',
        question: 'Wie oft pro Monat?',
        choices: [],
        placeholder: 'z. B. 20',
      },
    ]);
  });

  it('parses recommended workflow choices', () => {
    const parsed = parseOptionsTag(
      '<options>{"question":"Wie soll der Ablauf laufen?","choices":[{"id":"a","label":"Variante A","recommended":true},{"id":"b","label":"Variante B"}]}</options>',
    );

    expect(parsed?.choices).toEqual([
      { id: 'a', label: 'Variante A', recommended: true },
      { id: 'b', label: 'Variante B' },
    ]);
  });

  it('uses the last options tag if a message contains multiple tags', () => {
    const parsed = parseOptionsTag(
      '<options>{"question":"Alt","choices":["A"]}</options>\n<options>{"question":"Neu","choices":["B"]}</options>',
    );

    expect(parsed?.question).toBe('Neu');
    expect(parsed?.choices.map(c => c.label)).toEqual(['B']);
  });
});

