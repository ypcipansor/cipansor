import { SecretList } from "@/components/system-secrets/secret-list";
import { Separator } from "@/components/ui/separator";
import { MainLayout } from "@/components/layout";

function SecretsPageContent() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium">System Secrets</h3>
        <p className="text-sm text-muted-foreground">
          Manage encrypted system secrets and API keys.
        </p>
      </div>
      <Separator />
      <SecretList />
    </div>
  );
}

export default function SecretsPage() {
  return (
    <MainLayout>
      <SecretsPageContent />
    </MainLayout>
  );
}
