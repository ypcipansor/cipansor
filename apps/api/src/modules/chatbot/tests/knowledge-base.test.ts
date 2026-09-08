import { describe, it, expect } from 'vitest';
import { donationConfig, educationUnits, siteConfig } from '@cipansor/shared';
import {
  TOPIC_HUB_IDS,
  knowledgeBase,
  knowledgeById,
  topicLabels,
} from '../knowledge-base';

describe('knowledge base', () => {
  it('derives every unit entry from the shared config', () => {
    // The guarantee this file exists to provide: add a unit to the public site
    // and the bot knows about it, with no second edit and no drift.
    for (const unit of educationUnits) {
      const entry = knowledgeById.get(`unit-${unit.slug}`);
      expect(entry, `missing entry for unit ${unit.slug}`).toBeDefined();
      expect(entry!.text).toContain(unit.description);
    }
  });

  it('states the bank details exactly as published', () => {
    // Financial data: a transposed digit sends real donations to a stranger.
    // Asserting on the constant rather than a literal means this test cannot
    // itself go stale, while still failing if the entry stops quoting it.
    const entry = knowledgeById.get('donasi-rekening')!;
    expect(entry.text).toContain(donationConfig.bank.accountNumber);
    expect(entry.text).toContain(donationConfig.bank.accountHolder);
    expect(entry.text).toContain(donationConfig.confirmation.whatsappNumber);
  });

  it('carries the real contact details', () => {
    const entry = knowledgeById.get('kontak')!;
    expect(entry.text).toContain(siteConfig.contact.phone);
    expect(entry.text).toContain(siteConfig.contact.email);
  });

  it('contains no admission fee or closing date', () => {
    // These belong to a row that opens and closes on its own schedule, so they
    // are read live (live-facts.ts). A number baked in here is correct until
    // the day it silently is not — and the reader is a family choosing a school.
    const corpus = knowledgeBase.map((e) => e.text).join(' ');
    expect(corpus).not.toMatch(/Rp\s?[\d.]+/i);
    expect(corpus).not.toMatch(/\b20\d\d\/20\d\d\b/);
  });

  it('gives every entry a unique id', () => {
    const ids = knowledgeBase.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry non-trivial text', () => {
    for (const entry of knowledgeBase) {
      expect(entry.text.length, `entry ${entry.id} is too short to be useful`).toBeGreaterThan(40);
    }
  });
});

describe('rambu petunjuk topik', () => {
  it('setiap id hub benar-benar ada di korpus', () => {
    // Ini penjaga yang menanggung beban. `topicLabels()` MENYARING id yang
    // tidak ditemukan, jadi menghapus satu entri hub tidak akan meledak — ia
    // hanya memendekkan daftar yang dibacakan asisten kepada pengunjung, diam
    // -diam. Uji inilah yang mengubahnya jadi kegagalan yang terlihat.
    for (const id of TOPIC_HUB_IDS) {
      expect(knowledgeById.get(id), `entri hub hilang: ${id}`).toBeDefined();
    }
    expect(topicLabels()).toHaveLength(TOPIC_HUB_IDS.length);
  });

  it('daftar isi dibangun dari korpus, bukan ditulis tangan', () => {
    // Kalau ia ditulis tangan, entri baru tidak akan pernah muncul di dalamnya
    // dan asisten akan menyebut daftar yang makin lama makin tidak benar.
    const index = knowledgeById.get('bantuan-ikhtisar')!;
    for (const label of topicLabels()) {
      expect(index.text).toContain(label);
    }
  });

  it('entri daftar isi ikut terindeks seperti entri lain', () => {
    expect(knowledgeBase.some((e) => e.id === 'bantuan-ikhtisar')).toBe(true);
  });
});
