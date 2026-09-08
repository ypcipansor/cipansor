import { prisma } from '@/lib/prisma';
import { verifyRevocation, verifySignature } from '@/utils/esign';

export async function verifyLetterByToken(token: string) {
  const signature = await prisma.letterSignature.findUnique({
    where: { verificationToken: token },
    include: {
      /**
       * Nama dan jabatan saja — NIP tidak diambil, apalagi dikirim.
       *
       * Halaman verifikasi ini terbuka untuk umum. Yang perlu dijawabnya adalah
       * "benarkah naskah ini ditandatangani, oleh siapa, dan masih berlakukah"
       * — bukan "berapa nomor induk pegawainya". Nomor induk adalah keterangan
       * internal, dan sebuah endpoint publik yang mengembalikannya menjadikan
       * setiap surat yang beredar sebagai jalan mengumpulkannya.
       */
      signer: {
        select: {
          name: true,
          staff: { select: { position: true } },
        },
      },
      revokedBy: { select: { name: true } },
      letter: {
        select: {
          id: true,
          letterNumber: true,
          agendaNumber: true,
          date: true,
          type: true,
          nature: true,
          subject: true,
          content: true,
          status: true,
          authoringTrack: true,
          unitId: true,
          unit: { select: { name: true } },
        },
      },
    },
  });

  if (!signature) {
    return { found: false as const };
  }

  const l = signature.letter;
  const intact = verifySignature(signature.publicKey, signature.signature, {
    letterId: l.id,
    letterNumber: l.letterNumber,
    date: l.date,
    type: l.type,
    nature: l.nature,
    subject: l.subject,
    content: l.content,
    unitId: l.unitId,
    signerId: signature.signerId,
    signedAt: signature.signedAt,
  });

  const isPublicNature = l.nature === 'PUBLIC';
  const isValid = intact && !signature.revokedAt;

  /**
   * Pencabutannya sendiri dibuktikan, bukan sekadar dipercaya.
   *
   * Sebuah CRL adalah struktur data yang ditandatangani penerbitnya (RFC 5280),
   * dan pencabutan di sini pun begitu: pencabut menandatangani pernyataannya
   * dengan kuncinya sendiri. Halaman publik karena itu dapat mengatakan bahwa
   * pencabutan ini benar dinyatakan oleh pejabat yang namanya tercantum —
   * termasuk bahwa alasan yang terbaca itu memang alasan yang ditandatanganinya,
   * bukan teks yang disunting kemudian.
   *
   * Bernilai `null` untuk pencabutan yang tercatat sebelum tanda tangan
   * pencabutan diberlakukan; itu bukan kegagalan verifikasi, hanya ketiadaan
   * bukti tambahan.
   */
  let revocationVerified: boolean | null = null;
  if (signature.revokedAt) {
    if (signature.revocationSignature && signature.revocationPublicKey) {
      revocationVerified = verifyRevocation(
        signature.revocationPublicKey,
        {
          signatureId: signature.id,
          letterId: l.id,
          revokedById: signature.revokedById ?? '',
          revokedByRoleCode: signature.revokedByRoleCode ?? null,
          revokedAt: signature.revokedAt,
          reason: signature.revokedReason ?? '',
        },
        signature.revocationSignature
      );
    }
  }

  let reason: string | undefined;
  if (!intact) {
    reason = 'Isi naskah telah diubah setelah ditandatangani.';
  } else if (signature.revokedAt) {
    reason = signature.revokedReason
      ? `Naskah telah dicabut: ${signature.revokedReason}`
      : 'Naskah telah dicabut.';
  }

  return {
    found: true as const,
    valid: isValid,
    isValid,
    intact,
    revoked: !!signature.revokedAt,
    isRevoked: !!signature.revokedAt,
    revokedAt: signature.revokedAt,
    revokedReason: signature.revokedReason,
    revokedByName: signature.revokedBy?.name ?? null,
    revocationVerified,
    letterNumber: l.letterNumber || l.agendaNumber || '-',
    letterType: l.type,
    nature: l.nature,
    // Hanya untuk surat biasa; selebihnya cukup dibuktikan keasliannya.
    subject: isPublicNature ? l.subject : null,
    date: l.date,
    unitName: l.unit?.name ?? null,
    signerName: signature.signer.name,
    signer: {
      name: signature.signer.name,
      position: signature.signer.staff?.position || 'Pejabat / Guru Yayasan',
    },
    letter: {
      letterNumber: l.letterNumber || l.agendaNumber || '-',
      subject: isPublicNature ? l.subject : null,
      date: l.date,
      status: l.status,
      unitName: l.unit?.name ?? '-',
      /**
       * Bukan rincian teknis, melainkan bagian dari jawabannya.
       *
       * Verifikasi ini membuktikan satu hal dengan pasti: byte yang diunggah
       * pembaca adalah byte yang ditandatangani. Apa yang dibuktikannya
       * *tentang buku agenda* berbeda menurut jalur penyusunannya — pada
       * naskah GENERATED metadata dan isinya berasal dari satu sumber
       * sehingga tidak mungkin berselisih, sedangkan pada naskah UPLOADED
       * tidak ada pemeriksaan yang dapat menjamin itu. Halaman yang
       * menampilkan keduanya dengan kalimat yang sama menjanjikan lebih
       * daripada yang dibuktikannya.
       */
      authoringTrack: l.authoringTrack,
    },
    signedAt: signature.signedAt,
    algorithm: signature.algorithm,
    digest: signature.digest,
    reason,
  };
}
