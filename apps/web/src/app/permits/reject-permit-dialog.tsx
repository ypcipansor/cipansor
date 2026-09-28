"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRejectPermit } from "@/hooks/use-permits";

/**
 * Reject with a reason — the wali reads it in their notification. The detail
 * page used to reject with a fixed "Ditolak oleh admin".
 */
export function RejectPermitDialog({
  permitId,
  onClose,
}: {
  permitId: string | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const reject = useRejectPermit();

  const close = () => {
    setNote("");
    onClose();
  };

  const submit = async () => {
    if (!permitId) return;
    try {
      await reject.mutateAsync({ id: permitId, rejectionNote: note.trim() });
      toast.success("Izin ditolak");
      close();
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <Dialog open={!!permitId} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tolak izin</DialogTitle>
          <DialogDescription>
            Alasan penolakan dikirim ke wali.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rejection-note">Alasan penolakan</Label>
            <Textarea
              id="rejection-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tuliskan alasan penolakan…"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={submit}
              disabled={reject.isPending || note.trim().length < 3}
            >
              {reject.isPending ? "Menolak…" : "Tolak"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
