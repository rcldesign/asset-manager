# DumbAssets Enhanced - Project Phases

## Phase 1: Foundation - Database Migration & Core User System

*   **Objective**: Establish the foundational backend infrastructure, migrate existing DumbAssets data, and implement the core user authentication and management system.
*   **Key Features / Systems**:
    *   Data model design for PostgreSQL (PRD 5.3).
    *   Migration scripts for existing DumbAssets JSON data to PostgreSQL (PRD 6.1).
    *   User entity (PRD 5.3 `users` table).
    *   Organization/Household concept for data isolation (PRD 4.5).
    *   Authentication: OIDC (primary) and fallback email/password with 2FA (PRD 4.5).
    *   Session management (PRD 4.5).
    *   API tokens for external access (PRD 4.5).
    *   Basic Role-Based Access Control (RBAC) framework with Owner/Admin role (PRD 4.5).
    *   Initial Docker setup with embedded PostgreSQL, Redis, and Node.js app server. Option to connect to external PostgreSQL via credentials. (PRD 5.1, 5.6)
    *   Basic API structure for user and organization management.
*   **Dependencies / Prerequisites**:
    *   Completion of all `TASKS-000.md` (Manual Prerequisites).
    *   Finalized database schema for core entities.
    *   Chosen OIDC provider and necessary credentials.
*   **Acceptance Criteria**:
    *   All existing DumbAssets data successfully migrated to PostgreSQL with data integrity verified.
    *   Users can register, log in (via OIDC and email/password), manage their profiles, and log out.
    *   2FA can be enabled and used.
    *   Organizations/Households can be created.
    *   Admin users can manage users within their organization.
    *   Basic API endpoints for user and organization CRUD operations are functional and secured.
    *   The application runs successfully within the single Docker container.
    *   Data persistence through Docker volumes is confirmed.
*   **Testing Requirements**:
    *   **Unit Tests**: For OIDC integration, email/password auth logic, user model, organization model, data migration scripts, RBAC logic.
    *   **Integration Tests**: API endpoint testing for auth, user management, organization management. Database interactions.
    *   **Manual Tests**: Full user registration and login flows (OIDC, email/password, 2FA). Admin user management capabilities. Data migration validation by checking a subset of migrated data.
    *   **Security Tests**: Basic penetration testing for authentication vulnerabilities.

## Phase 2: Core Functionality - Enhanced Asset Management, Basic Scheduling & Task Management

*   **Objective**: Implement the enhanced asset management features from DumbAssets, introduce basic maintenance scheduling, and establish the core task management system.
*   **Key Features / Systems**:
    *   **Asset Management (Enhanced)** (PRD 4.1):
        *   Retained DumbAssets features (tracking, hierarchy, attachments, warranty, tags, notes, linking, import).
        *   New features: required category field, custom fields, location tracking, asset templates, bulk operations, asset relationships.
        *   File storage on local filesystem (Docker volume) by default, with an option to configure an external SMB share. (PRD 5.2 Backend)
    *   **Maintenance Scheduling (Basic)** (PRD 4.2):
        *   Schedule entity (PRD 5.3 `schedules` table).
        *   One-Off Tasks scheduling.
        *   Fixed Recurrence (Every N days/weeks/months/years).
        *   Task template association (basic).
    *   **Task Management (Core)** (PRD 4.3):
        *   Task entity (PRD 5.3 `tasks` table).
        *   Task Lifecycle (Planned → In Progress → Done → Skipped).
        *   Automatic task generation (up to 12 months ahead) from basic schedules.
        *   Task assignment (single user initially).
        *   Due date setting.
        *   Basic cost and duration tracking fields.
        *   Priority levels.
        *   Comment threads (basic).
        *   File attachments to tasks.
    *   **User Roles Expansion**: Manager, Member, Viewer roles with associated permissions (PRD 4.5).
    *   **Basic Notifications**: In-app notifications for task assignments and due dates (PRD 4.6).
*   **Dependencies / Prerequisites**:
    *   Completion of Phase 1.
    *   Finalized data models for assets, schedules, tasks.
*   **Acceptance Criteria**:
    *   Users can create, read, update, and delete assets with all enhanced features.
    *   Existing assets are manageable with new fields and relationships.
    *   Users can create one-off and basic fixed recurrence maintenance schedules for assets.
    *   Tasks are automatically generated from these schedules.
    *   Users can manually create, view, update (status, details), and delete tasks.
    *   Tasks can be assigned to users.
    *   Basic notifications for tasks are functional.
    *   Permissions for Manager, Member, Viewer roles are correctly enforced for asset and task operations.
*   **Testing Requirements**:
    *   **Unit Tests**: Asset model, schedule model, task model, scheduling logic (fixed recurrence, one-off), task generation logic, RBAC permissions for new roles.
    *   **Integration Tests**: API endpoints for CRUD operations on assets, schedules, tasks. Notification service integration.
    *   **E2E Tests**: Create an asset, add a schedule, verify task generation, update task status.
    *   **Manual Tests**: Comprehensive testing of all asset management features (new and retained). Schedule creation and task lifecycle management. Role permission checks.
    *   **Performance Tests**: Bulk asset import.

## Phase 3: Advanced Capabilities - Advanced Scheduling, Calendar Integration & Collaboration

