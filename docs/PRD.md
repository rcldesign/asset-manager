# Product Requirements Document: DumbAssets Enhanced
## Asset & Maintenance Management System

### Version: 2.0
### Date: 2025-01-06

---

## 1. Executive Summary

This document outlines the requirements for enhancing DumbAssets by integrating advanced maintenance management capabilities from the Maintenance Manager specifications. The enhanced system will retain all current DumbAssets functionality while adding sophisticated scheduling, task management, and multi-user collaboration features. The deployment model will remain simple with a single Docker container, but the technical stack will be modernized to support the expanded feature set.

## 2. Vision & Objectives

### Vision
Create a comprehensive asset and maintenance management system that combines DumbAssets' intuitive asset tracking with Maintenance Manager's powerful scheduling and task automation capabilities.

### Key Objectives
1. **Preserve Core Strengths**: Maintain DumbAssets' excellent warranty tracking, file management, and user-friendly interface
2. **Add Advanced Scheduling**: Implement sophisticated maintenance scheduling with multiple recurrence patterns
3. **Enable Collaboration**: Add multi-user support with role-based access control
4. **Improve Architecture**: Modernize tech stack while keeping deployment simple
5. **Enhance Visibility**: Provide multiple dashboard views for different user needs

## 3. Target Audience

### Primary Users
- **Homeowners**: Managing personal assets and home maintenance
- **Small Businesses**: Tracking equipment and maintenance schedules
- **Property Managers**: Managing maintenance across multiple properties
- **Families**: Collaborative household asset and task management

### User Personas
1. **Individual Asset Owner**: Needs simple tracking and warranty alerts
2. **Maintenance Coordinator**: Focuses on scheduling and task completion
3. **Family Administrator**: Manages shared assets and assigns tasks
4. **Small Business Owner**: Tracks equipment warranties and compliance

## 4. Core Features

### 4.1 Asset Management (Enhanced from DumbAssets)

#### Retained Features
- Comprehensive asset tracking (name, manufacturer, model, serial, etc.)
- Multi-level component hierarchy (assets → components → sub-components)
- File attachments (photos, receipts, manuals)
- Warranty tracking with expiration alerts
- Secondary warranty support
- Tag-based organization
- Notes and descriptions
- Direct asset linking via URL
- Excel/CSV import

#### New Features
- **Required category field** for better organization
- **Custom fields** definable per installation
- **Location tracking** with hierarchical locations
- **Asset templates** for quick creation of similar assets
- **Bulk operations** for managing multiple assets
- **Asset relationships** (e.g., "requires", "replaces", "part of")

### 4.2 Maintenance Scheduling (New from Maintenance Manager)

#### Schedule Types
1. **Fixed Recurrence**
   - Every N days/weeks/months/years
   - Example: "Clean HVAC filter every 3 months"
   
2. **Seasonal/Monthly Templates**
   - Different tasks for different times of year
   - Example: "January: Prune trees, April: Fertilize lawn, October: Winterize sprinklers"
   
3. **Usage-Based**
   - Triggered by counters (mileage, hours, cycles)
   - Manual or API-based counter updates
   - Example: "Oil change every 5,000 miles"
   
4. **One-Off Tasks**
   - Single occurrence with specific due date
   - Example: "Replace roof in 2030"

#### Scheduling Features
- **Multiple schedules per asset** with independent tracking
- **Task templates** with customizable descriptions
- **Schedule dependencies** (complete task A before task B)
- **Blackout dates** for vacation/unavailable periods
- **Business days only** option
- **Weather-dependent** scheduling (future enhancement)

### 4.3 Task Management (New)

#### Task Lifecycle
- States: **Planned → In Progress → Done → Skipped**
- Automatic generation up to 12 months ahead
- Forward-only propagation for schedule changes

#### Task Features
- **Multi-user assignment** with notifications
- **Due date flexibility** with drag-and-drop rescheduling
- **Cost tracking** (estimated vs actual)
- **Duration tracking** (estimated vs actual)
- **Priority levels** (High, Medium, Low)
- **Dependencies** between tasks
- **Subtasks** for complex maintenance
- **Comment threads** with @mentions
- **File attachments** (work orders, invoices, photos)
- **Completion requirements** (photos, signatures, checklists)

### 4.4 Dashboard Views (New Architecture)

#### 4.4.1 Overview Dashboard (Default)
- **Summary Cards**:
  - Total assets & components
  - Active warranties
  - Overdue tasks (with urgency indicators)
  - Tasks due this week/month
  - Recently completed tasks
  - Upcoming warranty expirations
- **Quick Actions**:
  - Add asset
  - Create task
  - Update counters
- **Activity Feed**: Recent changes and completions
- **Mini Calendar**: Week view with task dots
- **Charts**:
  - Task completion trends
  - Maintenance cost tracking
  - Asset age distribution

