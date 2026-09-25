# Cipansor Makefile
# Sistem Manajemen Yayasan Pesantren Cipansor
# Memudahkan operasi Docker untuk development dan production

.PHONY: help check-prereqs install-prereqs build up down restart logs clean db-migrate db-seed test ready

# Default target
help:
	@echo "Cipansor Makefile - Sistem Manajemen Yayasan Pesantren Cipansor"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Prerequisites:"
	@echo "  check-prereqs    - Check if all required tools are installed"
	@echo "  install-prereqs  - Install missing prerequisites (Docker, Node.js, pnpm)"
	@echo ""
	@echo "Docker Operations:"
	@echo "  build            - Build all Docker images"
	@echo "  up               - Start all services (build if needed)"
	@echo "  down             - Stop all services"
	@echo "  restart          - Restart all services"
	@echo "  logs             - Show logs from all services"
	@echo "  logs-api         - Show logs from API service"
	@echo "  logs-web         - Show logs from Web service"
	@echo "  clean            - Stop and remove all containers, networks, volumes"
	@echo ""
	@echo "Database Operations:"
	@echo "  db-migrate       - Apply Prisma migrations to database"
	@echo "  db-seed          - Seed database with initial data"
	@echo "  db-reset         - Reset database (WARNING: deletes all data)"
	@echo ""
	@echo "Development:"
	@echo "  dev              - Start in development mode"
	@echo "  test             - Run all tests"
	@echo "  lint             - Run linter"
	@echo ""
	@echo "Production:"
	@echo "  ready            - Check production readiness"
	@echo "  deploy           - Deploy to production (build + up + db operations)"
	@echo ""

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Kredensial DB: ambil dari .env bila ada (parsing selektif agar value
# berkutip lain di .env tidak ikut), fallback ke default 'postgres'.
DB_USER ?= $(shell grep -E '^DB_USER=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')
DB_PASSWORD ?= $(shell grep -E '^DB_PASSWORD=' .env 2>/dev/null | cut -d= -f2- | tr -d '"')
DB_USER := $(if $(strip $(DB_USER)),$(DB_USER),postgres)
DB_PASSWORD := $(if $(strip $(DB_PASSWORD)),$(DB_PASSWORD),postgres)
DB_NAME ?= cipansor

# Check prerequisites
check-prereqs:
	@echo "$(BLUE)Checking prerequisites...$(NC)"
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)✗ Docker is not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Docker is installed$(NC)"
	@docker compose version >/dev/null 2>&1 || { echo "$(RED)✗ Docker Compose is not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Docker Compose is installed$(NC)"
	@command -v node >/dev/null 2>&1 || { echo "$(YELLOW)⚠ Node.js is not installed (optional for Docker)$(NC)"; }
	@command -v pnpm >/dev/null 2>&1 || { echo "$(YELLOW)⚠ pnpm is not installed (optional for Docker)$(NC)"; }
	@echo "$(GREEN)✓ All prerequisites met$(NC)"

# Install missing prerequisites
install-prereqs:
	@echo "$(BLUE)Installing missing prerequisites...$(NC)"
	@echo ""
	@echo "$(BLUE)Checking for Docker...$(NC)"
	@command -v docker >/dev/null 2>&1 || { \
		echo "$(YELLOW)Installing Docker...$(NC)"; \
		curl -fsSL https://get.docker.com -o get-docker.sh && \
		sudo sh get-docker.sh && \
		rm get-docker.sh && \
		echo "$(GREEN)✓ Docker installed$(NC)"; \
	} || { \
		echo "$(RED)✗ Failed to install Docker$(NC)"; \
		echo "$(YELLOW)Please install Docker manually: https://docs.docker.com/get-docker/$(NC)"; \
	}
	@echo ""
	@echo "$(BLUE)Checking for Node.js...$(NC)"
	@command -v node >/dev/null 2>&1 || { \
		echo "$(YELLOW)Installing Node.js...$(NC)"; \
		curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && \
		sudo apt-get install -y nodejs && \
		echo "$(GREEN)✓ Node.js installed$(NC)"; \
	} || { \
		echo "$(RED)✗ Failed to install Node.js$(NC)"; \
		echo "$(YELLOW)Please install Node.js manually: https://nodejs.org/$(NC)"; \
	}
	@echo ""
	@echo "$(BLUE)Checking for pnpm...$(NC)"
	@command -v pnpm >/dev/null 2>&1 || { \
		echo "$(YELLOW)Installing pnpm...$(NC)"; \
		npm install -g pnpm && \
		echo "$(GREEN)✓ pnpm installed$(NC)"; \
	} || { \
		echo "$(RED)✗ Failed to install pnpm$(NC)"; \
		echo "$(YELLOW)Please install pnpm manually: npm install -g pnpm$(NC)"; \
	}
	@echo ""
	@echo "$(GREEN)✓ Prerequisite installation completed$(NC)"
	@echo "$(YELLOW)Please run 'make check-prereqs' to verify installation$(NC)"

# Build Docker images
build: check-prereqs
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker compose build
	@echo "$(GREEN)✓ Build completed$(NC)"

# Start all services
up: check-prereqs
	@echo "$(BLUE)Starting all services...$(NC)"
	docker compose up -d
	@echo "$(GREEN)✓ Services started$(NC)"
	@echo "$(YELLOW)Waiting for services to be healthy...$(NC)"
	@sleep 15
	@$(MAKE) check-health

# Stop all services
down:
	@echo "$(BLUE)Stopping all services...$(NC)"
	docker compose down
	@echo "$(GREEN)✓ Services stopped$(NC)"

# Restart all services
restart: down up

# Show logs from all services
logs:
	docker compose logs -f

# Show logs from API service
logs-api:
	docker compose logs -f api

# Show logs from Web service
logs-web:
	docker compose logs -f web

# Clean everything
clean:
	@echo "$(YELLOW)WARNING: This will remove all containers, networks, and volumes$(NC)"
	@printf "Are you sure? [y/N] "; \
	read REPLY; \
	if [ "$$REPLY" = "y" ] || [ "$$REPLY" = "Y" ]; then \
		docker compose down -v --remove-orphans; \
		echo "$(GREEN)✓ Cleanup completed$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

# Check service health
check-health:
	@echo "$(BLUE)Checking service health...$(NC)"
	@docker compose ps | grep -q "healthy" && echo "$(GREEN)✓ Services are healthy$(NC)" || echo "$(YELLOW)⚠ Some services may not be healthy yet$(NC)"

# Apply Prisma migrations to the database.
#
# MIGRATIONS, not `prisma db push`. `db push` syncs the database to
# `schema.prisma`, and `schema.prisma` cannot express the partial unique index
# `foundation_eseals_single_active_key … WHERE revoked_at IS NULL` that
# enforces "at most one active e-seal". A `db push` database therefore silently
# omits that invariant, so the concurrent-seal regression passes locally and
# fails in production.
#
# The command runs in the `migrate` compose service (the API image's `migrate`
# target), NOT in the running API container: the runtime stage strips the Prisma
# CLI, so `docker exec cipansor-api npx prisma migrate deploy` resolved to
# nothing and exited without applying a migration. `make deploy`/`quick-start`
# also order `db-migrate` after `up`, which now waits on the same one-shot
# service via `service_completed_successfully`; this target is the manual
# re-run/entry point. See `apps/api/Dockerfile` and `docker-compose.yml`.
db-migrate:
	@echo "$(BLUE)Applying Prisma migrations to database...$(NC)"
	docker compose run --rm --no-deps --entrypoint sh migrate -c "cd /app/apps/api && ./node_modules/.bin/prisma migrate deploy --config prisma/prisma.config.ts"
	@echo "$(GREEN)✓ Database migrations applied$(NC)"

# Seed database
# PERINGATAN: db:seed melakukan TRUNCATE semua tabel lalu insert data demo
#            (lihat apps/api/prisma/seed.ts) — JANGAN jalankan pada DB produksi.
# Prasyarat: butuh pnpm + Node + source repo di host (tsx adalah devDependency
#            yang TIDAK tersedia di image API, lihat apps/api/Dockerfile).
db-seed:
	@echo "$(BLUE)Seeding database...$(NC)"
	@DATABASE_URL="postgresql://$(DB_USER):$(DB_PASSWORD)@localhost:5432/$(DB_NAME)" pnpm --filter api db:seed
	@echo "$(GREEN)✓ Database seeded$(NC)"

# Reset database
db-reset:
	@echo "$(YELLOW)WARNING: This will delete all data in the database$(NC)"
	@printf "Are you sure? [y/N] "; \
	read REPLY; \
	if [ "$$REPLY" = "y" ] || [ "$$REPLY" = "Y" ]; then \
		docker exec cipansor-db psql -U $(DB_USER) -d $(DB_NAME) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"; \
		$(MAKE) db-migrate; \
		$(MAKE) db-seed; \
		echo "$(GREEN)✓ Database reset completed$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

# Development mode
dev: check-prereqs
	@echo "$(BLUE)Starting in development mode...$(NC)"
	docker compose -f docker-compose.yml up

# Run tests
test:
	@echo "$(BLUE)Running tests...$(NC)"
	docker exec cipansor-api sh -c "cd /app/apps/api && pnpm test"
	docker exec cipansor-web sh -c "cd /app/apps/web && pnpm test"
	@echo "$(GREEN)✓ Tests completed$(NC)"

# Run linter
lint:
	@echo "$(BLUE)Running linter...$(NC)"
	docker exec cipansor-api sh -c "cd /app/apps/api && pnpm lint"
	docker exec cipansor-web sh -c "cd /app/apps/web && pnpm lint"
	@echo "$(GREEN)✓ Linting completed$(NC)"

# Production readiness check
ready: check-prereqs
	@echo "$(BLUE)Checking production readiness...$(NC)"
	@echo ""
	@echo "$(BLUE)1. Checking Docker environment...$(NC)"
	@docker version >/dev/null 2>&1 && echo "$(GREEN)✓ Docker is running$(NC)" || echo "$(RED)✗ Docker is not running$(NC)"
	@echo ""
	@echo "$(BLUE)2. Checking Docker Compose configuration...$(NC)"
	@docker compose config >/dev/null 2>&1 && echo "$(GREEN)✓ Docker Compose configuration is valid$(NC)" || echo "$(RED)✗ Docker Compose configuration has errors$(NC)"
	@echo ""
	@echo "$(BLUE)3. Checking environment variables...$(NC)"
	@test -f .env || test -f .env.production && echo "$(GREEN)✓ Environment file exists$(NC)" || echo "$(YELLOW)⚠ No environment file found$(NC)"
	@echo ""
	@echo "$(BLUE)4. Checking database connectivity...$(NC)"
	@docker compose ps db | grep -q "healthy" && echo "$(GREEN)✓ Database is healthy$(NC)" || echo "$(YELLOW)⚠ Database is not healthy or not running$(NC)"
	@echo ""
	@echo "$(BLUE)5. Checking Redis connectivity...$(NC)"
	@docker compose ps redis | grep -q "healthy" && echo "$(GREEN)✓ Redis is healthy$(NC)" || echo "$(YELLOW)⚠ Redis is not healthy or not running$(NC)"
	@echo ""
	@echo "$(BLUE)6. Checking API service...$(NC)"
	@docker compose ps api | grep -q "healthy" && echo "$(GREEN)✓ API service is healthy$(NC)" || echo "$(YELLOW)⚠ API service is not healthy or not running$(NC)"
	@echo ""
	@echo "$(BLUE)7. Checking Web service...$(NC)"
	@docker compose ps web | grep -q "healthy" && echo "$(GREEN)✓ Web service is healthy$(NC)" || echo "$(YELLOW)⚠ Web service is not healthy or not running$(NC)"
	@echo ""
	@echo "$(BLUE)8. Checking disk space...$(NC)"
	@df -BG . | awk 'NR==2 {gsub("G","",$$4); print $$4+0}' | while read space; do \
		if [ "$${space:-0}" -lt 5 ]; then \
			echo "$(YELLOW)⚠ Low disk space: $${space}G available$(NC)"; \
		else \
			echo "$(GREEN)✓ Sufficient disk space: $${space}G available$(NC)"; \
		fi; \
	done
	@echo ""
	@echo "$(BLUE)Production readiness check completed$(NC)"

# Deploy to production
deploy: build up db-migrate
	@echo "$(GREEN)✓ Deployment completed$(NC)"
	@echo "$(YELLOW)Services are now running at:$(NC)"
	@echo "  - Web: http://localhost:3000"
	@echo "  - API: http://localhost:3001"
	@echo "  - Database: localhost:5432"
	@echo "  - Redis: localhost:6379"

# Quick start for development
quick-start: check-prereqs build up db-migrate
	@echo "$(GREEN)✓ Quick start completed$(NC)"
	@$(MAKE) check-health
