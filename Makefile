# DumbAssets Enhanced - Docker Operations

.PHONY: help dev prod up down logs shell test clean backup

# Default target
help:
	@echo "DumbAssets Enhanced - Docker Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment"
	@echo "  make dev-down     - Stop development environment"
	@echo "  make dev-logs     - View development logs"
	@echo "  make dev-shell    - Shell into development container"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make prod-down    - Stop production environment"
	@echo "  make prod-logs    - View production logs"
	@echo "  make prod-shell   - Shell into production container"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate   - Run database migrations"
	@echo "  make db-seed      - Seed database with sample data"
	@echo "  make db-reset     - Reset database (WARNING: destroys data)"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run all tests"
	@echo "  make test-unit    - Run unit tests"
	@echo "  make test-e2e     - Run e2e tests"
	@echo "  make lint         - Run linting"
	@echo ""
	@echo "Utilities:"
	@echo "  make logs         - View all logs"
	@echo "  make clean        - Clean up containers and volumes"
	@echo "  make backup       - Backup data volumes"
	@echo "  make health       - Check health status"

# Development commands
dev:
	@echo "Starting development environment..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	docker compose -f docker-compose.dev.yml up -d
	@echo "Development environment started!"
	@echo "API: http://localhost:3001"
	@echo "API Docs: http://localhost:3001/api-docs"

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-shell:
	docker compose -f docker-compose.dev.yml exec backend sh

# Production commands
prod:
	@echo "Starting production environment..."
	@if [ ! -f .env ]; then \
		echo "ERROR: .env file not found!"; \
		echo "Copy .env.example to .env and configure production values"; \
		exit 1; \
	fi
	docker compose -f docker-compose.prod.yml up -d
	@echo "Production environment started!"

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

prod-shell:
	docker compose -f docker-compose.prod.yml exec dumbassets sh

# Database commands
db-migrate:
	docker compose exec backend npm run prisma:migrate:prod

db-seed:
	docker compose exec backend npm run prisma:seed

db-reset:
	@echo "WARNING: This will destroy all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker compose exec backend npm run prisma:reset; \
	fi

# Testing commands
test:
	docker compose -f docker-compose.dev.yml exec backend npm test

test-unit:
	docker compose -f docker-compose.dev.yml exec backend npm run test:unit

test-e2e:
	docker compose -f docker-compose.dev.yml exec backend npm run test:e2e

lint:
	docker compose -f docker-compose.dev.yml exec backend npm run lint

# Utility commands
logs:
	docker compose logs -f

clean:
	@echo "Cleaning up containers and volumes..."
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.prod.yml down -v
	@echo "Cleanup complete!"

backup:
	@echo "Creating backup..."
	@mkdir -p backups
	@BACKUP_DIR="backups/$$(date +%Y%m%d_%H%M%S)"; \
	mkdir -p "$$BACKUP_DIR"; \
	docker compose exec backend tar -czf - /var/lib/postgresql/data > "$$BACKUP_DIR/postgres.tar.gz"; \
	docker compose exec backend tar -czf - /var/lib/redis > "$$BACKUP_DIR/redis.tar.gz"; \
	docker compose exec backend tar -czf - /app/uploads > "$$BACKUP_DIR/uploads.tar.gz"; \
	cp .env "$$BACKUP_DIR/"; \
	echo "Backup created in $$BACKUP_DIR"

health:
	@curl -f http://localhost:3001/health || echo "Health check failed!"

# Build commands
build:
	docker compose -f docker-compose.dev.yml build

build-prod:
	docker compose -f docker-compose.prod.yml build

# Quick start for new users
quickstart: dev
	@echo ""
	@echo "==================================="
	@echo "DumbAssets Enhanced is now running!"
	@echo "==================================="
	@echo ""
	@echo "Access the API at: http://localhost:3001"
	@echo "View API docs at: http://localhost:3001/api-docs"
	@echo ""
	@echo "Default admin will be created on first access"
	@echo ""
	@echo "To stop: make dev-down"
	@echo "To view logs: make dev-logs"