/**
 * One-off: create the Curriculum rows the seed now also creates, for an
 * already-seeded dev database (a full `db:seed` truncates everything).
 */
import { createPrismaClient } from '../client';
import { SubjectType } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  const unit = await prisma.unit.findFirst({ where: { type: 'SMP_IT' } });
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!unit || !academicYear) throw new Error('unit or active academic year missing');

  const subjects = await prisma.subject.findMany({
    where: { unitId: unit.id, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  if (!subjects.length) throw new Error('no subjects to attach');

  for (const cur of [
    { code: 'KUR-MERDEKA-SMP-7', name: 'Kurikulum Merdeka SMP Kelas 7', gradeLevel: 7 },
    { code: 'KUR-MERDEKA-SMP-8', name: 'Kurikulum Merdeka SMP Kelas 8', gradeLevel: 8 },
  ]) {
    const existing = await prisma.curriculum.findFirst({
      where: { unitId: unit.id, academicYearId: academicYear.id, code: cur.code },
    });
    const curriculum =
      existing ??
      (await prisma.curriculum.create({
        data: {
          unitId: unit.id,
          academicYearId: academicYear.id,
          description: `Struktur kurikulum merdeka untuk tingkat ${cur.gradeLevel} SMP IT.`,
          isActive: true,
          ...cur,
        },
      }));

    const half = Math.ceil(subjects.length / 2);
    for (const [index, subject] of subjects.entries()) {
      await prisma.curriculumSubject.upsert({
        where: {
          curriculumId_subjectId_semester: {
            curriculumId: curriculum.id,
            subjectId: subject.id,
            semester: index < half ? 1 : 2,
          },
        },
        create: {
          curriculumId: curriculum.id,
          subjectId: subject.id,
          semester: index < half ? 1 : 2,
          sequence: index % half,
          isRequired: subject.type !== SubjectType.EXTRACURRICULAR,
        },
        update: {},
      });
    }
    console.log('curriculum', curriculum.id, curriculum.name);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
