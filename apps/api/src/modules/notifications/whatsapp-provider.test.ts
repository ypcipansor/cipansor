import { describe, it, expect } from 'vitest';
import { resolveWhatsAppProvider } from './whatsapp.service';

describe('resolveWhatsAppProvider', () => {
  it('uses the configured provider when outbound messages are on', () => {
    expect(resolveWhatsAppProvider('FONNTE', true)).toBe('FONNTE');
  });

  it('defaults to the simulator when no provider is configured', () => {
    expect(resolveWhatsAppProvider(undefined, true)).toBe('SIMULATOR');
  });

  it('forces the simulator when outbound messages are switched off, whatever is configured', () => {
    // The staging guard: a copy that inherits a real provider key must still
    // reach no wali's phone.
    expect(resolveWhatsAppProvider('META', false)).toBe('SIMULATOR');
    expect(resolveWhatsAppProvider('FONNTE', false)).toBe('SIMULATOR');
  });
});
