# Docker Setup Guide

This guide covers all Docker deployment options for DumbAssets Enhanced.

## Table of Contents
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Production Setup](#production-setup)
- [Configuration Options](#configuration-options)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB disk space

### Basic Commands

```bash
# Development
docker compose -f docker-compose.dev.yml up -d

# Production
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose logs -f

# Stop containers
docker compose down

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v
```

## Development Setup

The development setup includes hot-reloading and debugging capabilities.

### 1. Clone and Configure

```bash
git clone https://github.com/yourusername/asset-manager.git
cd asset-manager
cp .env.example .env
```

### 2. Edit .env for Development

```env
NODE_ENV=development
PORT=3001

# Use embedded databases (simplest option)
USE_EMBEDDED_DB=true
USE_EMBEDDED_REDIS=true

# Development secrets (change for production)
JWT_SECRET=dev-jwt-secret
JWT_REFRESH_SECRET=dev-refresh-secret
SESSION_SECRET=dev-session-secret
ENCRYPTION_KEY=dev-32-byte-encryption-key-12345
```

### 3. Start Development Container

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4. Access the Application

- API: http://localhost:3001
- API Docs: http://localhost:3001/api-docs
- Health Check: http://localhost:3001/health

### Development Features

- **Hot Reload**: Source files are mounted, changes reflect immediately
- **Debug Ports**: PostgreSQL (5432) and Redis (6379) exposed
- **Embedded Services**: No external dependencies needed

## Production Setup

The production setup optimizes for performance and security.

### 1. Prepare Environment

```bash
# Create production directory
mkdir -p /opt/dumbassets
cd /opt/dumbassets

# Download compose file
curl -O https://raw.githubusercontent.com/yourusername/asset-manager/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/yourusername/asset-manager/main/.env.example

# Create .env
cp .env.example .env
```

### 2. Configure Production Settings

Edit `.env` with production values:

```env
NODE_ENV=production
PORT=3001

# Security - MUST CHANGE ALL OF THESE
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 24)

# Application
BASE_URL=https://assets.company.com
ALLOWED_ORIGINS=https://assets.company.com

# Email (optional but recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@company.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=DumbAssets <notifications@company.com>

# Data persistence paths
DATA_PATH=/opt/dumbassets/data
REDIS_PATH=/opt/dumbassets/redis
UPLOADS_PATH=/opt/dumbassets/uploads
```

### 3. Create Data Directories

```bash
mkdir -p data redis uploads
chown -R 1001:1001 data redis uploads
```

### 4. Start Production Container

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 5. Setup Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl http2;
    server_name assets.company.com;

    ssl_certificate /etc/ssl/certs/assets.company.com.crt;
    ssl_certificate_key /etc/ssl/private/assets.company.com.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Configuration Options

### Using External Databases

#### PostgreSQL

1. Edit `.env`:
```env
USE_EMBEDDED_DB=false
DATABASE_URL=postgresql://user:password@db.company.com:5432/dumbassets
```

2. For development, uncomment the postgres service in `docker-compose.dev.yml`

#### Redis

1. Edit `.env`:
```env
USE_EMBEDDED_REDIS=false
REDIS_URL=redis://redis.company.com:6379
```

2. For development, uncomment the redis service in `docker-compose.dev.yml`

### SMB/CIFS File Storage

To use network file storage instead of local:

1. Edit `.env`:
```env
FILE_STORAGE_TYPE=smb
SMB_SHARE=//fileserver/assets
SMB_USERNAME=service_account
SMB_PASSWORD=secure_password
SMB_DOMAIN=COMPANY
```

2. Uncomment the CIFS volume mount in compose file

### OIDC/SSO Integration

Configure OIDC for single sign-on:

```env
OIDC_ISSUER_URL=https://auth.company.com
OIDC_CLIENT_ID=dumbassets
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://assets.company.com/auth/oidc/callback
```

## Container Management

### Viewing Logs

```bash
# All logs
docker compose logs

# Follow logs
docker compose logs -f

# Specific service
docker compose logs backend

# Last 100 lines
docker compose logs --tail=100
```

### Backup and Restore

#### Backup

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups/dumbassets/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Stop container
docker compose down

# Backup data
tar -czf "$BACKUP_DIR/postgres.tar.gz" ./data
tar -czf "$BACKUP_DIR/redis.tar.gz" ./redis
tar -czf "$BACKUP_DIR/uploads.tar.gz" ./uploads
cp .env "$BACKUP_DIR/"

# Restart container
docker compose up -d

echo "Backup completed: $BACKUP_DIR"
```

#### Restore

```bash
#!/bin/bash
# restore.sh
BACKUP_DIR="$1"

if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: ./restore.sh /path/to/backup"
    exit 1
fi

# Stop container
docker compose down

# Restore data
tar -xzf "$BACKUP_DIR/postgres.tar.gz"
tar -xzf "$BACKUP_DIR/redis.tar.gz"
tar -xzf "$BACKUP_DIR/uploads.tar.gz"

# Restart container
docker compose up -d

echo "Restore completed from: $BACKUP_DIR"
```

### Updates

```bash
# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d

# Remove old images
docker image prune
```

## Troubleshooting

### Container Won't Start

1. Check logs:
```bash
docker compose logs backend
```

2. Verify environment:
```bash
docker compose config
```

3. Check permissions:
```bash
ls -la data redis uploads
# Should be owned by user 1001
```

### Database Connection Issues

1. If using embedded DB, check initialization:
```bash
docker exec dumbassets-backend ls -la /var/lib/postgresql/data
```

2. Test connection:
```bash
docker exec dumbassets-backend npx prisma db push
```

### Performance Issues

1. Check resource usage:
```bash
docker stats
```

2. Increase memory limits in compose file:
```yaml
services:
  backend:
    mem_limit: 2g
    cpus: '2.0'
```

### Reset Everything

```bash
# Stop and remove everything
docker compose down -v

# Remove all data (WARNING: permanent)
rm -rf data redis uploads

# Start fresh
docker compose up -d
```

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "storage": "available"
  }
}
```

### Monitoring with Docker

```bash
# Check container health
docker ps

# View resource usage
docker stats

# Inspect container
docker inspect dumbassets-backend
```

## Security Best Practices

1. **Always use HTTPS in production** - Use a reverse proxy with SSL
2. **Change all default secrets** - Generate strong random values
3. **Limit exposed ports** - Only expose what's necessary
4. **Regular updates** - Keep the image and dependencies updated
5. **Backup regularly** - Automate backups of data volumes
6. **Monitor logs** - Set up log aggregation and alerting

## Support

For issues or questions:
1. Check the logs first
2. Review this documentation
3. Search existing issues on GitHub
4. Create a new issue with debug information