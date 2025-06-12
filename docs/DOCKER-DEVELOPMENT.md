# Docker Development Environment Setup

This guide explains how to set up and use the new separated services architecture for local development with Docker.

## Architecture Overview

The new development setup uses three separate services:
- **Frontend**: Next.js application running on port 3000
- **Backend**: Express.js API server running on port 3001  
- **Proxy**: Nginx reverse proxy running on port 80

This mirrors the production architecture and eliminates "works on my machine" issues.

## Prerequisites

1. **Docker & Docker Compose**: Ensure Docker Desktop is installed and running
2. **Local PostgreSQL**: Required for backend database connection
3. **Local Redis**: Required for backend session storage

## Quick Start

### 1. Start Local Services

First, ensure PostgreSQL and Redis are running locally:

```bash
# Start PostgreSQL (adjust command for your system)
sudo systemctl start postgresql
# OR on macOS with Homebrew:
brew services start postgresql

# Start Redis (adjust command for your system)  
sudo systemctl start redis
# OR on macOS with Homebrew:
brew services start redis
```

### 2. Run Development Environment

```bash
# From the project root
docker-compose -f docker-compose.dev.yml up --build

# Or run in background
docker-compose -f docker-compose.dev.yml up -d --build
```

### 3. Access the Application

- **Main Application**: http://localhost (via Nginx proxy)
- **Frontend Direct**: http://localhost:3000 (for debugging)
- **Backend Direct**: http://localhost:3001 (for API testing)
- **Backend Health**: http://localhost/health

## Development Workflow

### Making Changes

All services support hot-reloading:

- **Frontend**: Next.js dev server automatically reloads on file changes
- **Backend**: tsx watch automatically restarts on file changes
- **Nginx**: Configuration changes require container restart

### Debugging

**View Logs:**
```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs -f frontend
docker-compose -f docker-compose.dev.yml logs -f proxy
```

**Execute Commands in Containers:**
```bash
# Backend container
docker-compose -f docker-compose.dev.yml exec backend sh

# Frontend container  
docker-compose -f docker-compose.dev.yml exec frontend sh

# Test inter-service communication
docker-compose -f docker-compose.dev.yml exec frontend curl http://backend:3001/health
```

**Check Service Status:**
```bash
docker-compose -f docker-compose.dev.yml ps
```

### Testing API Endpoints

```bash
# Test backend health directly
curl http://localhost:3001/health

# Test backend health via proxy
curl http://localhost/health

# Test API endpoint via proxy
curl http://localhost/api/auth/me
```

## Environment Configuration

### Required Environment Variables

The following environment variables are configured in `docker-compose.dev.yml`:

**Backend:**
- `NODE_ENV=development`
- `DATABASE_URL=postgresql://dumbassets:dumbassets@host.docker.internal:5432/dumbassets_dev`
- `REDIS_URL=redis://host.docker.internal:6379`
- `ALLOWED_ORIGINS=http://localhost`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `SESSION_SECRET`

**Frontend:**
- `NODE_ENV=development`
- `NEXT_PUBLIC_API_URL=/api`

### Custom Configuration

Create a `.env` file in the project root for custom settings:

```env
# Database
DATABASE_URL=postgresql://custom_user:custom_pass@host.docker.internal:5432/custom_db

# OIDC (optional)
OIDC_ISSUER_URL=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost/api/auth/callback
```

## OIDC Configuration

When using OIDC authentication, ensure your identity provider includes these callback URLs:

- **Development**: `http://localhost/api/auth/callback`
- **Previous Setup**: `http://localhost:3000/api/auth/callback` (remove this)

The new architecture routes all `/api/*` requests through the Nginx proxy to the backend.

## Troubleshooting

### Common Issues

**1. "Connection refused" errors:**
- Ensure PostgreSQL and Redis are running locally
- Check that `host.docker.internal` resolves correctly

**2. CORS errors:**
- Verify `ALLOWED_ORIGINS=http://localhost` in backend environment
- Check browser dev tools for specific CORS error messages

**3. Hot reloading not working:**
- Ensure volume mounts are correct in docker-compose.dev.yml
- Try rebuilding containers: `docker-compose -f docker-compose.dev.yml up --build`

**4. Next.js compilation errors:**
- Check if standalone output is causing issues
- Verify `NODE_ENV=development` to enable rewrites

### Resetting Environment

```bash
# Stop all services
docker-compose -f docker-compose.dev.yml down

# Remove volumes (this will delete node_modules caches)
docker-compose -f docker-compose.dev.yml down -v

# Rebuild everything
docker-compose -f docker-compose.dev.yml up --build
```

### Network Debugging

```bash
# Test internal networking
docker-compose -f docker-compose.dev.yml exec frontend nslookup backend
docker-compose -f docker-compose.dev.yml exec frontend curl http://backend:3001/health

# Check nginx routing
docker-compose -f docker-compose.dev.yml exec proxy nginx -t
```

## File Structure

```
project-root/
├── docker-compose.dev.yml      # Development orchestration
├── nginx.dev.conf              # Development Nginx config
├── backend/
│   ├── Dockerfile.dev          # Backend development image
│   └── ...
├── frontend/
│   ├── Dockerfile.dev          # Frontend development image
│   └── ...
└── docs/
    └── DOCKER-DEVELOPMENT.md   # This file
```

## Comparison with Previous Setup

| Aspect | Previous (Rewrites) | New (Docker) |
|--------|-------------------|--------------|
| Frontend URL | http://localhost:3000 | http://localhost |
| API Requests | Proxied by Next.js | Routed by Nginx |
| CORS Testing | Hidden (same-origin) | Real (cross-origin) |
| Production Parity | Low | High |
| Debugging | Simple | Container-based |
| Auth Redirects | localhost:3000 | localhost |

## Next Steps

Once comfortable with the Docker development environment:

1. **Production Deployment**: Use `docker-compose.separated.yml` for production
2. **CI/CD Integration**: Build separate frontend/backend images
3. **Environment Promotion**: Test staging with identical architecture

The investment in learning this setup pays dividends by catching integration issues early and providing true dev/prod parity.