#### 4.4.2 Asset-Centric Dashboard
- **Current DumbAssets dashboard** with enhancements:
  - Asset distribution charts
  - Component hierarchy visualization
  - Warranty timeline
  - Total asset count (no value information)
  - Tag cloud
  - Recent asset additions/modifications
- **Asset health indicators**
- **Maintenance history summary**
- **Cost per asset analysis**

#### 4.4.3 Calendar-Centric Dashboard
- **Full calendar view** (month/week/day views)
- **Task density heatmap**
- **Drag-and-drop rescheduling**
- **Color coding** by:
  - Asset category
  - Task priority
  - Assigned user
  - Task type
- **Filters** for users, assets, task types
- **Recurring task indicators**
- **Weather overlay** (future)

#### 4.4.4 Task-Centric Dashboard
- **Kanban board** view (Planned, In Progress, Done)
- **List view** with advanced filtering
- **My tasks** personalized view
- **Team workload** visualization
- **Task metrics**:
  - Completion rate
  - Average delay
  - Cost variance
  - Time estimates accuracy
- **Bulk actions** for task management
- **Quick assign** interface

### 4.5 User Management & Collaboration

#### Authentication
- **Primary**: OpenID Connect (Keycloak, Auth0, etc.)
- **Fallback**: Built-in email/password with 2FA
- **Session management** with remember me
- **API tokens** for external access

#### Roles & Permissions
1. **Owner/Admin**
   - Full system control
   - User management
   - Custom field definitions
   - Data export/import
   
2. **Manager**
   - Create/edit all assets and schedules
   - Assign tasks to anyone
   - View all reports
   - Cannot manage users
   
3. **Member**
   - Create/edit own assets
   - Complete assigned tasks
   - View shared assets
   - Comment on tasks
   
4. **Viewer**
   - Read-only access
   - View reports
   - Add comments only

#### Collaboration Features
- **Household/Organization** concept for data isolation
- **Invitation system** with email verification
- **Task notifications** via email/push/in-app
- **@mentions** in comments
- **Activity streams** per asset/task
- **Shared asset visibility** controls

### 4.6 Notifications & Integrations

#### Notification Channels
- **Email** (SMTP)
- **In-app** notifications
- **Push notifications** (PWA)
- **Apprise** integration (retained from DumbAssets)
- **Webhooks** for external systems

#### Notification Types
- Asset CRUD operations
- Warranty expirations (30, 14, 7, 3 days)
- Task assignments
- Task due dates
- Overdue tasks
- Comment mentions
- Schedule changes
- System maintenance

#### Calendar Integration
- **Google Calendar** two-way sync
- **iCalendar** feed export
- **Outlook** integration (future)
- **Task scheduling** from calendar

#### API & Integrations
- **REST API** for all operations
- **GraphQL** endpoint (future)
- **Webhook** events
- **Zapier** integration (future)
- **Home Assistant** integration (future)

### 4.7 Data Management

#### Import/Export
- **Enhanced Excel/CSV** import with mapping
- **Bulk asset creation** from templates
- **Schedule import** from various formats
- **Full data export** (JSON, CSV, Excel)
- **Backup/restore** functionality
- **Data migration** tools

#### Reporting
- **Asset reports**: Age, warranty status, maintenance history
- **Task reports**: Completion rates, costs, delays
- **User reports**: Workload, performance
- **Custom reports** builder
- **PDF export** for all reports
- **Scheduled reports** via email

### 4.8 Mobile & Offline Support

- **Progressive Web App** (PWA) with offline mode
- **Offline task completion** with sync
- **Mobile-optimized** UI for all features
- **Camera integration** for quick photo attachments
- **Barcode scanning** for asset lookup
- **Location services** for asset tracking

## 5. Technical Requirements

### 5.1 Architecture Overview

#### Deployment Model
- **Single Docker container** deployment (as requested)
- **Embedded services** within container:
  - Node.js application server
  - PostgreSQL database
  - Redis for caching/queues
  - Background job workers
- **Volume mounts** for data persistence
- **Environment-based** configuration

### 5.2 Technology Stack

#### Backend
- **Runtime**: Node.js 18+ LTS
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL 15+ (embedded)
- **Cache/Queue**: Redis 7+ (embedded)
- **ORM**: Prisma or TypeORM
- **Task Queue**: Bull Queue
- **File Storage**: Local filesystem with S3-compatible API

#### Frontend
- **Framework**: React 18+ with Next.js 14+
- **UI Library**: Material-UI (MUI) v5
- **State Management**: Zustand + React Query
- **Charts**: Chart.js (retained) + D3.js for complex visualizations
- **Forms**: React Hook Form
- **Calendar**: FullCalendar + custom components
- **Build Tool**: Next.js built-in (Webpack 5)

