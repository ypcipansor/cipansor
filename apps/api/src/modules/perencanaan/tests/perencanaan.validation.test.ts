import { describe, it, expect } from 'vitest';
import { updatePlanSchema } from '../perencanaan.validation';

describe('updatePlanSchema — transisi status tidak boleh lewat update (FLAG B)', () => {
  it('menolak mengubah status plan lewat updatePlan (bajak alur persetujuan)', () => {
    // Field lain boleh, tetapi status harus diabaikan/stripped oleh Zod —
    // bukan diteruskan ke service untuk menyetel APPROVED tanpa metadata
    // approval, atau membuka kembali rencana final.
    const result = updatePlanSchema.safeParse({
      title: 'Judul baru',
      status: 'APPROVED',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Zod default .strip() membuang kunci yang tidak dikenal schma ini.
      expect((result.data as Record<string, unknown>).status).toBeUndefined();
    }
  });

  it('mempertahankan field konten yang sah pada update plan', () => {
    const result = updatePlanSchema.safeParse({
      title: 'Judul baru',
      description: 'Deskripsi',
      progress: 40,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Judul baru');
      expect(result.data.progress).toBe(40);
      expect((result.data as Record<string, unknown>).status).toBeUndefined();
    }
  });
});