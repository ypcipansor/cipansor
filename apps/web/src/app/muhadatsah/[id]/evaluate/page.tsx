"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  MessageSquare,
  Save,
  Star,
  Clock,
  Languages,
  Users,
  MessageCircle,
  BookOpen,
  FileText,
  Volume2,
  User,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  useMuhadatsahDetail,
  useEvaluateMuhadatsah,
  getLanguageLabel,
  getGradeColor,
} from "@/hooks/use-muhadatsah";

// Scoring components for Muhadatsah
const SCORING_COMPONENTS = [
  {
    key: "fluency",
    label: "Kelancaran",
    labelEn: "Fluency",
    description: "Kemampuan berbicara dengan lancar tanpa terlalu banyak jeda",
    icon: MessageCircle,
  },
  {
    key: "grammar",
    label: "Tata Bahasa",
    labelEn: "Grammar",
    description: "Ketepatan penggunaan struktur kalimat dan kaidah bahasa",
    icon: BookOpen,
  },
  {
    key: "vocabulary",
    label: "Kosa Kata",
    labelEn: "Vocabulary",
    description: "Penggunaan kosa kata yang tepat dan beragam",
    icon: FileText,
  },
  {
    key: "pronunciation",
    label: "Pengucapan",
    labelEn: "Pronunciation",
    description: "Kejelasan dan ketepatan pengucapan kata",
    icon: Volume2,
  },
];

// Calculate grade from score
const calculateGrade = (score: number): { grade: string; label: string } => {
  if (score >= 86) return { grade: "A", label: "Mumtaz (Istimewa)" };
  if (score >= 71) return { grade: "B", label: "Jayyid Jiddan (Sangat Baik)" };
  if (score >= 56) return { grade: "C", label: "Jayyid (Baik)" };
  if (score >= 41) return { grade: "D", label: "Maqbul (Cukup)" };
  return { grade: "E", label: "Rasib (Perlu Peningkatan)" };
};

// Student evaluation interface
interface StudentEvaluation {
  fluency: number;
  grammar: number;
  vocabulary: number;
  pronunciation: number;
}

export default function EvaluateMuhadatsahPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Student 1 scores
  const [student1Scores, setStudent1Scores] = useState<StudentEvaluation>({
    fluency: 75,
    grammar: 75,
    vocabulary: 75,
    pronunciation: 75,
  });

  // Student 2 / Partner scores
  const [student2Scores, setStudent2Scores] = useState<StudentEvaluation>({
    fluency: 75,
    grammar: 75,
    vocabulary: 75,
    pronunciation: 75,
  });

  const [duration, setDuration] = useState("10");
  const [feedback, setFeedback] = useState("");
  const [activeTab, setActiveTab] = useState("student1");

  const { data: muhadatsah, isLoading, error } = useMuhadatsahDetail(id);
  const evaluateMuhadatsah = useEvaluateMuhadatsah();

  // Calculate averages
  const student1Average = useMemo(() => {
    const total = Object.values(student1Scores).reduce((a, b) => a + b, 0);
    return Math.round(total / 4);
  }, [student1Scores]);

  const student2Average = useMemo(() => {
    const total = Object.values(student2Scores).reduce((a, b) => a + b, 0);
    return Math.round(total / 4);
  }, [student2Scores]);

  const overallAverage = useMemo(() => {
    if (!muhadatsah?.partner) return student1Average;
    return Math.round((student1Average + student2Average) / 2);
  }, [student1Average, student2Average, muhadatsah?.partner]);

  const student1Grade = calculateGrade(student1Average);
  const student2Grade = calculateGrade(student2Average);
  const overallGrade = calculateGrade(overallAverage);

  // Handle submit
  const handleSubmit = async () => {
    try {
      const input = {
        fluencyScore: student1Scores.fluency,
        grammarScore: student1Scores.grammar,
        vocabularyScore: student1Scores.vocabulary,
        pronunciationScore: student1Scores.pronunciation,
        feedback,
        duration: parseInt(duration),
      };

      await evaluateMuhadatsah.mutateAsync({
        id,
        input,
      });

      toast.success("Penilaian muhadatsah berhasil disimpan");
      router.push(`/muhadatsah/${id}`);
    } catch (error) {
      toast.error("Gagal menyimpan penilaian");
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="mb-6">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-[400px] w-full rounded-lg" />
          </div>
          <div>
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (error || !muhadatsah) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-lg font-semibold mb-2">Data Tidak Ditemukan</h2>
          <p className="text-muted-foreground mb-4">
            Muhadatsah yang Anda cari tidak ditemukan.
          </p>
          <Button asChild>
            <Link href="/muhadatsah">Kembali ke Daftar</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const hasPartner = !!muhadatsah.partner;

  // Render scoring sliders for a student
  const renderScoringSliders = (
    scores: StudentEvaluation,
    setScores: React.Dispatch<React.SetStateAction<StudentEvaluation>>,
    studentName: string,
  ) => (
    <div className="space-y-6">
      {SCORING_COMPONENTS.map((component) => {
        const score = scores[component.key as keyof StudentEvaluation];
        const gradeInfo = calculateGrade(score);
        return (
          <div key={component.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <component.icon className="h-4 w-4 text-primary" />
                <Label className="font-medium">
                  {component.label} ({component.labelEn})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{score}</span>
                <Badge className={getGradeColor(gradeInfo.grade)}>
                  {gradeInfo.grade}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {component.description}
            </p>
            <Slider
              value={[score]}
              min={0}
              max={100}
              step={1}
              onValueChange={(value) =>
                setScores((prev) => ({ ...prev, [component.key]: value[0] }))
              }
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (Rasib)</span>
              <span>50 (Maqbul)</span>
              <span>100 (Mumtaz)</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href={`/muhadatsah/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Link>
        </Button>
        <PageHeader
          title="Penilaian Muhadatsah"
          description={`Evaluasi sesi percakapan ${getLanguageLabel(muhadatsah.language)}`}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content - Scoring */}
        <div className="md:col-span-2 space-y-6">
          {/* Participants Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Peserta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`grid gap-4 ${hasPartner ? "md:grid-cols-2" : ""}`}
              >
                {/* Student 1 */}
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {muhadatsah.student?.name
                        ?.split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{muhadatsah.student?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {muhadatsah.student?.nisn}
                    </p>
                  </div>
                  <Badge variant="outline">Santri 1</Badge>
                </div>

                {/* Partner */}
                {hasPartner && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {muhadatsah.partner?.name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{muhadatsah.partner?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {muhadatsah.partner?.nisn}
                      </p>
                    </div>
                    <Badge variant="outline">Partner</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Scoring Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Komponen Penilaian
              </CardTitle>
              <CardDescription>
                Geser slider untuk memberikan nilai pada setiap komponen (0-100)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasPartner ? (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="student1"
                      className="flex items-center gap-2"
                    >
                      <User className="h-4 w-4" />
                      {muhadatsah.student?.name?.split(" ")[0]}
                      <Badge variant="secondary" className="ml-1">
                        {student1Average}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="student2"
                      className="flex items-center gap-2"
                    >
                      <User className="h-4 w-4" />
                      {muhadatsah.partner?.name?.split(" ")[0]}
                      <Badge variant="secondary" className="ml-1">
                        {student2Average}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                  <div className="mt-6">
                    <TabsContent value="student1">
                      {renderScoringSliders(
                        student1Scores,
                        setStudent1Scores,
                        muhadatsah.student?.name || "Santri 1",
                      )}
                    </TabsContent>
                    <TabsContent value="student2">
                      {renderScoringSliders(
                        student2Scores,
                        setStudent2Scores,
                        muhadatsah.partner?.name || "Partner",
                      )}
                    </TabsContent>
                  </div>
                </Tabs>
              ) : (
                renderScoringSliders(
                  student1Scores,
                  setStudent1Scores,
                  muhadatsah.student?.name || "Santri",
                )
              )}
            </CardContent>
          </Card>

          {/* Duration & Feedback */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Informasi Tambahan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Duration */}
              <div className="space-y-2">
                <Label htmlFor="duration" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Durasi Percakapan
                </Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 menit</SelectItem>
                    <SelectItem value="10">10 menit</SelectItem>
                    <SelectItem value="15">15 menit</SelectItem>
                    <SelectItem value="20">20 menit</SelectItem>
                    <SelectItem value="25">25 menit</SelectItem>
                    <SelectItem value="30">30 menit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Feedback */}
              <div className="space-y-2">
                <Label htmlFor="feedback">Catatan & Feedback</Label>
                <Textarea
                  id="feedback"
                  placeholder="Berikan catatan atau masukan untuk santri..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Summary */}
        <div className="space-y-6">
          {/* Session Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Info Sesi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {getLanguageLabel(muhadatsah.language)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {format(
                    new Date(muhadatsah.scheduledAt),
                    "dd MMMM yyyy, HH:mm",
                    {
                      locale: localeId,
                    },
                  )}
                </span>
              </div>
              {muhadatsah.topic && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm">{muhadatsah.topic}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Ringkasan Nilai
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Individual Scores */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {muhadatsah.student?.name?.split(" ")[0]}
                    </p>
                    <p className="text-2xl font-bold">{student1Average}</p>
                  </div>
                  <Badge className={getGradeColor(student1Grade.grade)}>
                    {student1Grade.grade}
                  </Badge>
                </div>

                {hasPartner && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {muhadatsah.partner?.name?.split(" ")[0]}
                      </p>
                      <p className="text-2xl font-bold">{student2Average}</p>
                    </div>
                    <Badge className={getGradeColor(student2Grade.grade)}>
                      {student2Grade.grade}
                    </Badge>
                  </div>
                )}
              </div>

              <Separator />

              {/* Overall Score */}
              <div className="text-center p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  Nilai Rata-rata
                </p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl font-bold">{overallAverage}</span>
                  <Badge
                    className={`text-lg ${getGradeColor(overallGrade.grade)}`}
                  >
                    {overallGrade.grade}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {overallGrade.label}
                </p>
              </div>

              {/* Grade Legend */}
              <div className="grid grid-cols-5 gap-1 text-center text-xs">
                {[
                  { grade: "A", range: "86+" },
                  { grade: "B", range: "71-85" },
                  { grade: "C", range: "56-70" },
                  { grade: "D", range: "41-55" },
                  { grade: "E", range: "0-40" },
                ].map((g) => (
                  <div key={g.grade} className="p-1 bg-muted rounded">
                    <span className="font-bold">{g.grade}</span>
                    <p className="text-muted-foreground">{g.range}</p>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={evaluateMuhadatsah.isPending}
                >
                  {evaluateMuhadatsah.isPending ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Simpan Penilaian
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.back()}
                >
                  Batal
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">📝 Panduan Penilaian</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  <strong>Kelancaran:</strong> Tidak banyak jeda, alur lancar
                </li>
                <li>
                  <strong>Tata Bahasa:</strong> Struktur kalimat tepat
                </li>
                <li>
                  <strong>Kosa Kata:</strong> Kata-kata beragam & tepat
                </li>
                <li>
                  <strong>Pengucapan:</strong> Jelas dan mudah dipahami
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
