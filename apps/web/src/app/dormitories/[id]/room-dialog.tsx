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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateRoom, useUpdateRoom, type Room } from "@/hooks/use-dormitory";

/**
 * Add a kamar to an asrama, or change one. The API refuses a name the asrama
 * already has, and a capacity below the santri already living there; its
 * message is what the person sees.
 */
export function RoomDialog({
  dormitoryId,
  dormitoryName,
  room,
  open,
  onOpenChange,
}: {
  dormitoryId: string;
  dormitoryName: string;
  /** The kamar being changed; absent when adding one. */
  room?: Room;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {room ? `Ubah ${room.name}` : "Tambah Kamar"}
          </DialogTitle>
          <DialogDescription>
            {room
              ? `Kamar di ${dormitoryName}`
              : `Tambahkan kamar ke ${dormitoryName}`}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so that opening it for another kamar starts from that kamar. */}
        {open && (
          <RoomFields
            key={room?.id ?? "new"}
            dormitoryId={dormitoryId}
            room={room}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoomFields({
  dormitoryId,
  room,
  onDone,
}: {
  dormitoryId: string;
  room?: Room;
  onDone: () => void;
}) {
  const [name, setName] = useState(room?.name ?? "");
  const [floor, setFloor] = useState(String(room?.floor ?? 1));
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 4));
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const saving = create.isPending || update.isPending;

  const save = async () => {
    const figures = {
      name: name.trim(),
      floor: Number(floor),
      capacity: Number(capacity),
    };
    if (!figures.name) {
      toast.error("Nama kamar wajib diisi");
      return;
    }
    if (!Number.isInteger(figures.floor) || figures.floor < 1) {
      toast.error("Lantai minimal 1");
      return;
    }
    if (!Number.isInteger(figures.capacity) || figures.capacity < 1) {
      toast.error("Kapasitas minimal 1");
      return;
    }
    try {
      if (room) {
        await update.mutateAsync({ id: room.id, data: figures });
        toast.success("Kamar diperbarui");
      } else {
        await create.mutateAsync({ ...figures, dormitoryId });
        toast.success("Kamar ditambahkan");
      }
      onDone();
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="room-name">Nama Kamar</Label>
        <Input
          id="room-name"
          placeholder="Kamar 101"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="room-floor">Lantai</Label>
          <Input
            id="room-floor"
            type="number"
            min={1}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-capacity">Kapasitas</Label>
          <Input
            id="room-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
