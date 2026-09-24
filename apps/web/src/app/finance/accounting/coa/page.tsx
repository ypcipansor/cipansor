"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Pencil, Trash2, Search, Database } from "lucide-react";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useSeedAccounts,
  AccountCode,
} from "@/hooks/use-accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { MainLayout } from "@/components/layout";

const accountFormSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.string().min(1, "Type is required"),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  parentId: z.string().optional(),
  cashFlowCategory: z.string().optional(),
  isActive: z.boolean(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

function ChartOfAccountsPageContent() {
  const [search, setSearch] = useState("");
  const { data: accounts, isLoading } = useAccounts({ search });
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const seedAccounts = useSeedAccounts();

  const [isOpen, setIsOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountCode | null>(
    null,
  );

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      code: "",
      name: "",
      type: "ASSET",
      normalBalance: "DEBIT",
      isActive: true,
    },
  });

  const onSubmit = async (data: AccountFormValues) => {
    try {
      if (editingAccount) {
        await updateAccount.mutateAsync({ id: editingAccount.id, data });
        toast.success("Account updated successfully");
      } else {
        await createAccount.mutateAsync(data);
        toast.success("Account created successfully");
      }
      setIsOpen(false);
      form.reset();
      setEditingAccount(null);
    } catch (error) {
      toast.error("Failed to save account");
    }
  };

  const handleEdit = (account: AccountCode) => {
    setEditingAccount(account);
    form.reset({
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
      parentId: account.parentId || undefined,
      cashFlowCategory: account.cashFlowCategory || undefined,
      isActive: account.isActive,
    });
    setIsOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this account?")) {
      try {
        await deleteAccount.mutateAsync(id);
        toast.success("Account deleted successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete account");
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setEditingAccount(null);
      form.reset({
        code: "",
        name: "",
        type: "ASSET",
        normalBalance: "DEBIT",
        isActive: true,
      });
    }
  };

  const handleSeed = async () => {
    if (
      confirm(
        "This will create default accounts if they don't exist. Continue?",
      )
    ) {
      try {
        await seedAccounts.mutateAsync();
        toast.success("Default accounts seeded successfully");
      } catch (error) {
        toast.error("Failed to seed accounts");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Chart of Accounts
          </h2>
          <p className="text-muted-foreground">
            Manage your financial accounts and hierarchy.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSeed}
            disabled={seedAccounts.isPending}
          >
            <Database className="mr-2 h-4 w-4" />
            {seedAccounts.isPending ? "Seeding..." : "Seed Defaults"}
          </Button>
          <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Account
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingAccount ? "Edit Account" : "Add Account"}
                </DialogTitle>
                <DialogDescription>
                  Configure the account details below.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Code</FormLabel>
                          <FormControl>
                            <Input placeholder="1-100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ASSET">Asset</SelectItem>
                              <SelectItem value="LIABILITY">
                                Liability
                              </SelectItem>
                              <SelectItem value="EQUITY">Equity</SelectItem>
                              <SelectItem value="REVENUE">Revenue</SelectItem>
                              <SelectItem value="EXPENSE">Expense</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Cash in Bank" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="normalBalance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Normal Balance</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select balance" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="DEBIT">Debit</SelectItem>
                              <SelectItem value="CREDIT">Credit</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="parentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parent Account</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Optional" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="root">None (Root)</SelectItem>
                              {accounts
                                ?.filter((a) => a.id !== editingAccount?.id)
                                .map((acc) => (
                                  <SelectItem key={acc.id} value={acc.id}>
                                    {acc.code} - {acc.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter>
                    <Button type="submit">Save Account</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Normal Bal</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : accounts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24">
                  No accounts found.
                </TableCell>
              </TableRow>
            ) : (
              accounts?.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.code}</TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{account.type}</Badge>
                  </TableCell>
                  <TableCell>{account.normalBalance}</TableCell>
                  <TableCell>
                    {account.parent ? (
                      <span className="text-muted-foreground">
                        {account.parent.code} - {account.parent.name}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={account.isActive ? "secondary" : "destructive"}
                    >
                      {account.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(account)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function ChartOfAccountsPage() {
  return (
    <MainLayout>
      <ChartOfAccountsPageContent />
    </MainLayout>
  );
}
