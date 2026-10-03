/**
 * Who holds office at Yayasan Pesantren Cipansor, as the yayasan published it
 * (the SPMB 2027/2028 brochure, 2026): the three organs of the yayasan
 * (UU 16/2001 jo. UU 28/2004 — Pembina, Pengawas, Pengurus) and the
 * pesantren's own structure.
 *
 * One list, read by the public site's structure (`/profil/pimpinan`), the
 * seed's board members and the demo accounts, so a name is corrected in one
 * place. Two copies had already drifted ("H. M. Rizkon" on the site, "H.M.
 * Rizkon" on the account).
 *
 * Public names and positions only. The brochure also prints staff phone
 * numbers; those are personal and never go in this repository — an admin
 * enters contact details in the portal.
 */

export interface OfficeHolder {
  /** Stable key: the public site translates the position by it. */
  slug: string;
  /** The position in Indonesian, as the yayasan writes it. */
  position: string;
  name: string;
  /** Portrait in `apps/web/public/images/people/`, where the yayasan published one. */
  photo?: string;
}

export type OfficeGroupSlug = "pembina" | "pengawas" | "pengurus" | "pesantren";

export interface OfficeGroup {
  slug: OfficeGroupSlug;
  /** Heading in Indonesian. */
  title: string;
  holders: OfficeHolder[];
}

/** A person, once — several hold two offices. */
const PEOPLE = {
  aangSuandi: {
    name: "K.H. Aang Suandi, Lc.",
    photo: "/images/people/pembina-aang-suandi.webp",
  },
  taufikIsmail: {
    name: "K.H. Muhammad Taufik Ismail, S.Pd",
    photo: "/images/people/pimpinan-pesantren.webp",
  },
  tetepAbdullatip: {
    name: "K.H. Drs. Tetep Abdullatip, M.Ag.",
    photo: "/images/people/pembina-tetep-abdullatip.webp",
  },
  asepTamim: { name: "Drs. Asep Tamim, M.Si." },
  tantanPermana: { name: "H. Tantan Permana" },
  aminudin: { name: "Aminudin" },
  ramram: {
    // "Ramran" in the brochure is a misprint (decisions/spmb-2027-2028.md).
    name: "H. Ramram Mansur Ramdani, S.Pd.I., M.Ag",
    photo: "/images/people/ketua-yayasan.webp",
  },
  dadanAliRidwan: {
    name: "H. Dadan Ali Ridwan, S.Ag",
    photo: "/images/people/kepala-sdit.webp",
  },
  andiBadrudin: {
    name: "H. Andi Muhammad Badrudin, S.T.",
    photo: "/images/people/bendahara-yayasan.webp",
  },
  ramaRamadhan: { name: "Ustadz Rama Ramadhan, Al-Hafidz, S.Pd." },
  titimPatimah: { name: "Ustadzah Titim Patimah, S.Pd." },
  rizkonHakiki: {
    name: "H.M. Rizkon Hakiki, Lc., Al-Hafidz",
    photo: "/images/people/kepala-smaquran.webp",
  },
  shofuraIstifa: { name: "Ustadzah Shofura Istifa, Al-Hafidzah" },
  aniSitiNurasiah: { name: "Ustadzah Ani Siti Nurasiah, S.Pd." },
  cecepHelmi: {
    name: "H. Cecep Helmi Syawali, Lc., M.Ag",
    photo: "/images/people/kepala-smpit.webp",
  },
  nanangRahmat: { name: "Ustadz Nanang Rahmat, S.Pd." },
} satisfies Record<string, Pick<OfficeHolder, "name" | "photo">>;

export const OFFICE_HOLDERS = PEOPLE;

export const ORGANISATION: OfficeGroup[] = [
  {
    slug: "pembina",
    title: "Pembina",
    holders: [
      {
        slug: "pembina-aang-suandi",
        position: "Pembina",
        ...PEOPLE.aangSuandi,
      },
      {
        slug: "pembina-taufik-ismail",
        position: "Pembina",
        ...PEOPLE.taufikIsmail,
      },
      {
        slug: "pembina-tetep-abdullatip",
        position: "Pembina",
        ...PEOPLE.tetepAbdullatip,
      },
    ],
  },
  {
    slug: "pengawas",
    title: "Pengawas",
    holders: [
      {
        slug: "pengawas-asep-tamim",
        position: "Pengawas",
        ...PEOPLE.asepTamim,
      },
      {
        slug: "pengawas-tantan-permana",
        position: "Pengawas",
        ...PEOPLE.tantanPermana,
      },
      { slug: "pengawas-aminudin", position: "Pengawas", ...PEOPLE.aminudin },
    ],
  },
  {
    slug: "pengurus",
    title: "Pengurus",
    holders: [
      { slug: "ketua-yayasan", position: "Ketua", ...PEOPLE.ramram },
      {
        slug: "sekretaris-yayasan",
        position: "Sekretaris",
        ...PEOPLE.dadanAliRidwan,
      },
      {
        slug: "bendahara-yayasan",
        position: "Bendahara",
        ...PEOPLE.andiBadrudin,
      },
    ],
  },
  {
    slug: "pesantren",
    title: "Pesantren Cipansor",
    holders: [
      {
        slug: "pimpinan-pesantren",
        position: "Pimpinan Pesantren",
        ...PEOPLE.taufikIsmail,
      },
      {
        slug: "sekretaris-pesantren",
        position: "Sekretaris",
        ...PEOPLE.ramaRamadhan,
      },
      {
        slug: "bendahara-pesantren",
        position: "Bendahara",
        ...PEOPLE.titimPatimah,
      },
      {
        slug: "direktur-tahfidz-ikhwan",
        position: "Direktur Tahfidz Ikhwan",
        ...PEOPLE.rizkonHakiki,
      },
      {
        slug: "direktur-tahfidz-akhwat",
        position: "Direktur Tahfidz Akhwat",
        ...PEOPLE.shofuraIstifa,
      },
      {
        slug: "kepala-tkq",
        position: "Kepala TK Qur'an",
        ...PEOPLE.aniSitiNurasiah,
      },
      {
        slug: "kepala-sdit",
        position: "Kepala SD IT",
        ...PEOPLE.dadanAliRidwan,
      },
      { slug: "kepala-smpit", position: "Kepala SMP IT", ...PEOPLE.cecepHelmi },
      {
        slug: "kepala-smaquran",
        position: "Kepala SMA Qur'an",
        ...PEOPLE.rizkonHakiki,
      },
      {
        slug: "kepengasuhan-ikhwan",
        position: "Kepengasuhan Ikhwan",
        ...PEOPLE.nanangRahmat,
      },
      {
        slug: "kepengasuhan-akhwat",
        position: "Kepengasuhan Akhwat",
        ...PEOPLE.titimPatimah,
      },
    ],
  },
];

/** The yayasan's organs — the rows of `board_members`. */
export const YAYASAN_ORGANS = ORGANISATION.filter(
  (g) => g.slug !== "pesantren",
);

/** The holder of one office, by its slug ("pimpinan-pesantren", …). */
export function officeHolder(slug: string): OfficeHolder | undefined {
  for (const group of ORGANISATION) {
    const holder = group.holders.find((h) => h.slug === slug);
    if (holder) return holder;
  }
  return undefined;
}
