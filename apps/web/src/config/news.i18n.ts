import type { Locale } from "@/locales";
import { articles } from "./content";

/**
 * Headlines and standfirsts for the news articles, keyed by slug.
 *
 * Scope, stated plainly: this covers what the homepage teaser and the /berita
 * index show — headline, standfirst, unit label. The article *bodies* are still
 * Indonesian only. They carry direct quotations attributed to named members of
 * staff and lists of named children, and translating those deserves its own
 * pass with someone who can check the result against what was actually said,
 * rather than being folded silently into a homepage change.
 *
 * The unit labels ("SD IT", "SMP IT") are the units' own names and stay as they
 * are in every locale, like the rest of the domain vocabulary.
 */
export interface NewsText {
  title: string;
  excerpt: string;
}

const EN: Record<string, NewsText> = {
  "osn-kecamatan-kadipaten-2026": {
    title:
      "SD IT Pesantren Cipansor Sweeps the 2026 Kadipaten District Science Olympiad",
    excerpt:
      "Winning across several categories, our pupils turned in an academic performance to be proud of at the district round of the National Science Olympiad.",
  },
  "bmw-championship-road-to-malaysia-2026": {
    title:
      "SMP IT Pesantren Cipansor Students Shine at the BMW Championship Road to Malaysia 2026",
    excerpt:
      "A clean sweep at the national pencak silat championship in Bandung, showing that martial-arts training runs alongside Qur'an memorisation rather than against it.",
  },
  "prestasi-pentas-pai-kadipaten": {
    title:
      "SD IT Pesantren Cipansor Takes Honours at the Kadipaten District Pentas PAI Competition",
    excerpt:
      "Placing in event after event, our santri showed their strength in religious study and in the forming of Islamic character.",
  },
  "marhaban-ya-ramadhan-1447": {
    title:
      "Marhaban Yaa Ramadhan: A Time to Clear the Heart, Strengthen Faith, and Draw Closer to One Another",
    excerpt:
      "Ahead of Ramadan 1447 AH, the Chair of the Foundation writes to santri, teachers, parents and neighbours: let this be a month of spiritual schooling, not an annual routine.",
  },
};

const AR: Record<string, NewsText> = {
  "osn-kecamatan-kadipaten-2026": {
    title:
      "ابتدائية معهد سيبانسور تحصد ألقاب أولمبياد العلوم على مستوى منطقة كاديفاتين ٢٠٢٦",
    excerpt:
      "بفوزهم في فئات متعدّدة، أظهر التلاميذ تحصيلاً علمياً يبعث على الفخر في التصفيات المحلية لأولمبياد العلوم الوطني.",
  },
  "bmw-championship-road-to-malaysia-2026": {
    title:
      "طلاب إعدادية معهد سيبانسور يتألّقون في بطولة BMW Championship Road to Malaysia ٢٠٢٦",
    excerpt:
      "حصدوا الألقاب في مسابقة البينشاك سيلات على المستوى الوطني في باندونغ، بما يؤكّد أن التدريب على الدفاع عن النفس يسير جنباً إلى جنب مع تحفيظ القرآن.",
  },
  "prestasi-pentas-pai-kadipaten": {
    title:
      "ابتدائية معهد سيبانسور تسجّل حضوراً مشرّفاً في مسابقة «بنتاس PAI» بمنطقة كاديفاتين",
    excerpt:
      "بفوزهم في فروع متعدّدة، أظهر الطلاب تميّزاً في العلوم الشرعية وفي بناء الشخصية الإسلامية.",
  },
  "marhaban-ya-ramadhan-1447": {
    title:
      "مرحباً يا رمضان: موسمٌ لتطهير القلب وتقوية الإيمان وتوثيق أواصر التكافل",
    excerpt:
      "مع إطلالة رمضان ١٤٤٧هـ، يوجّه رئيس المؤسسة رسالته إلى الطلاب والأساتذة وأولياء الأمور والمجتمع: اجعلوه شهر تربيةٍ روحية لا عادةً سنوية.",
  },
};

/** Indonesian is the source of record, read straight back out of content.ts. */
const ID: Record<string, NewsText> = Object.fromEntries(
  articles.map((a) => [a.slug, { title: a.title, excerpt: a.excerpt }]),
);

const BY_LOCALE: Record<Locale, Record<string, NewsText>> = {
  id: ID,
  en: EN,
  ar: AR,
};

/**
 * Falls back to the Indonesian headline for a slug with no translation yet, so
 * a newly published article appears everywhere instead of vanishing from the
 * English and Arabic homepages.
 */
export function newsTextFor(
  locale: Locale,
  slug: string,
): NewsText | undefined {
  return (BY_LOCALE[locale] ?? ID)[slug] ?? ID[slug];
}
