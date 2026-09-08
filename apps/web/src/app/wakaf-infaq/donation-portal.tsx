"use client";
import Image from "next/image";
import { donationConfig } from "@/config/site";
import { LegalIdentity } from "@/components/landing/legal-identity";
import { publicContentFor } from "@/config/content.i18n";
import {
  donationContentFor,
  ANONYMOUS_DONOR_NAME,
  type DonationContent,
} from "@/config/donation.i18n";
import type { Locale } from "@/locales";
import { intlTagFor } from "@/lib/locale-format";
import { useI18n } from "@/providers/i18n-provider";
import { useState } from "react";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  usePublicCampaigns,
  useCreatePublicDonation,
  DONATION_TYPES,
  PAYMENT_METHODS,
  DonationType,
  PaymentMethod,
  DonationCampaign,
  formatCurrency,
  calculateProgress,
} from "@/hooks/use-donation";
import {
  Heart,
  HandHeart,
  GraduationCap,
  Users,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Banknote,
  CreditCard,
  QrCode,
  Wallet,
  Gift,
  Building2,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

const paymentIcons: Record<
  PaymentMethod,
  React.ComponentType<{ className?: string }>
> = {
  CASH: Banknote,
  BANK_TRANSFER: Building2,
  QRIS: QrCode,
  EWALLET: Wallet,
  OTHERS: CreditCard,
};

/**
 * One icon per program, keyed by akad. Every card previously rendered the same
 * HandHeart, so the icons distinguished nothing and were pure decoration —
 * the same flaw that made the old eight-card "Jenis Donasi" grid useless.
 */
const programIcons: Record<string, React.ComponentType<{ className?: string }>> =
  {
    WAKAF: Building2,
    BEASISWA: GraduationCap,
    INFAK: HandHeart,
  };

export function DonationPortal({
  photo,
}: {
  /**
   * A photograph of what the wakaf is actually paying for.
   *
   * The hero opened with a HandHeart icon, which is a drawing of generosity
   * rather than evidence of it. A donor deciding whether to send money — and
   * a nonprofit programme deciding whether this organisation is real — are
   * both better served by the half-finished building itself. Resolved on the
   * server so the alt text follows the visitor's locale.
   */
  photo: { src: string; alt: string };
}) {
  // Client component, so the locale comes from the hook rather than the cookie
  // read — the same content module either way.
  const { locale } = useI18n();
  const copy = donationContentFor(locale);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    donorName: string;
    amount: number;
  } | null>(null);

  const [formData, setFormData] = useState({
    donorName: "",
    donorPhone: "",
    donorEmail: "",
    donorAddress: "",
    isAnonymous: false,
    type: "INFAK" as DonationType,
    amount: "",
    paymentMethod: "BANK_TRANSFER" as PaymentMethod,
    notes: "",
  });

  const { data: campaignsData, isLoading } = usePublicCampaigns();
  const campaigns = campaignsData?.data || [];
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");

  const createDonation = useCreatePublicDonation();
  const turnstile = useTurnstile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.donorName.trim() && !formData.isAnonymous) {
      toast.error(copy.form.errorNameRequired);
      return;
    }

    if (!formData.amount || parseInt(formData.amount) < 10000) {
      toast.error(copy.form.errorMinimum(formatCurrency(10000)));
      return;
    }

    if (!turnstile.ready) return;

    setIsSubmitting(true);
    try {
      await createDonation.mutateAsync({
        turnstileToken: turnstile.token ?? undefined,
        campaignId: selectedCampaignId || undefined,
        donorName: formData.isAnonymous ? ANONYMOUS_DONOR_NAME : formData.donorName,
        donorPhone: formData.donorPhone || undefined,
        donorEmail: formData.donorEmail || undefined,
        donorAddress: formData.donorAddress || undefined,
        isAnonymous: formData.isAnonymous,
        type: formData.type,
        amount: parseInt(formData.amount),
        paymentMethod: formData.paymentMethod,
        notes: formData.notes || undefined,
      });

      setSuccessData({
        donorName: formData.isAnonymous ? ANONYMOUS_DONOR_NAME : formData.donorName,
        amount: parseInt(formData.amount),
      });

      // Reset form
      setFormData({
        donorName: "",
        donorPhone: "",
        donorEmail: "",
        donorAddress: "",
        isAnonymous: false,
        type: "INFAK",
        amount: "",
        paymentMethod: "BANK_TRANSFER",
        notes: "",
      });
      setSelectedCampaignId(null);
      setShowForm(false);
    } catch {
      toast.error(copy.form.errorFailed);
      // Token sekali pakai; percobaan berikutnya butuh tantangan baru.
      turnstile.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickAmounts = [50000, 100000, 250000, 500000, 1000000, 2500000];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">

      {/* Hero. Copy follows the yayasan's own "Investasi Akhirat" campaign
          material rather than generic donation wording. */}
      <section className="bg-emerald-600 text-white pb-20 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <HandHeart className="h-16 w-16 mx-auto mb-6 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-bold mb-2 text-balance">
            {copy.hero.headline}
          </h1>
          <p className="text-xl text-emerald-100 mb-6">
            {copy.hero.subheadline}
          </p>
          <p className="text-lg text-emerald-100 max-w-2xl mx-auto mb-8 text-pretty">
            {copy.hero.lead}
          </p>
          <Button
            size="lg"
            className="bg-white text-emerald-600 hover:bg-emerald-50"
            onClick={() => {
              setSelectedCampaignId(null);
              setShowForm(true);
            }}
          >
            <Gift className="h-5 w-5 mr-2" />
            {copy.hero.cta}
          </Button>

          <figure className="mx-auto mt-10 max-w-4xl">
            <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-white/25 shadow-xl">
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 896px"
                className="object-cover"
              />
            </div>
            <figcaption className="mt-3 text-sm text-emerald-100">
              {photo.alt}
            </figcaption>
          </figure>
        </div>
      </section>

      {/*
        No negative top margin. The `-mt-12` here used to float a statistics
        card over the hero, and when that card was removed the next element —
        a plain dark heading — was pulled onto the emerald background and
        rendered dark-on-green. Overlapping the hero makes the layout depend
        on what the first child happens to be, and on whether the data that
        renders it exists at all. A normal margin cannot break that way.
      */}
      {/* A section, not a <main>: wakaf-infaq/page.tsx already wraps this
          component in the page's <main id="main-content">, and nesting two
          landmarks is invalid. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        {/*
          Aggregate fundraising figures ("Total Donatur 25+", "Total Terkumpul
          Rp 125.000.000") used to sit here. They were read from the seeded demo
          campaign, not from real giving — the `donations` table held a different
          number entirely — and the "+" implied "lebih dari" on a figure that was
          exact. Publishing invented fundraising totals on a nonprofit's donation
          page is misrepresentation, and Google Ad Grants suspends accounts for
          it. The same rule is already written at the top of `config/site.ts`.

          A card counting the open campaigns also used to sit here. Above a
          grid of exactly that many campaign cards, it told the reader nothing
          they could not see.
        */}

        {/*
          Campaigns are time-bound appeals, and there are usually none. The
          section is omitted entirely when the list is empty rather than
          showing "Belum ada kampanye aktif" — an empty state directly under
          the hero reads as a dormant organisation, which is the opposite of
          what a donation page is for, and it pushed the three standing
          programs (the actual way to give) below the fold. Nothing is lost by
          omitting it: the hero and every program card open the same form.
        */}
        {(isLoading || activeCampaigns.length > 0) && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{copy.campaigns.heading}</h2>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-80" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeCampaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    copy={copy.campaigns}
                    locale={locale}
                    onDonate={() => {
                      setSelectedCampaignId(campaign.id);
                      setShowForm(true);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/*
          A separate "Jenis Donasi" grid of eight akad used to sit here, above
          the three published programs. It gave the page two competing
          taxonomies with nothing explaining how they related — a donor could
          not tell whether to pick a "jenis" or a "program" — and all eight
          cards carried the same heart icon, so the grid conveyed nothing the
          labels did not. The akad is still selectable inside the donation form,
          where it belongs. The three programs below are now the page-level
          choice, which is what "Cara Berdonasi" step 1 actually instructs.
        */}

        {/* Bank Info */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-2">
            {copy.programs.heading}
          </h2>
          <p className="mx-auto mb-6 max-w-2xl text-center text-muted-foreground">
            {copy.programs.intro}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {donationConfig.programs.map((program) => {
              const ProgramIcon = programIcons[program.type] ?? HandHeart;
              const text = copy.programs.byType[program.type];
              return (
              <Card
                key={program.type}
                className="flex flex-col bg-white transition-shadow hover:shadow-lg"
              >
                <CardHeader>
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
                    <ProgramIcon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">
                    {text?.title ?? program.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <CardDescription className="flex-1 text-base leading-relaxed">
                    {text?.description ?? program.description}
                  </CardDescription>
                  {/* "Pilih Program" is step 1 of Cara Berdonasi — so it has to
                      be clickable. These cards were inert text while a
                      different grid was the interactive one. */}
                  <Button
                    variant="outline"
                    className="mt-5 w-full"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        type: program.type as DonationType,
                      });
                      setSelectedCampaignId(null);
                      setShowForm(true);
                    }}
                  >
                    {copy.programs.chooseCta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
              );
            })}
          </div>

          <Card className="bg-emerald-50 border-emerald-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {copy.bank.heading}
              </CardTitle>
              <CardDescription>{copy.bank.subheading}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/*
                Account number is sourced from the pesantren's own wakaf-infaq
                page via donationConfig. Do not replace with placeholder digits.
              */}
              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-lg mb-2">
                  {donationConfig.bank.name}
                </p>
                <p className="text-2xl font-mono font-bold text-emerald-600 mb-1">
                  {donationConfig.bank.accountNumber}
                </p>
                <p className="text-sm text-muted-foreground">
                  {copy.bank.accountHolderPrefix}{" "}
                  {donationConfig.bank.accountHolder}
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border space-y-3">
                <p className="font-semibold">{copy.bank.confirmHeading}</p>
                <p className="text-sm text-muted-foreground">
                  {copy.bank.confirmIntro}{" "}
                  <span className="font-mono font-medium text-foreground">
                    {donationConfig.confirmation.format}
                  </span>
                  . {copy.bank.exampleLabel}{" "}
                  <span className="font-mono text-foreground">
                    {donationConfig.confirmation.example}
                  </span>
                  .
                </p>
                <a
                  href={`https://wa.me/${donationConfig.confirmation.whatsappE164}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-medium text-emerald-600 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {copy.bank.whatsappCta}{" "}
                  {donationConfig.confirmation.whatsappNumber}
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Cara Berdonasi + trust, taken from the yayasan's donation poster.
            The transparency pledge is the reassurance a first-time donor looks
            for, and it was missing from the page entirely. */}
        <section className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{copy.steps.heading}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {copy.steps.items.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700"
                    >
                      {new Intl.NumberFormat(intlTagFor(locale)).format(i + 1)}
                    </span>
                    <div>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="bg-emerald-50 border-emerald-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                {copy.commitment.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="leading-relaxed text-muted-foreground">
                {copy.commitment.text}
              </p>
              {copy.scriptureNotice && (
                <p className="text-xs text-muted-foreground">
                  {copy.scriptureNotice}
                </p>
              )}
              <blockquote
                lang="id"
                className="border-l-4 border-emerald-300 pl-4 text-sm italic text-muted-foreground"
              >
                &ldquo;{donationConfig.hadith.text}&rdquo;
                <footer className="mt-1 not-italic">
                  ({donationConfig.hadith.source})
                </footer>
              </blockquote>
            </CardContent>
          </Card>
        </section>

        {/* A donor deciding whether to transfer money is exactly who needs the
            registration number and independent verification. */}
        <section className="mb-12">
          <LegalIdentity
            variant="donation"
            copy={publicContentFor(locale).legalIdentity}
          />
        </section>

        {/*
          A "Butuh Bantuan?" card repeating the phone number and email used to
          sit here — directly above the site footer, which already lists both,
          plus WhatsApp and the address. Two copies of the same contact details
          one scroll apart is noise, and the footer's version is more complete.
        */}
      </section>

      {/* Closing verse. Not a footer — the site footer is supplied by the
          page wrapper; this used to be a second one with a stale copyright. */}
      <section className="bg-gray-900 py-10 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <p lang="id" className="text-sm leading-relaxed text-gray-300">
            &ldquo;Perumpamaan orang yang menginfakkan hartanya di jalan Allah
            seperti sebutir biji yang menumbuhkan tujuh tangkai, pada setiap
            tangkai ada seratus biji.&rdquo;
          </p>
          <p className="mt-2 text-xs text-gray-500">QS. Al-Baqarah: 261</p>
        </div>
      </section>

      {/* Donation Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-emerald-600" />
              {copy.form.title}
            </DialogTitle>
            <DialogDescription>{copy.form.description}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {/* Quick Amount */}
            <div className="space-y-2">
              <Label>{copy.form.amountLabel}</Label>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant={
                      formData.amount === String(amount) ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      setFormData({ ...formData, amount: String(amount) })
                    }
                  >
                    {formatCurrency(amount)}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                placeholder={copy.form.amountPlaceholder}
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                min={10000}
              />
            </div>

            {/* Donation Type */}
            <div className="space-y-2">
              <Label>{copy.form.typeLabel}</Label>
              <Select
                value={formData.type}
                onValueChange={(v) =>
                  setFormData({ ...formData, type: v as DonationType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DONATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {copy.donationTypes[type.value] ?? type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Anonymous Toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isAnonymous"
                checked={formData.isAnonymous}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isAnonymous: checked as boolean })
                }
              />
              <Label htmlFor="isAnonymous" className="cursor-pointer">
                {copy.form.anonymousLabel}
              </Label>
            </div>

            {/* Donor Info */}
            {!formData.isAnonymous && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="donorName">{copy.form.nameLabel}</Label>
                  <Input
                    id="donorName"
                    value={formData.donorName}
                    onChange={(e) =>
                      setFormData({ ...formData, donorName: e.target.value })
                    }
                    placeholder={copy.form.namePlaceholder}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="donorPhone">{copy.form.phoneLabel}</Label>
                    <Input
                      id="donorPhone"
                      value={formData.donorPhone}
                      onChange={(e) =>
                        setFormData({ ...formData, donorPhone: e.target.value })
                      }
                      placeholder={copy.form.phonePlaceholder}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="donorEmail">{copy.form.emailLabel}</Label>
                    <Input
                      id="donorEmail"
                      type="email"
                      value={formData.donorEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, donorEmail: e.target.value })
                      }
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>{copy.form.paymentLabel}</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = paymentIcons[method.value];
                  return (
                    <Button
                      key={method.value}
                      type="button"
                      variant={
                        formData.paymentMethod === method.value
                          ? "default"
                          : "outline"
                      }
                      className="justify-start"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          paymentMethod: method.value,
                        })
                      }
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {copy.paymentMethods[method.value] ?? method.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">{copy.form.notesLabel}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder={copy.form.notesPlaceholder}
                rows={2}
              />
            </div>

            <TurnstileWidget action="donasi" {...turnstile.widgetProps} />

            <Button
              type="submit"
              disabled={isSubmitting || !turnstile.ready}
              className="w-full"
            >
              {isSubmitting ? copy.form.submitting : copy.form.submit}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!successData} onOpenChange={() => setSuccessData(null)}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="py-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {copy.success.heading}
            </h3>
            {/* One string, not a prefix glued to a <strong> — the name does
                not sit in the same place in every language. */}
            <p className="font-medium text-muted-foreground mb-4">
              {copy.success.thanks(successData?.donorName ?? "")}
            </p>
            <p className="text-2xl font-bold text-emerald-600 mb-4">
              {successData && formatCurrency(successData.amount)}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              {copy.success.body}
            </p>
            <Button onClick={() => setSuccessData(null)} className="w-full">
              {copy.success.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignCard({
  campaign,
  copy,
  locale,
  onDonate,
}: {
  campaign: DonationCampaign;
  copy: DonationContent["campaigns"];
  locale: Locale;
  onDonate: () => void;
}) {
  const progress = calculateProgress(
    campaign.collectedAmount,
    campaign.targetAmount,
  );

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="h-40 bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
        <Heart className="h-16 w-16 text-white/50" />
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg line-clamp-2">
            {campaign.title}
          </CardTitle>
          <Badge className="bg-emerald-100 text-emerald-800 shrink-0">
            {copy.activeBadge}
          </Badge>
        </div>
        {campaign.description && (
          <CardDescription className="line-clamp-2">
            {campaign.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-emerald-600">
              {formatCurrency(campaign.collectedAmount)}
            </span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {copy.targetLabel}: {formatCurrency(campaign.targetAmount)}
          </p>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {copy.donors(
              new Intl.NumberFormat(intlTagFor(locale)).format(
                campaign.donorCount,
              ),
            )}
          </span>
          {campaign.endDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {copy.untilPrefix}{" "}
              {/* The campaign end date followed Indonesian month names in
                  every locale; it now follows the reader's. */}
              {new Intl.DateTimeFormat(intlTagFor(locale), {
                day: "numeric",
                month: "short",
                timeZone: "Asia/Jakarta",
              }).format(new Date(campaign.endDate))}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={onDonate} className="w-full">
          {copy.donateCta}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
}
