"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useMarketingStats,
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useRecentLeads,
  useUpcomingFollowUps,
  useHighPriorityLeads,
  useAdmissionFunnel,
  useMarketingRoiTrend,
} from "@/hooks/use-marketing";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Loader2,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Target,
  Users,
  TrendingUp,
  Megaphone,
  Globe,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  Banknote,
  BarChart3,
  PieChart as PieChartIcon,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { MarketingCampaign } from "@cipansor/shared";

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
];

const CHANNEL_OPTIONS = [
  { value: "SOCIAL_MEDIA", label: "Media Sosial", icon: Globe },
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageSquare },
  { value: "WEBSITE", label: "Website", icon: Globe },
  { value: "REFERRAL", label: "Referral", icon: Users },
  { value: "EVENT", label: "Event", icon: Calendar },
  { value: "PHONE", label: "Telepon", icon: Phone },
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "OTHER", label: "Lainnya", icon: Megaphone },
];

interface Campaign {
  id: string;
  code: string;
  name: string;
  description?: string;
  channel: string;
  startDate: string;
  endDate?: string;
  budget?: number;
  isActive: boolean;
  registrantCount?: number;
  conversionRate?: number;
  createdAt: string;
}

export default function MarketingDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stats, isLoading: loadingStats } = useMarketingStats(
    user?.unitId,
  );
  const { data: campaigns, isLoading: loadingCampaigns } = useCampaigns(
    user?.unitId,
  );
  const { data: recentLeads } = useRecentLeads(user?.unitId);
  const { data: followUps } = useUpcomingFollowUps(user?.unitId);
  const { data: highPriorityLeads } = useHighPriorityLeads(user?.unitId);
  const { data: funnel } = useAdmissionFunnel();
  const { data: roiTrend = [] } = useMarketingRoiTrend(6);
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();

  const [campaignForm, setCampaignForm] = useState({
    code: "",
    name: "",
    description: "",
    channel: "SOCIAL_MEDIA",
    startDate: safeFormat(new Date(), "yyyy-MM-dd"),
    endDate: "",
    budget: 0,
    isActive: true,
  });

  const resetForm = () => {
    setCampaignForm({
      code: "",
      name: "",
      description: "",
      channel: "SOCIAL_MEDIA",
      startDate: safeFormat(new Date(), "yyyy-MM-dd"),
      endDate: "",
      budget: 0,
      isActive: true,
    });
    setEditingCampaign(null);
  };

  const handleCreateCampaign = async () => {
    if (!campaignForm.code || !campaignForm.name) {
      toast.error("Kode dan nama kampanye wajib diisi");
      return;
    }

    try {
      if (editingCampaign) {
        await updateCampaign.mutateAsync({
          id: editingCampaign.id,
          data: campaignForm,
        });
        toast.success("Kampanye berhasil diperbarui");
      } else {
        await createCampaign.mutateAsync({
          ...campaignForm,
          unitId: user?.unitId || "",
        });
        toast.success("Kampanye berhasil dibuat");
      }
      setShowCreateDialog(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Gagal menyimpan kampanye");
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      code: campaign.code,
      name: campaign.name,
      description: campaign.description || "",
      channel: campaign.channel,
      startDate: safeFormat(new Date(campaign.startDate), "yyyy-MM-dd"),
      endDate: campaign.endDate
        ? safeFormat(new Date(campaign.endDate), "yyyy-MM-dd")
        : "",
      budget: campaign.budget || 0,
      isActive: campaign.isActive,
    });
    setShowCreateDialog(true);
  };

  const copyTrackingLink = (code: string, id?: string) => {
    const link = `${window.location.origin}/public/spmb?campaign_id=${id || ""}&source=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link tracking berhasil disalin");
  };

  const filteredCampaigns =
    campaigns?.filter(
      (c: MarketingCampaign) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

  const getChannelBadge = (channel: string) => {
    const option = CHANNEL_OPTIONS.find((o) => o.value === channel);
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        {option?.icon && <option.icon className="h-3 w-3" />}
        {option?.label || channel}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loadingStats) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing & PSB</h1>
          <p className="text-muted-foreground">
            Kelola kampanye marketing dan lacak sumber pendaftar
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Buat Kampanye
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Pendaftar
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.sources?.reduce((sum, s) => sum + s.count, 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">Dari semua sumber</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Kampanye Aktif
            </CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns?.filter((c: MarketingCampaign) => c.isActive).length ||
                0}
            </div>
            <p className="text-xs text-muted-foreground">
              Dari {campaigns?.length || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Channel</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.sources?.[0]?.source || "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.sources?.[0]?.count || 0} pendaftar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Konversi Rata-rata
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.topCampaigns && stats.topCampaigns.length > 0
                ? Math.round(
                    stats.topCampaigns.reduce(
                      (sum, c) => sum + ((c as any).conversionRate || 0),
                      0,
                    ) / stats.topCampaigns.length,
                  )
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">Lead to Registrant</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">
            <BarChart3 className="mr-2 h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="leads">
            <Users className="mr-2 h-4 w-4" />
            Leads & Prioritas
          </TabsTrigger>
          <TabsTrigger value="campaigns">
            <Megaphone className="mr-2 h-4 w-4" />
            Kampanye
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <PieChartIcon className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Priority Leads Highlight */}
          {highPriorityLeads && highPriorityLeads.length > 0 && (
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Target className="w-5 h-5 text-orange-500" />
                    <CardTitle>Prioritas Tindak Lanjut</CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-orange-50 text-orange-700 border-orange-200"
                  >
                    {highPriorityLeads.length} Lead Skor Tinggi
                  </Badge>
                </div>
                <CardDescription>
                  Lead dengan probabilitas konversi tinggi berdasarkan profil
                  dan minat
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {highPriorityLeads.slice(0, 3).map((lead: any) => (
                    <div
                      key={lead.id}
                      className="p-3 rounded-lg border bg-orange-50/30 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-sm">
                          {lead.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lead.source} • {lead.quranAbility}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-orange-600">
                          Score: {lead.leadScore}
                        </div>
                        <Link
                          href={`/marketing/leads/${lead.id}`}
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          Detail →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sumber Pendaftar</CardTitle>
                <CardDescription>
                  Distribusi berdasarkan channel
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {stats?.sources && stats.sources.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.sources}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }: any) =>
                          `${name || "Direct"} ${(percent * 100).toFixed(0)}%`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="count"
                        nameKey="source"
                      >
                        {stats.sources.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Belum ada data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performa Kampanye (Top 5)</CardTitle>
                <CardDescription>Berdasarkan jumlah pendaftar</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {stats?.topCampaigns && stats.topCampaigns.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.topCampaigns}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="code" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="registrants"
                        fill="#8884d8"
                        name="Pendaftar"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Belum ada data kampanye
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* New Row: Leads & Tasks */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Leads Widget */}
            <Card>
              <CardHeader>
                <CardTitle>Leads Terbaru</CardTitle>
                <CardDescription>Pendaftar yang baru masuk</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Kampanye</TableHead>
                      <TableHead className="text-right">Tanggal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLeads?.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="font-medium">{lead.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {lead.status}
                          </div>
                        </TableCell>
                        <TableCell>
                          {lead.campaign ? (
                            <Badge variant="outline" className="text-xs">
                              {lead.campaign.code}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {safeFormat(new Date(lead.createdAt), "d MMM", {
                            locale: localeId,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!recentLeads?.length && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          Belum ada leads baru
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="mt-4 text-center">
                  <Button variant="link" size="sm" asChild>
                    <Link href="/marketing/leads">Lihat Semua →</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Follow-ups Widget */}
            <Card>
              <CardHeader>
                <CardTitle>Tugas Follow-up</CardTitle>
                <CardDescription>
                  Jadwal tindak lanjut mendatang
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {followUps?.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                    >
                      <div>
                        <div className="font-medium text-sm">
                          {task.registrant.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          <span>{task.registrant.parentPhone}</span>
                          <span>•</span>
                          <span>
                            {format(
                              new Date(task.nextActionDate),
                              "d MMM HH:mm",
                              { locale: localeId },
                            )}
                          </span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/marketing/leads/${task.registrant.id}`}>
                          Detail
                        </Link>
                      </Button>
                    </div>
                  ))}
                  {!followUps?.length && (
                    <div className="text-center text-muted-foreground py-4">
                      Tidak ada tugas follow-up
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Kampanye Aktif</CardTitle>
              <CardDescription>Kampanye yang sedang berjalan</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredCampaigns.filter((c: MarketingCampaign) => c.isActive)
                  .length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Tidak ada kampanye aktif
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {filteredCampaigns
                    .filter((c: MarketingCampaign) => c.isActive)
                    .slice(0, 6)
                    .map((campaign: MarketingCampaign) => (
                      <Card key={campaign.id} className="relative">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <Badge variant="outline" className="mb-2">
                                {campaign.code}
                              </Badge>
                              <h4 className="font-semibold">{campaign.name}</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {format(
                                  new Date(campaign.startDate),
                                  "dd MMM yyyy",
                                  { locale: localeId },
                                )}
                                {campaign.endDate &&
                                  ` - ${safeFormat(new Date(campaign.endDate), "dd MMM yyyy", { locale: localeId })}`}
                              </p>
                            </div>
                            {getChannelBadge((campaign as any).channel)}
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-sm">
                              <span className="text-2xl font-bold">
                                {campaign._count?.registrants || 0}
                              </span>
                              <span className="text-muted-foreground ml-1">
                                pendaftar
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyTrackingLink(campaign.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Semua Leads & Prospek</CardTitle>
                <CardDescription>
                  Daftar pendaftar potensial yang perlu di-follow up
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Skor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLeads?.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="font-medium">{lead.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {lead.source}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              lead.leadScore && lead.leadScore > 70
                                ? "default"
                                : "outline"
                            }
                          >
                            {lead.leadScore || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>{lead.status}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/marketing/leads/${lead.id}`}>
                              Detail
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Follow-up Hari Ini</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {followUps?.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="p-3 border rounded-lg flex flex-col gap-1"
                    >
                      <div className="font-medium text-sm">
                        {task.registrant.fullName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {safeFormat(new Date(task.nextActionDate), "HH:mm")} •{" "}
                        {task.registrant.parentPhone}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Daftar Kampanye</CardTitle>
                  <CardDescription>
                    Kelola semua kampanye marketing
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari kampanye..."
                      className="pl-8 w-[200px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Belum ada kampanye
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Budget</TableHead>
                      <TableHead className="text-right">Pendaftar</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map((campaign: MarketingCampaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">
                          {campaign.code}
                        </TableCell>
                        <TableCell>{campaign.name}</TableCell>
                        <TableCell>
                          {getChannelBadge((campaign as any).channel)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {safeFormat(
                              new Date(campaign.startDate),
                              "dd/MM/yy",
                            )}
                            {campaign.endDate &&
                              ` - ${safeFormat(new Date(campaign.endDate), "dd/MM/yy")}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {campaign.budget
                            ? formatCurrency(campaign.budget)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {campaign._count?.registrants || 0}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              campaign.isActive ? "default" : "secondary"
                            }
                          >
                            {campaign.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  handleEditCampaign(campaign as any)
                                }
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => copyTrackingLink(campaign.code, campaign.id)}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Salin Link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  window.open(
                                    `/public/spmb?campaign_id=${campaign.id}&source=${campaign.code}`,
                                    "_blank",
                                  )
                                }
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Buka Link
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sumber Pendaftar Detail</CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.sources?.map((source, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                      <span>{source.source || "Direct"}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold">{source.count}</span>
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {Math.round(
                          (source.count /
                            (stats?.sources?.reduce(
                              (sum, s) => sum + s.count,
                              0,
                            ) || 1)) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Kampanye Detail</CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.topCampaigns?.map((campaign, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <span className="font-medium">{campaign.code}</span>
                      <p className="text-sm text-muted-foreground">
                        {campaign.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">
                        {campaign.registrants}
                      </span>
                      <p className="text-xs text-muted-foreground">pendaftar</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Admission Funnel (real pipeline data) */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Funnel Penerimaan</CardTitle>
                <CardDescription>
                  Perjalanan pendaftar dari daftar sampai daftar ulang
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!funnel || funnel.stages[0]?.reached === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Belum ada data pendaftar.
                  </p>
                ) : (
                  <>
                    {funnel.stages.map((stage) => (
                      <div key={stage.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{stage.label}</span>
                          <span className="font-semibold">
                            {stage.reached}{" "}
                            <span className="text-muted-foreground font-normal">
                              ({stage.conversionFromStart}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${stage.conversionFromStart}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">
                      Ditolak: {funnel.dropOff.rejected} • Dibatalkan:{" "}
                      {funnel.dropOff.cancelled}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pendapatan Teratribusi Kampanye</CardTitle>
                <CardDescription>
                  Pembayaran dari santri hasil kampanye, 6 bulan terakhir
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roiTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={(v: number) =>
                          `${Math.round(v / 1000000)}jt`
                        }
                      />
                      <Tooltip
                        formatter={(value) =>
                          new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0,
                          }).format(Number(value))
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Pendapatan"
                        stroke="#6366f1"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Campaign Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setShowCreateDialog(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? "Edit Kampanye" : "Buat Kampanye Baru"}
            </DialogTitle>
            <DialogDescription>
              {editingCampaign
                ? "Perbarui informasi kampanye marketing"
                : "Buat kampanye baru untuk tracking sumber pendaftar"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode Kampanye*</Label>
                <Input
                  value={campaignForm.code}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="PSB2026-IG"
                  disabled={!!editingCampaign}
                />
                <p className="text-xs text-muted-foreground">
                  Kode unik untuk tracking
                </p>
              </div>
              <div className="space-y-2">
                <Label>Channel*</Label>
                <Select
                  value={campaignForm.channel}
                  onValueChange={(v) =>
                    setCampaignForm({ ...campaignForm, channel: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <option.icon className="h-4 w-4" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nama Kampanye*</Label>
              <Input
                value={campaignForm.name}
                onChange={(e) =>
                  setCampaignForm({ ...campaignForm, name: e.target.value })
                }
                placeholder="Kampanye Instagram PSB 2026"
              />
            </div>

            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea
                value={campaignForm.description}
                onChange={(e) =>
                  setCampaignForm({
                    ...campaignForm,
                    description: e.target.value,
                  })
                }
                placeholder="Deskripsi kampanye (opsional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal Mulai*</Label>
                <Input
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      startDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Selesai</Label>
                <Input
                  type="date"
                  value={campaignForm.endDate}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      endDate: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Budget (Rp)</Label>
              <Input
                type="number"
                value={campaignForm.budget}
                onChange={(e) =>
                  setCampaignForm({
                    ...campaignForm,
                    budget: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={campaignForm.isActive}
                onCheckedChange={(checked) =>
                  setCampaignForm({ ...campaignForm, isActive: checked })
                }
              />
              <Label htmlFor="isActive">Kampanye Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleCreateCampaign}
              disabled={createCampaign.isPending || updateCampaign.isPending}
            >
              {createCampaign.isPending || updateCampaign.isPending
                ? "Menyimpan..."
                : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
