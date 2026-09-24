"use client";

import { useOrgTree } from "@/hooks/use-organisasi";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";

function OrgChartNode({ node }: { node: any }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center">
      <div className="w-64 border rounded-xl shadow-lg bg-card text-card-foreground p-4 text-center m-2 hover:shadow-xl transition-shadow relative">
        <Badge variant="outline" className="mb-2 bg-muted/50">
          {node.code}
        </Badge>
        <h3 className="font-bold text-sm mb-1">{node.name}</h3>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {node.description || "Tidak ada deskripsi"}
        </p>

        {node.positions?.length > 0 && (
          <div className="space-y-2 mt-3 pt-3 border-t">
            {node.positions.map((p: any) => (
              <div
                key={p.id}
                onClick={() => router.push(`/organisasi/posisi/${p.id}`)}
                className="text-xs p-2 rounded-md bg-secondary/50 hover:bg-primary hover:text-primary-foreground cursor-pointer transition-colors text-left flex justify-between items-center"
              >
                <span className="font-medium truncate pr-2">{p.title}</span>
                <span className="opacity-70 text-[10px] shrink-0">
                  {p.holder ? p.holder.name : "Kosong"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {node.children?.length > 0 && (
        <>
          <div className="w-px h-6 bg-border"></div>
          <div className="flex relative pt-4">
            {/* Top connecting line for children */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[calc(100%-16rem)] h-px bg-border hidden md:block"></div>

            {node.children.map((child: any, idx: number) => (
              <div
                key={child.id}
                className="flex flex-col items-center relative px-2"
              >
                <div className="absolute top-0 left-1/2 w-px h-4 -mt-4 bg-border"></div>
                <OrgChartNode node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrgTreeVisualizationPageContent() {
  const { data: orgTree, isLoading } = useOrgTree();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Visualisasi Struktur Organisasi"
        description="Peta hierarki unit dan jabatan secara interaktif."
        breadcrumbs={[
          { label: "Organisasi", href: "/organisasi" },
          { label: "Struktur Hierarki" },
        ]}
      />

      <div className="min-h-[600px] w-full overflow-x-auto bg-muted/20 border rounded-xl p-8 flex justify-center items-start">
        {isLoading ? (
          <div className="flex items-center justify-center p-20">
            <Skeleton className="h-32 w-64 rounded-xl" />
          </div>
        ) : orgTree?.length === 0 || !orgTree ? (
          <div className="text-center text-muted-foreground p-20">
            Belum ada data struktur organisasi.
          </div>
        ) : (
          <div className="inline-block pb-20">
            {orgTree.map((root: any) => (
              <OrgChartNode key={root.id} node={root} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrgTreeVisualizationPage() {
  return (
    <MainLayout>
      <OrgTreeVisualizationPageContent />
    </MainLayout>
  );
}
