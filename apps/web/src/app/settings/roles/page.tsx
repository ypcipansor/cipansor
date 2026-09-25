"use client";

import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useRoles,
  realmDisplayNames,
  realmColors,
  groupRolesByRealm,
} from "@/hooks/use-roles";
import { Plus, Shield, Pencil } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PermissionScopeNotice } from "@/components/roles/permission-scope-notice";

export default function RolesPage() {
  const { data: roles, isLoading } = useRoles();

  const rolesByRealm = roles ? groupRolesByRealm(roles) : {};

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title="Roles & Permissions"
          description="Manage system roles and their access rights"
        >
          <Button asChild>
            <Link href="/settings/roles/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Role
            </Link>
          </Button>
        </PageHeader>

        <PermissionScopeNotice />

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(rolesByRealm).map(([realm, realmRoles]) => (
              <div key={realm} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className={cn(realmColors[realm])}>
                    {realmDisplayNames[realm] || realm}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {realmRoles.length} roles
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {realmRoles.map((role) => (
                    <Card key={role.id} className="flex flex-col">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base">
                          <span className="truncate" title={role.name}>
                            {role.name}
                          </span>
                          <Link href={`/settings/roles/${role.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                        </CardTitle>
                        <CardDescription className="line-clamp-2 min-h-[40px]">
                          {role.description || "No description"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto pt-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Shield className="h-3 w-3" />
                          <span>
                            {(role.permissions as string[])?.length || 0}{" "}
                            permissions
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
