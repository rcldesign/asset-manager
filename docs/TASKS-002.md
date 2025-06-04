# DumbAssets Enhanced - Phase 2 Tasks: Core Functionality

## 1. Database

*   [ ] **DB Design - Assets:** Extend `assets` table schema to include all new fields: `category` (required), `location_id` (link to new `locations` table), `custom_fields` (JSONB), `asset_template_id` (link to new `asset_templates` table), fields for relationships. (Ref: PRD 4.1, 5.3)
*   [ ] **DB Design - Locations:** Design `locations` table (hierarchical). (Ref: PRD 4.1)
*   [ ] **DB Design - Asset Templates:** Design `asset_templates` table. (Ref: PRD 4.1)
*   [ ] **DB Design - Schedules:** Design `schedules` table (linking to assets, storing `schedule_type`, `name`, `config` JSONB for recurrence rules, `is_active`). (Ref: PRD 4.2, 5.3)
*   [ ] **DB Design - Tasks:** Design `tasks` table (linking to `schedules` (optional) and `assets`, `organization_id`, `title`, `description`, `due_date`, `status`, `priority`, basic `cost_estimated`, `cost_actual`, `duration_estimated`, `duration_actual`, `assigned_user_id`). (Ref: PRD 4.3, 5.3)
*   [ ] **DB Design - Task Comments:** Design `task_comments` table (linking to `tasks` and `users`).
*   [ ] **DB Design - Task Attachments:** Design `task_attachments` table (linking to `tasks`, storing file metadata).
*   [ ] **DB Migrations:** Create and apply database migrations for new tables and modifications (assets, locations, asset_templates, schedules, tasks, comments, attachments).

## 2. Backend Development

*   [ ] **Asset Management - CRUD:** Implement backend logic for full CRUD operations on assets, including all new fields (category, custom fields, location, templates, relationships). (Ref: PRD 4.1)
*   [ ] **Asset Management - Retained Features:** Ensure backend logic supports retained DumbAssets features (hierarchy, file attachments for assets, warranty tracking, tags, notes, linking, Excel/CSV import - basic). (Ref: PRD 4.1)
*   [ ] **Asset Management - Location Tracking:** Implement logic for managing hierarchical locations.
*   [ ] **Asset Management - Asset Templates:** Implement logic for creating and applying asset templates.
*   [ ] **Asset Management - Bulk Operations:** Design and implement backend for basic bulk asset operations (e.g., bulk category change, bulk deletion).
*   [ ] **File Storage - Assets & Tasks:** Implement file upload/download/delete logic for asset attachments and task attachments. Default to Docker volume (`/app/uploads`). Implement option to use an external SMB/CIFS share if configured via environment variables. (Ref: PRD 4.1, 4.3, 5.2 modified)
*   [ ] **Scheduling Logic - One-Off:** Implement logic to create one-off schedules and generate corresponding tasks. (Ref: PRD 4.2)
*   [ ] **Scheduling Logic - Fixed Recurrence:** Implement logic for fixed recurrence schedules (every N days/weeks/months/years) and task generation from them (up to 12 months ahead). (Ref: PRD 4.2)
*   [ ] **Task Management - CRUD:** Implement backend logic for CRUD operations on tasks (manual creation, updates to status, details, assignments). (Ref: PRD 4.3)
*   [ ] **Task Management - Lifecycle:** Enforce task state transitions (Planned → In Progress → Done → Skipped). (Ref: PRD 4.3)
*   [ ] **Task Management - Basic Task Generation:** Implement service for automatically generating tasks from active basic schedules.
*   [ ] **Task Management - Comments:** Implement backend logic for adding/viewing comments on tasks.
*   [ ] **RBAC - Roles Expansion:** Implement and enforce permissions for new roles: Manager, Member, Viewer, related to asset and task management. (Ref: PRD 4.5)
*   [ ] **Notifications - Basic In-App:** Implement backend logic for generating and storing basic in-app notifications for task assignments and due dates. (Ref: PRD 4.6)

## 3. API Design / Integration

*   [ ] **API - Assets:** Design and implement REST API endpoints for all asset CRUD operations and new features (locations, templates, bulk ops, relationships). (Ref: PRD 4.1)
*   [ ] **API - File Uploads (Assets/Tasks):** Design and implement API endpoints for uploading/managing file attachments for assets and tasks.
*   [ ] **API - Schedules (Basic):** Design and implement REST API endpoints for CRUD operations on basic schedules (one-off, fixed recurrence). (Ref: PRD 4.2)
*   [ ] **API - Tasks:** Design and implement REST API endpoints for CRUD operations on tasks, including status updates and assignments. (Ref: PRD 4.3)
*   [ ] **API - Task Comments:** Design and implement API endpoints for managing task comments.
*   [ ] **API - Notifications (In-App):** Design and implement API endpoint for users to retrieve their in-app notifications.

