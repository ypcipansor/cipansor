"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PageHeader } from "@/components/shared/page-header";
import { useAuthStore } from "@/stores/auth";
import { useQuery } from "@tanstack/react-query";
import { useCreateRisk } from "@/hooks/use-risk";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getEffectiveRole } from "@/lib/rbac";
import { MainLayout } from "@/components/layout";

const RiskCategory = [
  "STRATEGIC",
  "FINANCIAL",
  "OPERATIONAL",
  "COMPLIANCE",
  "REPUTATIONAL",
  "SAFETY",
  "OTHER",
] as const;
const RiskLikelihood = [
  "RARE",
  "UNLIKELY",
  "POSSIBLE",
  "LIKELY",
  "ALMOST_CERTAIN",
] as const;
const RiskImpact = [
  "INSIGNIFICANT",
  "MINOR",
  "MODERATE",
  "MAJOR",
  "CATASTROPHIC",
] as const;

const formSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.enum(RiskCategory),
  cause: z.string().optional(),
  consequence: z.string().optional(),
  likelihood: z.enum(RiskLikelihood),
  impact: z.enum(RiskImpact),
  unitId: z.string().optional(),
  strategicPlanId: z.string().optional(),
});

const PRIVILEGED_ROLES = ["SUPER_ADMIN", "YAYASAN_KETUA"];

function CreateRiskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const strategicPlanId = searchParams?.get("strategicPlanId") || undefined;
  const { user } = useAuthStore();
  const createRisk = useCreateRisk();

  const role = getEffectiveRole(user);
  const isPrivileged = !!role && PRIVILEGED_ROLES.includes(role);

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const res = await api.get("/units");
      return res.data.data; // Assuming response structure { data: Unit[] }
    },
    enabled: !!isPrivileged,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      description: "",
      category: "OPERATIONAL",
      cause: "",
      consequence: "",
      likelihood: "POSSIBLE",
      impact: "MODERATE",
      unitId: "", // Optional, only required for privileged users without context
      strategicPlanId,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // If privileged and no unit selected, validation on backend will fail if unitId is required.
    // We can add client side validation here if we want strictness.
    if (isPrivileged && !values.unitId) {
      form.setError("unitId", { message: "Unit is required for admin users" });
      return;
    }

    // Strip empty string so backend UUID validation passes
    const payload = { ...values };
    if (payload.unitId === "") {
      delete payload.unitId;
    }

    try {
      await createRisk.mutateAsync(payload);
      router.push(
        strategicPlanId
          ? `/perencanaan/${strategicPlanId}`
          : "/risk-management",
      );
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <PageHeader
        title="Create New Risk"
        description="Identify and register a new risk."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/risk-management")}
          >
            Back
          </Button>
        }
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6 mt-6 p-6 bg-white rounded-lg border shadow-sm"
        >
          {strategicPlanId && (
            <Alert className="bg-blue-50 border-blue-200">
              <InfoIcon className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">
                Ditautkan ke Perencanaan Strategis
              </AlertTitle>
              <AlertDescription className="text-blue-700">
                Risiko ini akan secara otomatis ditautkan dengan rencana
                strategis yang sedang Anda kelola.
              </AlertDescription>
            </Alert>
          )}

          {isPrivileged && (
            <FormField
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {units?.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Risk Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. RSK-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RiskCategory.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Describe the risk..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="cause"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cause</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Root cause..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consequence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Consequence</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Potential impact..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-md">
            <FormField
              control={form.control}
              name="likelihood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Likelihood</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select likelihood" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RiskLikelihood.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="impact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Impact</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select impact" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RiskImpact.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit">Create Risk</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function CreateRiskPage() {
  return (
    <MainLayout>
      <CreateRiskPageContent />
    </MainLayout>
  );
}
