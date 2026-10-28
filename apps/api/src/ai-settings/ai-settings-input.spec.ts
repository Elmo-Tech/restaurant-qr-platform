import {
  MAX_LABEL_CHARS,
  normalizeApiKey,
  normalizeLabel,
  normalizeModelName,
} from './ai-settings-input';

describe('AI settings input', () => {
  it('accepts plain model identifiers and nothing that could change a request', () => {
    expect(normalizeModelName('gemini-3.8-flash')).toBe('gemini-3.8-flash');
    expect(normalizeModelName('  gemini-3.8-flash  ')).toBe('gemini-3.8-flash');
    expect(normalizeModelName('models/gemini-pro')).toBe('models/gemini-pro');
    for (const bad of [
      '',
      ' ',
      '-leading-dash',
      'has space',
      'semi;colon',
      'quote"',
      'new\nline',
      'x'.repeat(81),
      'عربي',
      5,
      null,
      undefined,
    ]) {
      expect(normalizeModelName(bad)).toBeNull();
    }
  });

  it('accepts short labels, Arabic included, and cleans spacing', () => {
    expect(normalizeLabel('Main key')).toBe('Main key');
    expect(normalizeLabel('  مفتاح   رئيسي ')).toBe('مفتاح رئيسي');
    expect(normalizeLabel('x'.repeat(MAX_LABEL_CHARS))).toHaveLength(
      MAX_LABEL_CHARS,
    );
    for (const bad of [
      '',
      '   ',
      'x'.repeat(MAX_LABEL_CHARS + 1),
      'tab\there',
      'null\u0000byte',
      5,
      null,
      undefined,
    ]) {
      expect(normalizeLabel(bad)).toBeNull();
    }
  });

  it('accepts a pasted API key, trimmed, and refuses anything that is not one', () => {
    const key = 'AIzaSyExampleExampleExampleExample_123';
    expect(normalizeApiKey(key)).toBe(key);
    expect(normalizeApiKey(`\n  ${key}  \r\n`)).toBe(key);
    for (const bad of [
      '',
      'short',
      `${key} extra`,
      `${key}\nsecond`,
      'مفتاح'.repeat(10),
      'x'.repeat(257),
      5,
      null,
      undefined,
    ]) {
      expect(normalizeApiKey(bad)).toBeNull();
    }
  });
});
