# PANDUAN DEPLOYMENT MICROSOFT AZURE ($2.000 NONPROFITS GRANT)
## Yayasan Pesantren Cipansor

Dokumen ini berisi panduan langkah demi langkah untuk mendeploy Sistem Informasi Cipansor ke infrastruktur cloud **Microsoft Azure** secara **Gratis ($0/tahun)** memanfaatkan grant tahunan **USD 2,000 / tahun (Microsoft for Nonprofits Grant)**.

---

## 1. PRASYARAT AKUN & LISENSI
1. Akun **Microsoft for Nonprofits** yang sudah disetujui untuk domain `@cipansor.or.id`.
2. Akun **Azure Sponsorship** (terhubung dengan Grant USD 2,000).
3. **Azure CLI** terpasang di komputer lokal atau menggunakan **Azure Cloud Shell**.

---

## 2. ARSITEKTUR INFRASTRUKTUR AZURE
* **Resource Group:** `rg-cipansor-prod` (Region: `Southeast Asia` / Singapura)
* **Compute / Hosting:** **Azure App Service (Linux Web App for Containers)** atau **Azure Container Apps**
  - Container 1: `cipansor-api` (Express 5 REST API + Socket.IO)
  - Container 2: `cipansor-web` (Next.js 16 App Router)
* **Database:** **Azure Database for PostgreSQL (Flexible Server)** (B1ms burstable, 32GB storage)
* **Storage:** **Azure Blob Storage Account** (`cipansorstore`)
  - Container `e-office-documents` (PDF Surat & E-Sign)
  - Container `student-documents` (Berkas Santri & PPDB)
  - Container `media-public` (Foto Galeri & Banner)

---

## 3. LANGKAH-LANGKAH DEPLOYMENT

### Langkah 1: Login ke Azure CLI & Buat Resource Group
```bash
az login
az group create --name rg-cipansor-prod --location southeastasia
```

### Langkah 2: Buat Azure Container Registry (ACR)
```bash
az acr create --resource-group rg-cipansor-prod --name acrcipansor --sku Basic --admin-enabled true
az acr login --name acrcipansor
```

### Langkah 3: Build & Push Image Docker
Di direktori utama repository Cipansor:
```bash
# Build & Push API Image
docker build -t acrcipansor.azurecr.io/cipansor-api:latest -f apps/api/Dockerfile .
docker push acrcipansor.azurecr.io/cipansor-api:latest

# Build & Push Web Image
docker build -t acrcipansor.azurecr.io/cipansor-web:latest -f apps/web/Dockerfile .
docker push acrcipansor.azurecr.io/cipansor-web:latest
```

### Langkah 4: Buat Azure Database for PostgreSQL Flexible Server
Catatan Keamanan: Gunakan password acak yang kuat dan simpan di Azure Key Vault / environment variable lokal. Jangan pernah menyimpan password dalam bentuk plaintext.

```bash
# Generate password acak yang aman
DB_PASS=$(openssl rand -base64 24)

az postgres flexible-server create \
  --resource-group rg-cipansor-prod \
  --name db-cipansor-prod \
  --location southeastasia \
  --admin-user cipansoradmin \
  --admin-password "$DB_PASS" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32
```

### Langkah 5: Buat Azure Blob Storage Account
```bash
az storage account create \
  --name cipansorstore \
  --resource-group rg-cipansor-prod \
  --location southeastasia \
  --sku Standard_LRS

# Buat Container Blob Storage
az storage container create --name e-office-documents --account-name cipansorstore
az storage container create --name student-documents --account-name cipansorstore
az storage container create --name media-public --account-name cipansorstore
```

### Langkah 6: Deploy App Service untuk API & Web
```bash
# Buat App Service Plan
az appservice plan create \
  --name plan-cipansor-prod \
  --resource-group rg-cipansor-prod \
  --is-linux \
  --sku B1

# Deploy Web App untuk Backend API
az webapp create \
  --resource-group rg-cipansor-prod \
  --plan plan-cipansor-prod \
  --name app-cipansor-api \
  --deployment-container-image-name acrcipansor.azurecr.io/cipansor-api:latest

# Deploy Web App untuk Frontend Next.js
az webapp create \
  --resource-group rg-cipansor-prod \
  --plan plan-cipansor-prod \
  --name app-cipansor-web \
  --deployment-container-image-name acrcipansor.azurecr.io/cipansor-web:latest
```

### Langkah 7: Konfigurasi Environment Variables (App Settings)
Atur variabel lingkungan di Azure Portal atau via CLI (disarankan mereferensikan rahasia dari Azure Key Vault `@Microsoft.KeyVault(...)`):
```bash
az webapp config appsettings set --resource-group rg-cipansor-prod --name app-cipansor-api --settings \
  DATABASE_URL="postgresql://cipansoradmin:${DB_PASS}@db-cipansor-prod.postgres.database.azure.com:5432/cipansor?sslmode=require" \
  AZURE_STORAGE_ACCOUNT="cipansorstore" \
  AZURE_STORAGE_CONNECTION_STRING="${AZURE_STORAGE_CONNECTION_STRING}" \
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}" \
  MICROSOFT_CLIENT_ID="${MICROSOFT_CLIENT_ID}" \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="${GOOGLE_SERVICE_ACCOUNT_EMAIL}" \
  GMAIL_SENDER="noreply@cipansor.or.id" \
  JWT_SECRET="${JWT_SECRET}"
```

---

## 4. ESTIMASI BIAYA & GRANTS MONITORING
Dengan spesifikasi di atas:
* **PostgreSQL Flexible Server (B1ms):** ~$15 / bulan
* **App Service Plan (B1 Linux):** ~$13 / bulan
* **Azure Container Registry (Basic):** ~$5 / bulan
* **Azure Blob Storage (Standard 50GB):** ~$2 / bulan
* **Total Biaya Bulanan:** **~$35 / bulan (~$420 / tahun)**

Grant USD 2,000 per tahun dari Microsoft for Nonprofits akan menutup 100% biaya ini dengan **sisa saldo saldo grant ~$1,580/tahun** yang dapat digunakan untuk scaling tambahan (seperti Redis Cache atau Azure AI).
