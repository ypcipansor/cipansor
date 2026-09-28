import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";

/**
 * Says plainly what the permission ticks on this screen do and do not govern.
 *
 * Measured on 2026-09-25: only a handful of API routes read `roles.permissions`
 * (`hasPermission`); the rest, the sidebar and the web routes still decide by
 * the legacy bucket. A Super Admin who unticks a permission expecting to
 * revoke access would be wrong, and nothing on the screen said so. Remove this
 * notice when Model A (a permission per feature, roadmap §1.2) lands.
 */
export function PermissionScopeNotice() {
  return (
    <Alert variant="warning" data-testid="permission-scope-notice">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Izin di sini belum mengatur semua akses</AlertTitle>
      <AlertDescription>
        Baru sebagian kecil fitur yang membaca izin ini. Menu dan sebagian besar
        halaman masih ditentukan jenis peran (admin, guru, staf, siswa, orang
        tua), jadi membuat peran baru atau menghapus centang belum tentu
        menambah atau mencabut akses. Untuk mencabut akses seseorang sepenuhnya,
        nonaktifkan akunnya; itu berlaku paling lambat 15 menit. Hak akses per
        fitur sedang dirancang.
      </AlertDescription>
    </Alert>
  );
}
