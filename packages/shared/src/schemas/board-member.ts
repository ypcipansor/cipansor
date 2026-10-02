import { z } from "zod";

/**
 * A member of one of the yayasan's organs (Pembina, Pengawas, Pengurus), as
 * the API stores it in `board_members` and the portal's Organ Yayasan tab
 * lists it.
 */
export interface BoardMember {
  id: string;
  foundationId: string;
  name: string;
  /** "Pembina", "Pengawas", or a Pengurus office: "Ketua", "Sekretaris", … */
  position: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  /** ISO date-time; null until an admin enters it from the appointment deed. */
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The fields of POST /foundation/board-members, shared by the API's
 * validation and the portal's add/edit forms. Dates are calendar days
 * (`2026-10-02`), the shape a date input gives; a start date nobody knows is
 * left out rather than guessed.
 */
export const boardMemberFields = {
  name: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(100, "Nama maksimal 100 karakter"),
  position: z
    .string()
    .trim()
    .min(2, "Jabatan minimal 2 karakter")
    .max(50, "Jabatan maksimal 50 karakter"),
  phone: z.string().trim().max(20, "Nomor telepon maksimal 20 karakter"),
  email: z.email({ message: "Email tidak valid" }),
  startDate: z.iso.date({ message: "Tanggal tidak valid" }),
  endDate: z.iso.date({ message: "Tanggal tidak valid" }),
};

/**
 * Positions the portal suggests, in the order a list shows them; others are
 * allowed, count as Pengurus and come last.
 */
export const BOARD_MEMBER_POSITIONS = [
  "Ketua Pembina",
  "Pembina",
  "Ketua",
  "Wakil Ketua",
  "Sekretaris",
  "Bendahara",
  "Ketua Pengawas",
  "Pengawas",
] as const;

export type BoardOrgan = "pembina" | "pengawas" | "pengurus";

/**
 * The organ a position belongs to (UU 16/2001: Pembina, Pengurus, Pengawas),
 * for grouping a list of members. "Ketua Pembina" is a Pembina, not the Ketua
 * of the Pengurus.
 */
export function boardMemberOrgan(position: string): BoardOrgan {
  const words = position.toLowerCase().split(/[^a-z]+/);
  if (words.includes("pembina")) return "pembina";
  if (words.includes("pengawas")) return "pengawas";
  return "pengurus";
}
