import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes the five meta-characters used to build markup', () => {
    expect(escapeHtml(`<script>alert('x')</script> & "q"`)).toBe(
      '&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt; &amp; &quot;q&quot;'
    );
  });

  it('escapes an ampersand before the characters it introduces', () => {
    // A second pass must not turn `&amp;` into `&amp;amp;`.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string input rather than throwing', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Ahmad Fauzi / Juz 30')).toBe('Ahmad Fauzi / Juz 30');
  });
});
