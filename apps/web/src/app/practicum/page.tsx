"use client";

import { useLessonPlans } from "@/hooks/practicum/use-practicum";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { MainLayout } from "@/components/layout";

function PracticumPageContent() {
  const { data: lessonPlans, isLoading } = useLessonPlans();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Practicum (Amaliyah Tadris)</h1>
        <Link
          href="/practicum/new"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md"
        >
          Create Lesson Plan
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Lesson Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lessonPlans?.map((lp) => (
                  <TableRow key={lp.id}>
                    <TableCell>{lp.subject}</TableCell>
                    <TableCell>{lp.topic}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {lp.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/practicum/${lp.id}`}
                        className="text-primary hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PracticumPage() {
  return (
    <MainLayout>
      <PracticumPageContent />
    </MainLayout>
  );
}
