"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "@/constants/permissions";
import { PermissionScopeNotice } from "./permission-scope-notice";

interface PermissionSelectorProps {
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
  readOnly?: boolean;
}

export function PermissionSelector({
  selectedPermissions,
  onChange,
  readOnly = false,
}: PermissionSelectorProps) {
  const handleToggle = (permission: string) => {
    if (readOnly) return;

    if (selectedPermissions.includes(permission)) {
      onChange(selectedPermissions.filter((p) => p !== permission));
    } else {
      onChange([...selectedPermissions, permission]);
    }
  };

  const handleGroupToggle = (group: string, permissions: readonly string[]) => {
    if (readOnly) return;

    const allSelected = permissions.every((p) =>
      selectedPermissions.includes(p),
    );

    if (allSelected) {
      // Deselect all
      onChange(selectedPermissions.filter((p) => !permissions.includes(p)));
    } else {
      // Select all (add missing ones)
      const toAdd = permissions.filter((p) => !selectedPermissions.includes(p));
      onChange([...selectedPermissions, ...toAdd]);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <PermissionScopeNotice />
      <h3 className="font-medium text-sm">Permissions</h3>
      <Accordion
        type="multiple"
        defaultValue={Object.keys(PERMISSION_GROUPS)}
        className="w-full"
      >
        {Object.entries(PERMISSION_GROUPS).map(([group, permissions]) => {
          const allSelected = permissions.every((p) =>
            selectedPermissions.includes(p),
          );
          const someSelected = permissions.some((p) =>
            selectedPermissions.includes(p),
          );

          return (
            <AccordionItem key={group} value={group}>
              <div className="flex items-center space-x-2 py-2">
                {!readOnly && (
                  <Checkbox
                    id={`group-${group}`}
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() =>
                      handleGroupToggle(group, permissions)
                    }
                  />
                )}
                <AccordionTrigger className="hover:no-underline py-0 flex-1">
                  <span className="font-medium capitalize">
                    {group.toLowerCase().replace("_", " ")}
                  </span>
                </AccordionTrigger>
              </div>
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6 pt-2">
                  {permissions.map((permission) => (
                    <div
                      key={permission}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={permission}
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => handleToggle(permission)}
                        disabled={readOnly}
                      />
                      <Label
                        htmlFor={permission}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {PERMISSION_LABELS[permission] || permission}
                      </Label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
