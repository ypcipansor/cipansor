-- CreateEnum
CREATE TYPE "SSOProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateTable
CREATE TABLE "identity_providers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "SSOProvider" NOT NULL,
    "provider_subject_id" TEXT NOT NULL,
    "provider_email" TEXT,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "identity_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_providers_user_id_idx" ON "identity_providers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_providers_provider_provider_subject_id_key" ON "identity_providers"("provider", "provider_subject_id");

-- AddForeignKey
ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