*   **Objective**: Introduce advanced maintenance scheduling options, integrate with external calendars, and enhance collaboration features.
*   **Key Features / Systems**:
    *   **Advanced Maintenance Scheduling** (PRD 4.2):
        *   Seasonal/Monthly Templates.
        *   Usage-Based schedules (with manual counter updates initially).
        *   Multiple schedules per asset.
        *   Schedule dependencies.
        *   Blackout dates, business days only option.
    *   **Task Management Enhancements** (PRD 4.3):
        *   Multi-user assignment.
        *   Schedule changes propagation (forward-only).
        *   Subtasks.
        *   Completion requirements (photos, signatures, checklists - basic implementation).
    *   **Collaboration Features** (PRD 4.5):
        *   Invitation system.
        *   @mentions in comments.
        *   Activity streams (basic per asset/task).
        *   Shared asset visibility controls.
    *   **Notifications Expansion** (PRD 4.6):
        *   Email (SMTP) notifications.
        *   Push notifications (PWA basic setup).
        *   Apprise integration.
        *   Webhooks (basic outbound).
        *   Notifications for warranty expirations, task assignments, due dates, overdue tasks, comment mentions, schedule changes.
    *   **Calendar Integration** (PRD 4.6):
        *   Google Calendar two-way sync.
        *   iCalendar feed export.
*   **Dependencies / Prerequisites**:
    *   Completion of Phase 2.
    *   SMTP service configured and tested.
    *   Google Calendar API credentials and setup.
    *   PWA shell established for push notifications.
*   **Acceptance Criteria**:
    *   Users can create and manage all types of advanced schedules (seasonal, usage-based).
    *   Tasks are generated correctly from advanced schedules, respecting dependencies and blackout dates.
    *   Multiple users can be assigned to tasks.
    *   Collaboration features (invitations, @mentions, activity streams) are functional.
    *   A comprehensive suite of notifications (email, in-app, basic PWA push) is working.
    *   Two-way sync with Google Calendar is operational for tasks.
    *   iCalendar feed export is available and functional.
*   **Testing Requirements**:
    *   **Unit Tests**: Advanced scheduling logic (seasonal, usage-based, dependencies), notification generation for all types, calendar sync logic, collaboration feature logic.
    *   **Integration Tests**: Google Calendar API integration, SMTP service, Apprise, Webhook dispatch.
    *   **E2E Tests**: Full lifecycle of an advanced schedule with notifications and calendar sync. User invitation and collaboration flow.
    *   **Manual Tests**: Test all advanced scheduling options thoroughly. Verify all notification channels and types. Test Google Calendar sync robustness (conflicts, updates).
    *   **Usability Tests**: For new collaboration and scheduling features.

## Phase 4: Dashboards, Reporting, API Enhancements & Mobile Support

*   **Objective**: Deliver rich data visualization through dashboards, implement comprehensive reporting, expand API capabilities, and provide robust mobile/offline support via PWA.
*   **Key Features / Systems**:
    *   **Dashboard Views** (PRD 4.4):
        *   Overview Dashboard.
        *   Asset-Centric Dashboard (enhanced DumbAssets view).
        *   Calendar-Centric Dashboard (with drag-and-drop).
        *   Task-Centric Dashboard (Kanban, list views).
    *   **Data Management & Reporting** (PRD 4.7):
        *   Enhanced Excel/CSV import with mapping.
        *   Bulk asset creation from templates.
        *   Full data export (JSON, CSV, Excel).
        *   Backup/restore functionality.
        *   Asset, Task, User reports.
        *   Custom reports builder (basic).
        *   PDF export for reports.
        *   Scheduled reports via email.
    *   **API & Integrations Enhancements** (PRD 4.6):
        *   Comprehensive REST API coverage for all features.
        *   Webhook event enhancements.
    *   **Mobile & Offline Support (PWA)** (PRD 4.8):
        *   PWA with offline mode for core task and asset viewing/editing.
        *   Offline task completion with sync.
        *   Mobile-optimized UI for all features.
        *   Camera integration for photo attachments.
        *   Barcode scanning for asset lookup (basic).
    *   **Security Enhancements** (PRD 5.4):
        *   Audit trail implementation.
        *   GDPR compliance tools (data export/deletion).
*   **Dependencies / Prerequisites**:
    *   Completion of Phase 3.
    *   Mature data set for effective dashboard and report generation.
*   **Acceptance Criteria**:
    *   All four dashboard views are implemented and functional, providing accurate and useful visualizations.
    *   Comprehensive reporting features are available, including custom report building and PDF/scheduled exports.
    *   Data import/export and backup/restore functionalities are robust for self-hosted environments.
    *   The REST API is well-documented (Swagger) and covers all application features.
    *   The PWA provides a good mobile experience, supports offline task management, and syncs correctly.
    *   Camera and barcode scanning features are functional on mobile devices via PWA.
    *   Security enhancements like audit trails and GDPR tools are implemented.
*   **Testing Requirements**:
    *   **Unit Tests**: Dashboard component logic, reporting generation logic, API endpoint consistency, PWA offline sync logic, security feature logic.
    *   **Integration Tests**: API for reporting and dashboards. PWA service worker and caching.
    *   **E2E Tests**: User flow through dashboards, report generation and export. Offline PWA usage and sync.
    *   **Manual Tests**: Thorough testing of all dashboards with various data scenarios. Report accuracy and formatting. PWA functionality across different mobile devices and network conditions (offline, flaky). Test backup and restore procedures for Docker volumes and optional SMB storage.
    *   **Performance Tests**: Dashboard loading times with large datasets. Report generation times.
    *   **Accessibility Tests**: For PWA and dashboards.
    *   **Security Tests**: Audit trail verification. GDPR data export/deletion verification. 