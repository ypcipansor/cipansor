"use client";

import Link from "next/link";
import { Edit, Mail, Phone, Trash2 } from "lucide-react";
import { id } from "date-fns/locale";
import {
  BOARD_MEMBER_POSITIONS,
  boardMemberOrgan,
  type BoardMember,
  type BoardOrgan,
} from "@cipansor/shared";
import { safeFormat } from "@/lib/date";
import { personInitials } from "@/lib/person-initials";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** The order UU 16/2001 names them in, and what each organ is for. */
const ORGANS: Array<{ organ: BoardOrgan; title: string; role: string }> = [
  {
    organ: "pembina",
    title: "Pembina",
    role: "Kewenangan yang tidak diserahkan kepada Pengurus atau Pengawas (UU Yayasan Ps. 28)",
  },
  {
    organ: "pengurus",
    title: "Pengurus",
    role: "Melaksanakan kepengurusan yayasan (Ps. 31)",
  },
  {
    organ: "pengawas",
    title: "Pengawas",
    role: "Mengawasi dan memberi nasihat kepada Pengurus (Ps. 40)",
  },
];

const rank = (position: string) => {
  const i = (BOARD_MEMBER_POSITIONS as readonly string[]).indexOf(
    position.trim(),
  );
  return i === -1 ? BOARD_MEMBER_POSITIONS.length : i;
};

/** Ketua before Sekretaris before Bendahara; equals in the order recorded. */
function byOffice(a: BoardMember, b: BoardMember) {
  return (
    rank(a.position) - rank(b.position) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/**
 * The members of the yayasan's three organs who hold office now, grouped by
 * organ. A start date is shown only where one was entered — never a guess.
 */
export function BoardOrgans({
  members,
  onDelete,
}: {
  members: BoardMember[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      {ORGANS.map(({ organ, title, role }) => {
        const inOrgan = members
          .filter((m) => boardMemberOrgan(m.position) === organ)
          .sort(byOffice);
        return (
          <section
            key={organ}
            data-testid={`board-organ-${organ}`}
            className="space-y-3"
          >
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{role}</p>
            </div>
            {inOrgan.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada yang dicatat.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inOrgan.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    showPosition={member.position !== title}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MemberCard({
  member,
  showPosition,
  onDelete,
}: {
  member: BoardMember;
  showPosition: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <Card data-testid="board-member">
      <CardContent className="flex h-full flex-col pt-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14">
            {member.photoUrl && <AvatarImage src={member.photoUrl} alt="" />}
            <AvatarFallback>{personInitials(member.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-balance">{member.name}</h4>
            {showPosition && (
              <p className="text-sm text-muted-foreground">{member.position}</p>
            )}
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {member.phone && (
                <p className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {member.phone}
                </p>
              )}
              {member.email && (
                <p className="flex items-center gap-1 break-all">
                  <Mail className="h-3 w-3 shrink-0" />
                  {member.email}
                </p>
              )}
              {member.startDate && (
                <p className="text-xs">
                  Sejak{" "}
                  {safeFormat(new Date(member.startDate), "d MMMM yyyy", {
                    locale: id,
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/foundation/board/${member.id}/edit`}
              aria-label={`Edit ${member.name}`}
            >
              <Edit className="h-4 w-4" />
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Hapus ${member.name}`}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus {member.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Kalau masa jabatannya berakhir, sunting dan hapus centang
                  &ldquo;Masih menjabat&rdquo; — riwayatnya tetap tersimpan.
                  Menghapus tidak dapat dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(member.id)}>
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