## 4. Frontend Development

*   [ ] **UI - Asset List View:** Develop UI to list all assets with filtering, sorting, and display of key new fields. (Ref: PRD 4.1)
*   [ ] **UI - Asset Detail View/Edit Form:** Develop UI to view and edit asset details, incorporating all retained and new fields (custom fields, locations, templates, relationships, attachments). (Ref: PRD 4.1)
*   [ ] **UI - Asset Creation Form:** Develop UI for creating new assets, including template selection.
*   [ ] **UI - Location Management:** Basic UI for managing hierarchical locations (admin/manager).
*   [ ] **UI - Asset Template Management:** Basic UI for managing asset templates (admin/manager).
*   [ ] **UI - Schedule Creation/Management (Basic):** Develop UI for creating and managing one-off and fixed recurrence schedules for assets. (Ref: PRD 4.2)
*   [ ] **UI - Task List View:** Develop UI to list tasks with filters (by asset, user, status, due date) and sorting. (Ref: PRD 4.3)
*   [ ] **UI - Task Detail View/Edit Form:** Develop UI to view and update task details (status, priority, cost/duration estimates, comments, attachments). (Ref: PRD 4.3)
*   [ ] **UI - Manual Task Creation Form:** Develop UI for manually creating tasks.
*   [ ] **UI - In-App Notification Display:** Implement a basic UI element to display in-app notifications.
*   [ ] **API Integration:** Connect all new frontend views and components to their respective backend APIs.

## 5. Security

*   [ ] **Access Control - Assets:** Ensure RBAC is correctly applied to all asset CRUD operations based on user roles (Owner, Manager, Member, Viewer).
*   [ ] **Access Control - Schedules & Tasks:** Ensure RBAC is correctly applied to schedule and task CRUD operations.
*   [ ] **File Upload Security:** Implement security measures for file uploads (type validation, size limits, consider virus scanning integration point). (Ref: PRD 5.4)

## 6. DevOps / Hosting

*   [ ] **CI/CD - Phase 2 Tests:** Add new unit, integration, and E2E tests for Phase 2 features to the GitHub Actions CI/CD pipeline.
*   [ ] **Backup Strategy - Files:** Define and document strategy for backing up user-uploaded files. Cover Docker volume backup methods (e.g., volume snapshots, copying data from volume) and note that SMB share backups are managed by the user's existing SMB infrastructure.

## 7. Testing

*   [ ] **Tests:** **Unit Tests:** Backend: Asset model (all fields), schedule model (basic), task model (basic), fixed recurrence scheduling logic, task generation from basic schedules, RBAC for new roles on assets/tasks. (Ref: PHASES.md)
*   [ ] **Tests:** **Unit Tests:** Frontend: Asset forms, task forms, schedule forms, list view components.
*   [ ] **Tests:** **Integration Tests:** API endpoints for CRUD on assets (incl. new features), schedules (basic), tasks. File upload/download. Notification service for in-app messages. (Ref: PHASES.md)
*   [ ] **Tests:** **E2E Tests:** Full asset lifecycle (create with custom fields, edit, attach file, delete). Create an asset, add a basic fixed schedule, verify task generation, update task status, add a comment. (Ref: PHASES.md)
*   [ ] **Tests:** **Manual Tests:** Test all asset management features (new & retained). Create various fixed recurrence and one-off schedules, verify task generation and lifecycle. Check role permissions (Manager, Member, Viewer) for assets and tasks. Test file attachments. (Ref: PHASES.md)
*   [ ] **Tests:** **Performance Tests:** Basic test for bulk asset import (CSV/Excel). Performance of listing assets/tasks with moderate data. (Ref: PHASES.md)

## 8. Documentation

*   [ ] **Docs:** **API Documentation:** Add/update Swagger/OpenAPI for all new and modified endpoints (Assets, Schedules, Tasks, Files, Notifications).
*   [ ] **Docs:** **Code Documentation (JSDoc):** Add JSDoc for all new backend services/controllers and key frontend components related to assets, schedules, tasks.
*   [ ] **Docs:** **User Guide - Assets:** Draft initial user guide sections for managing assets with new features, including file attachment options (local volume vs SMB).
*   [ ] **Docs:** **User Guide - Basic Scheduling & Tasks:** Draft initial user guide sections for creating basic schedules and managing tasks.
*   [ ] **Docs:** **Database Schema Diagram:** Update schema diagram to include Phase 2 entities and relationships. 