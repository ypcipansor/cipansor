# Fasilitas dan Kegiatan di situs publik

Decided by the user on 2026-10-04, from the 2027/2028 SPMB brochure
([`spmb-2027-2028.md`](spmb-2027-2028.md)). The brochure's *Program Unggulan*
were already on the site. Its *Sarana dan Prasarana*, *Ekstrakurikuler* and
*Agenda Tahunan* were not.

## What was decided

1. **Two menu items: Fasilitas and Kegiatan.** Fasilitas is at `/campus`.
   Kegiatan is at `/activities` and holds the extracurriculars and the annual
   agenda. The menu now has eight items, the most the sources below allow.
   The paths are English (`istilah-dan-penamaan.md` §3).
   `/facilities` and `/extracurricular` are portal modules, read with a
   session, so they cannot also be public pages.
2. **Facilities live in the site's config, in three languages**, like Program
   Unggulan (`campusFacilities` in `packages/shared/src/public-site.ts`).
   - Each entry says what the place is for. Nothing about its size or age,
     because the brochure does not state them.
   - The portal's Sarpras module records buildings and rooms per unit with
     their condition. That is inventory, not a list of kinds of place: a
     natural spring and an outbound course are not buildings.
3. **Extracurriculars come from the portal's Ekstrakurikuler module**, and the
   unit's admin keeps them.
   - The brochure's nine were loaded into the module
     (`db:seed:ekskul-2027-2028`), the way the SPMB intake was.
   - The module holds an English and an Arabic name, entered by the admin. An
     empty translation shows the Indonesian name.
   - The public list is `GET /extracurricular/public`. It returns active rows
     of the five education units only: name, translations, category and unit
     type.
4. **Which units run which.** SAPALA and Paskibra belong to SMA Qur'an, as the
   brochure marks them. The seven it leaves unmarked go to SD IT, SMP IT and
   SMA Qur'an:
   - extracurriculars are regulated for primary and secondary schooling
     (Permendikbud 62/2014), not for TK;
   - Takhosus is a pesantren programme.
   A unit's admin corrects its own list in the portal.
5. **Annual agenda: the name and what it is, no dates.** The dates move every
   year and the portal's calendar holds them.
6. **Photographs.** A facility shows a photograph only where one in the
   gallery shows that very place (`public-site-photography.md`). That covers
   the masjid, the dormitory, the classrooms and the assembly ground. The rest
   show an icon.
   - The brochure's own pictures are about 270 px wide and printed in CMYK,
     which is unusable on the web.
   - The user is asking the brochure's designer for the originals; they are
     added when they arrive.

## Research behind it (do not repeat)

- **Top-level menus: 5–7 items, 8 at most.** Use conventional labels
  (*Student Life* is a standard group for activities and facilities), not
  internal jargon.
  - <https://www.interactiveschools.com/blog/simplify-your-school-website-essential-tips-for-better-parent-navigation>
  - <https://campuspress.com/structuring-your-school-website-to-help-your-users/>
- **Prospective parents compare several sites in one sitting.** Clear,
  conventional navigation wins. Source: Nielsen Norman Group, *University
  Websites* report, <https://www.nngroup.com/reports/university/>.
- **Pesantren sites give Fasilitas and Ekstrakurikuler their own pages.**
  - Daar el-Qolam 3: <https://www.daarelqolam3.sch.id/facilities/>
  - Darul Arafah: <https://darularafahraya.ac.id/read/2/ekstrakurikuler>
  - Latansa: <https://ponpeslatansa.com/ekstrakurikuler/>
- **Parents judge a school from real photographs.**
  <https://www.rallyonline.co/blog/image-best-practices-for-school-websites>.
  Google for Nonprofits declined this domain for relying on stock images
  (`public-site-photography.md`).
- **Extracurricular scope.** Permendikbud 62/2014, *Kegiatan Ekstrakurikuler
  pada Pendidikan Dasar dan Pendidikan Menengah*. Summary:
  <https://www.salamedukasi.com/2018/09/pedoman-kegiatan-ekstrakurikuler-pada.html>.

## Rejected

- **One "Kehidupan Santri" page, or a submenu under Profil.** The user chose
  two items, following other pesantren sites.
- **The brochure's thumbnails, enlarged.** They blur, and the colours shift.
- **Extracurriculars typed into the site's config.** That would be a second
  copy of what the units keep in the portal (`AGENTS.md`: one concept, one
  module).
- **Facilities from the Sarpras module.** See decision 2.
