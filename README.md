# DumbAssets Enhanced

A comprehensive enterprise-ready asset management system with advanced features for tracking physical assets, maintenance schedules, and compliance documentation.

<p align="center">
  <img width=75% src="https://github.com/user-attachments/assets/ec310325-c3e4-4fc1-ba53-5cca5cd74c85" />
</p>

<p align="center">
  <a href="https://dumbassets.dumbware.io" target="_blank">Demo</a>
</p>

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Configuration](#configuration)
- [Security](#security)
- [Technical Details](#technical-details)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### Prerequisites

- Docker and Docker Compose (recommended)
- Node.js >=20.0.0 (for local development)
- PostgreSQL 15+ (optional, if not using embedded)
- Redis 7+ (optional, if not using embedded)

### Option 1: Docker Compose - Development

```sh
# Clone the repository
git clone https://github.com/yourusername/asset-manager.git
cd asset-manager

# Copy environment example
cp .env.example .env

# Start development containers
docker compose -f docker-compose.dev.yml up -d
```

1. Go to [http://localhost:3001](http://localhost:3001)
2. Default admin credentials will be created on first run
3. Start managing your assets!

### Option 2: Docker Compose - Production

```sh
# Copy and customize environment
cp .env.example .env
# Edit .env with your production values

# Start production container
docker compose -f docker-compose.prod.yml up -d
```

The production setup includes:
- Embedded PostgreSQL and Redis (or external if configured)
- Automatic database migrations
- Health checks and auto-restart
- Persistent data volumes

### Option 3: External Database Setup

To use external PostgreSQL and Redis:

1. Edit your `.env` file:
```env
USE_EMBEDDED_DB=false
DATABASE_URL=postgresql://user:password@host:5432/dumbassets
USE_EMBEDDED_REDIS=false
REDIS_URL=redis://host:6379
```

2. Uncomment the external services in `docker-compose.dev.yml`
3. Start with: `docker compose -f docker-compose.dev.yml up -d`

### Option 4: Local Development

```sh
# Backend setup
cd backend
npm install
cp .env.example .env
npm run prisma:migrate
npm run dev

# Frontend (when available)
cd ../frontend
npm install
npm run dev
```

---

## Features

### Core Asset Management
- 🚀 Comprehensive asset tracking with full lifecycle management
- 🧩 Hierarchical components and sub-components
- 🖼️ Document management with encryption (photos, receipts, manuals)
- 🔍 Advanced search with filters and saved queries
- 🏷️ Flexible tagging and categorization system
- 📊 Asset depreciation tracking
- 🔗 QR code generation and scanning

### Maintenance & Compliance
- 📅 Scheduled maintenance with automated reminders
- 🔧 Maintenance history and cost tracking
- ⚠️ Warranty expiration notifications
- 📋 Compliance documentation and audit trails
- 🏥 Health checks and condition monitoring

### Enterprise Features
- 🛡️ Multi-factor authentication (TOTP, SMS, Email)
- 👥 Role-based access control (Admin, Manager, User, Viewer)
- 🔐 OIDC/SSO integration
- 📧 Email notifications with templates
- 🔔 Multi-channel alerts (Apprise, SMS, Teams, Slack)
- 🌐 Multi-tenant support (planned)

### Technical Capabilities
- 📦 Single container deployment with embedded databases
- 🔄 Real-time updates with WebSocket support
- 📈 Performance monitoring and metrics
- 🌗 Light/Dark mode with theme persistence
- 💾 SMB/CIFS file storage integration
- 🗓️ Google Calendar integration for maintenance

## Configuration

### Core Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| NODE_ENV | Environment (development/production) | development | No |
| PORT | Server port | 3001 | No |
| BASE_URL | Base URL for the application | http://localhost:3001 | No |
| ALLOWED_ORIGINS | CORS allowed origins | * | No |

### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| USE_EMBEDDED_DB | Use embedded PostgreSQL | true | No |
| DATABASE_URL | External PostgreSQL URL | - | If not embedded |
| USE_EMBEDDED_REDIS | Use embedded Redis | true | No |
| REDIS_URL | External Redis URL | - | If not embedded |

### Security Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| JWT_SECRET | JWT signing secret | - | Yes (production) |
| JWT_REFRESH_SECRET | JWT refresh token secret | - | Yes (production) |
| SESSION_SECRET | Session encryption secret | - | Yes (production) |
| ENCRYPTION_KEY | 32-byte data encryption key | - | Yes (production) |

### Optional Services

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| SMTP_HOST | Email server host | - | No |
| SMTP_PORT | Email server port | - | No |
| SMTP_USER | Email username | - | No |
| SMTP_PASSWORD | Email password | - | No |
| OIDC_ISSUER_URL | OIDC provider URL | - | No |
| OIDC_CLIENT_ID | OIDC client ID | - | No |
| OIDC_CLIENT_SECRET | OIDC client secret | - | No |
| APPRISE_URL | Apprise notification URL | - | No |

> [!TIP]
> The embedded PostgreSQL and Redis make deployment incredibly simple - just run the container and you're done!

### Data Storage

#### Production Data Volumes
- `/var/lib/postgresql/data` - PostgreSQL database
- `/var/lib/redis` - Redis cache and session data
- `/app/uploads` - File attachments (encrypted)

#### Volume Mapping
```yaml
volumes:
  - ./data:/var/lib/postgresql/data
  - ./redis:/var/lib/redis
  - ./uploads:/app/uploads
```

---

## Security

### Authentication & Authorization
- Multi-factor authentication (TOTP, SMS, Email)
- Role-based access control (RBAC)
- OIDC/SSO integration support
- JWT-based API authentication
- Session management with Redis

### Data Protection
- AES-256 encryption for sensitive data
- File encryption at rest
- TLS/HTTPS enforcement
- SQL injection prevention
- XSS protection with CSP headers
- Rate limiting and DDoS protection

### Compliance
- Audit logging for all actions
- GDPR-compliant data handling
- Configurable data retention
- Export and deletion capabilities

---

## Technical Details

### Stack

- **Backend:** Node.js 20+ with Express 5
- **Database:** PostgreSQL 15 (embedded or external)
- **Cache:** Redis 7 (embedded or external)
- **Container:** Docker with Alpine Linux
- **Process Manager:** Supervisor for embedded services
- **ORM:** Prisma with migrations
- **API:** RESTful with OpenAPI documentation

### Key Dependencies

#### Backend Core
- **express**: Modern web framework
- **prisma**: Type-safe database ORM
- **bull**: Job queue for background tasks
- **ioredis**: Redis client for caching
- **helmet**: Security headers
- **joi/zod**: Input validation

#### Authentication
- **jsonwebtoken**: JWT implementation
- **bcrypt**: Password hashing
- **speakeasy**: TOTP/2FA support
- **openid-client**: OIDC integration

#### File Handling
- **multer**: File upload processing
- **sharp**: Image optimization
- **crypto-js**: File encryption

#### Monitoring
- **swagger**: API documentation
- **winston**: Structured logging
- **node-cron**: Scheduled tasks

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See the Development Guide for local setup and guidelines.

---

## Support the Project

<a href="https://www.buymeacoffee.com/dumbware" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60">
</a>

Made with ❤️ by [DumbWare.io](https://dumbware.io)