#### Development Tools
- **Language**: TypeScript throughout
- **API Docs**: OpenAPI/Swagger
- **Testing**: Jest + React Testing Library
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions

### 5.3 Database Schema (Key Entities)

```sql
-- Simplified schema showing key relationships
-- Assets (enhanced from DumbAssets)
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL, -- New required field
    name VARCHAR(255) NOT NULL,
    -- ... other DumbAssets fields ...
    location_id UUID, -- New
    custom_fields JSONB, -- New
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Schedules (new)
CREATE TABLE schedules (
    id UUID PRIMARY KEY,
    asset_id UUID NOT NULL,
    schedule_type VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Tasks (new)
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    schedule_id UUID,
    asset_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL,
    priority VARCHAR(20),
    -- ... cost, duration, etc ...
);

-- Users (enhanced)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    organization_id UUID NOT NULL,
    preferences JSONB,
    -- ... auth fields ...
);
```

### 5.4 Security Requirements

- **Authentication**: OIDC + JWT with refresh tokens
- **Authorization**: Fine-grained RBAC
- **Encryption**: AES-256 for sensitive data
- **API Security**: Rate limiting, CORS, CSP headers
- **File Security**: Virus scanning, type validation
- **Audit Trail**: All changes logged
- **GDPR Compliance**: Data export/deletion tools

### 5.5 Performance Requirements

- **Page Load**: < 2 seconds initial load
- **API Response**: < 200ms for simple queries
- **Task Generation**: < 30s for 1000 schedules
- **Concurrent Users**: 100+ per instance
- **Database Size**: 1M+ assets, 10M+ tasks
- **File Storage**: 100GB+ supported

### 5.6 Single Docker Container Architecture

```yaml
# Simplified docker-compose.yml for single container
version: '3.8'
services:
  dumbassets-enhanced:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://localhost/dumbassets
      - REDIS_URL=redis://localhost:6379
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
      - ./backups:/app/backups
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

The Dockerfile will include:
- PostgreSQL server
- Redis server
- Node.js application
- Supervisor to manage multiple processes
- Automated database migrations
- Health monitoring

## 6. Migration Strategy

### 6.1 Data Migration
1. **Preserve all existing data** from JSON files
2. **Convert to PostgreSQL** schema
3. **Maintain asset IDs** for URL compatibility
4. **Import maintenance events** as tasks
5. **Generate default schedules** from recurring events

### 6.2 Feature Rollout
1. **Phase 1**: Database migration, user system
2. **Phase 2**: Task management, basic scheduling
3. **Phase 3**: Advanced scheduling, calendar sync
4. **Phase 4**: Reporting, API, mobile enhancements

### 6.3 User Transition
- **Gradual feature exposure** with feature flags
- **Guided tours** for new capabilities
- **Maintain familiar UI** where possible
- **Comprehensive documentation**
- **Video tutorials** for complex features

## 7. Success Metrics

- **User Adoption**: 80% use of scheduling features within 3 months
- **Task Completion**: 90% on-time task completion rate
- **Performance**: Maintain current response times despite added complexity
- **User Satisfaction**: NPS score > 50
- **Data Integrity**: Zero data loss during migration
- **Uptime**: 99.9% availability

## 8. Future Enhancements

- **Mobile Apps**: Native iOS/Android applications
- **IoT Integration**: Automatic counter updates from sensors
- **AI Predictions**: Maintenance timing optimization
- **Cost Optimization**: Vendor management and bulk scheduling
- **Compliance Tracking**: Regulatory maintenance requirements
- **Multi-tenancy**: SaaS deployment option
- **Marketplace**: Maintenance schedule templates

## 9. Constraints & Assumptions

### Constraints
- Must maintain single Docker container deployment
- Must preserve all current DumbAssets features
- Cannot break existing asset URLs
- Must support offline-capable PWA

### Assumptions
- Users will accept the modernized tech stack
- PostgreSQL embedded in container is acceptable
- Users have stable internet for calendar sync
- Docker hosts have sufficient resources (4GB RAM minimum)

## 10. Glossary

- **Asset**: Physical item being tracked (unchanged from DumbAssets)
- **Component**: Sub-asset or part of an asset
- **Schedule**: Template for generating maintenance tasks
- **Task**: Specific maintenance activity with a due date
- **Organization**: Group of users sharing assets (household/company)
- **Counter**: Metric tracked for usage-based maintenance (mileage, hours)

---

This enhanced system combines the best of both worlds: DumbAssets' excellent asset tracking and warranty management with Maintenance Manager's sophisticated scheduling and task automation, all while maintaining the simple deployment model that makes DumbAssets attractive to individual users and small organizations.