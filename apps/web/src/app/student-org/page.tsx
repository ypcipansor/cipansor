"use client";
import { MainLayout } from "@/components/layout";

import { useStudentOrgs } from "@/hooks/student-org/use-student-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

function StudentOrgPageContent() {
  const { data: orgs, isLoading } = useStudentOrgs();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Student Governance</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          orgs?.map((org) => (
            <Card key={org.id}>
              <CardHeader>
                <CardTitle>{org.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {org.description}
                </p>
                <h4 className="font-semibold mb-2 text-sm">
                  Positions & Members:
                </h4>
                <div className="space-y-2">
                  {org.positions.map((pos: any) => (
                    <div key={pos.id} className="text-sm border-l-2 pl-2">
                      <span className="font-medium">{pos.name}:</span>
                      <ul className="list-disc list-inside ml-2">
                        {pos.members.map((m: any) => (
                          <li key={m.id}>
                            <Link
                              href={`/student-org/members/${m.id}`}
                              className="text-primary hover:underline"
                            >
                              {m.student.user.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function StudentOrgPageWithShell() {
  return (
    <MainLayout>
      <StudentOrgPageContent />
    </MainLayout>
  );
}
