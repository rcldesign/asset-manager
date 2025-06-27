# DumbAssets Enhanced Documentation

Welcome to the comprehensive documentation for DumbAssets Enhanced - a modern asset management system with advanced task scheduling and notification capabilities.

## Documentation Overview

### User Guides
- **[Asset Management User Guide](./USER_GUIDE_ASSETS.md)** - Complete guide for managing physical and digital assets
- **[Task Management User Guide](./USER_GUIDE_TASKS.md)** - Comprehensive guide for task creation, scheduling, and tracking

### Technical Documentation
- **[API Documentation](http://localhost:3001/api-docs)** - Interactive Swagger/OpenAPI documentation (when server is running)
- **[RBAC Security Audit](../RBAC_AUDIT_REPORT.md)** - Comprehensive security audit of all API endpoints

### API Reference
- **Authentication** - JWT and API token authentication
- **Organizations** - Multi-tenant organization management
- **Users** - User management with role-based permissions
- **Assets** - Complete asset lifecycle management
- **Tasks** - Task creation, assignment, and tracking
- **Schedules** - Automated task generation
- **Notifications** - Multi-channel notification system
- **File Management** - Secure file upload and storage

## Quick Start

### For End Users
1. Start with the [Asset Management User Guide](./USER_GUIDE_ASSETS.md) to understand asset creation and management
2. Review the [Task Management User Guide](./USER_GUIDE_TASKS.md) to learn about maintenance scheduling
3. Configure your notification preferences for important updates

### For Developers
1. Review the API documentation at `/api-docs` when the server is running
2. Check the [RBAC Security Audit](../RBAC_AUDIT_REPORT.md) for endpoint security details
3. All services include comprehensive JSDoc documentation

## Key Features

### Asset Management
- Hierarchical asset organization
- Custom fields and templates
- Multiple file attachments
- Warranty tracking
- QR code support
- Comprehensive categorization

### Task Management
- Manual and scheduled tasks
- Multiple user assignments
- Priority levels
- Cost and time tracking
- Comment threads
- Bulk operations

### Scheduling System
- Fixed interval schedules
- Calendar-based scheduling
- Usage-based triggers
- Seasonal scheduling
- Automatic task generation

### Security Features
- Role-based access control (RBAC)
- JWT authentication
- API token support
- Two-factor authentication (2FA)
- OIDC integration
- File upload security

## System Architecture

### Backend Technologies
- **Node.js** with TypeScript
- **Express.js** for REST API
- **Prisma** ORM with PostgreSQL
- **BullMQ** for job processing
- **Redis** for caching and queues
- **Socket.io** for real-time updates

### Security Implementation
- Permission-based access control
- Organization isolation
- Secure file handling
- Rate limiting
- Input validation

## API Endpoints Summary

### Public Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh
- `GET /health` - System health check

### Protected Endpoints
All other endpoints require authentication and appropriate permissions:
- Assets API - Full CRUD with file attachments
- Tasks API - Task management with comments
- Schedules API - Schedule configuration
- Notifications API - User notifications
- Organizations API - Organization management
- Users API - User administration

## Environment Configuration

Key configuration areas:
- Database connection
- Redis configuration  
- JWT secrets
- File storage settings
- SMTP configuration
- OIDC settings (optional)
- Security options

## Support and Contributions

### Getting Help
1. Check the relevant user guide
2. Review API documentation
3. Search existing issues
4. Contact system administrator

### Contributing
- Follow existing code patterns
- Add appropriate tests
- Update documentation
- Submit pull requests

## License

This project is licensed under the terms specified in the LICENSE file.

---

For the most up-to-date information, refer to the specific documentation sections or contact the development team.