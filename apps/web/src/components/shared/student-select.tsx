"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useStudentSearch } from "@/hooks/use-students";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface StudentSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  unitId?: string;
  className?: string;
}

export function StudentSelect({
  value,
  onValueChange,
  unitId,
  className,
}: StudentSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedLabel, setSelectedLabel] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Search query
  const { data: students, isLoading } = useStudentSearch(
    debouncedSearch,
    unitId,
  );

  // Update internal label when selection is made from the list
  // or if the current value is found in the search results
  React.useEffect(() => {
    if (value && students) {
      const found = students.find((s) => s.id === value);
      if (found) {
        setSelectedLabel(found.name);
      }
    } else if (!value) {
      setSelectedLabel("");
    }
  }, [value, students]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {value && selectedLabel ? selectedLabel : "Pilih santri..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cari nama santri..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.length < 2
                ? "Ketik minimal 2 karakter..."
                : isLoading
                  ? "Mencari..."
                  : "Santri tidak ditemukan."}
            </CommandEmpty>
            <CommandGroup>
              {students?.map((student) => (
                <CommandItem
                  key={student.id}
                  value={student.name}
                  onSelect={() => {
                    onValueChange(student.id);
                    setSelectedLabel(student.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === student.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{student.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {student.nisn} - {student.unit?.name || "-"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
