# Technical Requirements Document: Maintenance Manager

## 1. Executive Summary

This document outlines the technical requirements for Maintenance Manager, a web application for defining, scheduling, and tracking maintenance tasks for various assets. It details the system architecture, feature implementation, data models, API design, security considerations, and deployment strategy. The technical stack includes Node.js (Express.js with TypeScript) for the backend, PostgreSQL for the database, React (Next.js) for the frontend, Bull Queue for task queuing, Redis as a message broker, and Docker for containerization. This TRD serves as a blueprint for development, ensuring a scalable, secure, and maintainable application.

## 2. System Overview and Architecture

### 2.1. Components

The system comprises the following major components:

1.  **Frontend (Web Application):** A Single Page Application (SPA) built with React (Next.js) and Material-UI (MUI). Users interact with this interface to manage assets, schedules, and tasks. It communicates with the Backend API.
2.  **Backend API:** A RESTful API built with Node.js (Express.js with TypeScript). It handles all business logic, data processing, user authentication, and communication with the database and task queue.
3.  **Database:** A PostgreSQL relational database to store all persistent data, including user accounts, assets, schedules, tasks, and usage counters.
4.  **Task Workers (Bull Queue):** Background workers managed by Bull Queue that execute asynchronous tasks such as:
    *   Generating scheduled maintenance tasks.
    *   Sending email notifications and digests.
    *   Processing Google Calendar synchronizations.
5.  **Message Broker (Redis):** Used by Bull Queue to manage the queue of tasks for asynchronous processing. Redis may also be used for caching frequently accessed, non-critical data if needed.
6.  **Authentication Service:** OpenID Connect (OIDC) compatible service (e.g., Keycloak if self-hosted, or cloud-based IdP like Auth0/Okta). Handles user registration, login, and token issuance.

### 2.2. Architecture Diagram (Conceptual)

```
[User via Browser/PWA] <--> [Frontend (React/Next.js)]
        ^                                      |
        | (HTTPS - REST API Calls)             | (HTTPS - REST API Calls)
        v                                      v
[Backend API (Node.js/Express)] <------> [Authentication Service (OIDC)]
        |       ^       |
        |       |       | (Bull Queue Jobs)
        | (SQL) |       v
        v       | [Task Workers (Bull Queue + Node.js)]
[Database (PostgreSQL)] |       |
        ^       |       | (Job Queue)
        |_______|_______v
                [Message Broker (Redis)]
```

### 2.3. Workflow Highlights

*   **User Interaction:** User performs actions in the Frontend -> Frontend sends API requests to Backend.
*   **Task Generation:** Bull Queue schedules a periodic job -> Bull Worker picks up job -> Worker queries Database for active schedules -> Worker generates new tasks and saves them to Database.
*   **Notifications:** Bull Worker picks up notification job (e.g., daily digest) -> Worker queries Database for relevant tasks/users -> Worker sends emails via SMTP server.
*   **Google Calendar Sync:** User action or scheduled job triggers Bull Worker -> Worker interacts with Google Calendar API -> Updates are reflected in Database and/or Google Calendar.

## 3. Detailed Feature Implementation

*(This section details backend logic and key frontend components for each core feature from PRD.md)*

### 3.1. Asset Management (PRD 3.1)

*   **Backend (Express.js):**
    *   Models: `Asset`, `CustomFieldDefinition` (if custom fields are globally defined).
    *   Endpoints:
        *   `POST /assets`: Create new asset. Validates required fields (name, category). Stores `custom_fields` as JSONB.
        *   `GET /assets`: List assets with pagination and filtering (name, category, tags).
        *   `GET /assets/{asset_id}`: Retrieve specific asset.
        *   `PUT /assets/{asset_id}`: Update asset details.
        *   `DELETE /assets/{asset_id}`: Delete asset (consider soft delete).
    *   Logic: CRUD operations for assets. Handle custom field storage and retrieval using an ORM like Prisma or TypeORM.
*   **Frontend (React/Next.js):**
    *   Components: `AssetList`, `AssetListItem`, `AssetForm`, `AssetDetailView`.
    *   State Management: Manage asset list, individual asset data, form state using React hooks or state management library like Zustand.
    *   API Calls: Interact with backend asset endpoints using fetch or axios.

### 3.2. Flexible Scheduling Engine (PRD 3.2)

*   **Backend (Express.js):**
    *   Models: `Schedule`, `UsageCounter`.
    *   Endpoints:
        *   `POST /assets/{asset_id}/schedules`: Create a new schedule for an asset.
            *   Payload includes `schedule_type` and `config_json` specific to the type.
            *   Validation of `config_json` structure based on `schedule_type` using libraries like Joi or Zod.
        *   `GET /assets/{asset_id}/schedules`: List schedules for an asset.
        *   `GET /schedules/{schedule_id}`: Retrieve specific schedule.
        *   `PUT /schedules/{schedule_id}`: Update schedule. Triggers re-calculation of future tasks (see 3.3).
        *   `DELETE /schedules/{schedule_id}`: Delete schedule (and its future, non-completed tasks).
        *   `POST /usage-counters`: Create a usage counter for an asset.
        *   `PUT /usage-counters/{counter_id}`: Update counter value. This may trigger task status changes.
    *   Logic:
        *   **Schedule Creation/Update:** Store schedule configuration. If `start_date` or initial conditions imply immediate task generation for some types, delegate to task generation logic.
        *   **Usage Counter Update:** When a counter is updated, check all `USAGE_BASED` schedules linked to that asset and counter name. If a threshold is met, create/update the corresponding task's due date or status.
        *   Helper functions to parse `config_json` for each schedule type.
*   **Frontend (React/Next.js):**
    *   Components: `ScheduleList`, `ScheduleForm` (with dynamic fields based on schedule type), `UsageCounterForm`.
    *   Logic: Complex form handling for different schedule types using libraries like React Hook Form. UI to update counter values.

### 3.3. Automated Task Generation (PRD 3.3)

*   **Backend (Bull Queue Worker):**
    *   Jobs: `generateTasksForSchedule(scheduleId)` and a periodic master job `generateAllUpcomingTasks()`.
    *   Logic for `generateAllUpcomingTasks()`:
        1.  Fetch all `is_active=true` schedules.
        2.  For each schedule, determine the "next due date" based on its type and `config_json`, and the last generated/completed task for that schedule.
        3.  Generate tasks up to the configured forward-looking period (e.g., 12 months).
        4.  **Fixed Recurrence:** Calculate dates using date libraries like date-fns or dayjs. Handle month-end logic carefully.
        5.  **Seasonal/Monthly Template:** Iterate through the template for the upcoming 12 months, creating tasks.
        6.  **Usage-Based:** Tasks are primarily generated/updated when counter values change. This nightly job might ensure placeholder tasks exist or update their "expected by" dates if not yet triggered.
        7.  **One-Off:** Ensure the task exists if within the forward window.
        8.  Store new tasks in the `Task` table. Link to `schedule_id` and `asset_id`.
    *   Logic for `Forward-Only Propagation` (when a schedule is edited via `PUT /schedules/{schedule_id}`):
        1.  Delete all future (`due_date >= NOW` AND `status` NOT IN (DONE, SKIPPED)) tasks linked to this `schedule_id`.
        2.  Call `generateTasksForSchedule(scheduleId)` to regenerate tasks from NOW.
        3.  If only content/description changes, update existing future tasks without changing dates.
    *   Model: `ScheduleChangeLog` - record significant changes to `Schedule.config_json`.
*   **Database:** Efficient queries to find active schedules and their last generated tasks. Indexes on `Schedule.is_active`, `Task.schedule_id`, `Task.due_date`, `Task.status`.

### 3.4. Task Visualization and Views (PRD 3.4)

*   **Backend (Express.js):**
    *   Endpoints:
        *   `GET /tasks`: List tasks with filters (asset_id, tag, assigned_user_id, status, due_date_start, due_date_end), sorting, pagination.
        *   `GET /tasks/{task_id}`: Retrieve specific task.
    *   Logic: Efficiently query and serialize task data. Join with Asset for color-coding information if needed (or denormalize category/color onto Task).
*   **Frontend (React/Next.js):**
    *   Components: `CalendarView` (using FullCalendar.io or similar), `TaskListView`, `TaskFilterControls`, `TaskDetailModal`.
    *   Logic: Fetch task data, manage filters, render calendar and list views. Handle event clicks on calendar to show task details.

### 3.5. Task Workflow Management (PRD 3.5)

*   **Backend (Express.js):**
    *   Models: `Task`, `TaskAssignment`, `TaskComment`, `TaskAttachment`.
    *   Endpoints:
        *   `PUT /tasks/{task_id}`: Update task (status, assignees, costs, durations, notes).
        *   `POST /tasks/{task_id}/assignments`: Assign/unassign users.
        *   `POST /tasks/{task_id}/comments`: Add a comment.
        *   `GET /tasks/{task_id}/comments`: List comments.
        *   `POST /tasks/{task_id}/attachments`: Upload an attachment (handle file storage using multer middleware, store to local disk or AWS S3).
        *   `GET /tasks/{task_id}/attachments/{attachment_id}`: Download an attachment.
    *   Logic: Update task status, manage assignments. Store comments and file metadata. File uploads will require multipart form handling with multer.
*   **Frontend (React/Next.js):**
    *   Components: `TaskDetailModal` (with controls to change status, assign users, add comments, upload files), `CommentList`, `AttachmentList`.
    *   Logic: API calls to update task details. File upload handling with progress indicators.

### 3.6. Notifications and Reminders (PRD 3.6)

*   **Backend (Bull Queue Worker):**
    *   Job: `sendDailyDigestEmails()`.
    *   Logic:
        1.  Fetch users who have opted into notifications.
        2.  For each user, fetch tasks due today or upcoming (e.g., next 7 days).
        3.  Format email content (HTML/text). Use a templating engine like Handlebars or EJS.
        4.  Send email via an SMTP service (e.g., AWS SES, SendGrid, or configured SMTP server) using nodemailer.
    *   Job: `generateIcalFeed(userId)` (or per-organization).
    *   Logic:
        1.  Fetch relevant tasks.
        2.  Generate iCalendar (.ics) format. Libraries like `ical-generator` for Node.js can be used.
        3.  Provide a secure, unique URL per user/feed.
*   **Backend (Express.js):**
    *   Endpoint: `GET /ical/{feed_token}` to serve iCalendar files.
*   **Configuration:** SMTP server details, email templates, iCal feed settings.

### 3.7. User Management and Access Control (PRD 3.7)

*   **Backend (Express.js & OIDC Provider):**
    *   Integration with OIDC provider:
        *   Frontend redirects to OIDC provider for login.
        *   OIDC provider redirects back with an auth code.
        *   Backend exchanges auth code for ID token and access token.
        *   Access token (JWT) is used to authenticate API requests using libraries like jsonwebtoken.
    *   Models: `User`, `Organization`.
    *   Endpoints:
        *   `/auth/login`, `/auth/callback`, `/auth/logout` (interacting with OIDC).
        *   `GET /users/me`: Get current user profile.
        *   `POST /organizations`: Create a new organization/household (first user becomes Owner).
        *   `POST /organizations/{org_id}/users`: Invite user to organization (generates invite, sets role).
    *   Logic: JWT validation middleware using passport-jwt or similar. RBAC logic in endpoint handlers (e.g., middleware checking user role and organization membership).
*   **Frontend (React/Next.js):**
    *   Handle OIDC redirects using libraries like next-auth. Store JWT securely (HttpOnly cookies preferred).
    *   Attach JWT to API requests using axios interceptors.
    *   UI for login, profile management, inviting users.

### 3.8. Google Calendar Integration (PRD 3.8)

*   **Backend (Bull Queue Worker & Express.js):**
    *   OAuth2 Flow for Google Calendar:
        *   Express.js endpoint to initiate OAuth2 flow, redirect to Google.
        *   Express.js callback endpoint to receive auth code, exchange for tokens, store refresh token securely (encrypted in DB).
    *   Bull Queue Jobs:
        *   `syncTaskToGoogleCalendar(taskId, userId)`
        *   `processGoogleCalendarWebhook(payload)` (if using webhooks for 2-way sync).
    *   Logic:
        *   Use Google Calendar API client library for Node.js (googleapis).
        *   Create, update, delete events in user's Google Calendar.
        *   Handle API errors, rate limits, retries using exponential backoff.
        *   For 2-way sync:
            *   Set up Google Calendar push notifications (webhooks) for changes. Requires a publicly accessible webhook receiver endpoint on the Express.js backend.
            *   Webhook handler needs to parse incoming notifications and update tasks in local DB. This is complex, especially for self-hosted instances (NAT traversal).
*   **Frontend (React/Next.js):**
    *   Button to "Connect Google Calendar" to initiate OAuth flow.
    *   UI to manage connection status.
*   **Security:** Store Google API refresh tokens encrypted using libraries like crypto or bcrypt.

### 3.9. API for External Integrations (PRD 3.9)

*   **Backend (Express.js):**
    *   Authentication: API Key or OAuth2 client credentials flow for external apps using passport-local or custom middleware.
    *   Endpoints: As defined in PRD (assets, schedules, tasks, counters). Prioritize read access and specific write access (e.g., updating counters).
    *   Documentation: Generate OpenAPI (Swagger) documentation using swagger-jsdoc and swagger-ui-express. Provide Postman collection.
    *   WebSockets:
        *   Use Socket.io for WebSocket support.
        *   Example: `/ws/counters/{asset_id}` - stream real-time updates when a counter for that asset changes.
        *   Authentication for WebSockets using JWT tokens.

## 4. Data Model (Detailed - PostgreSQL)

*(Based on PRD Conceptual Model, with PostgreSQL types and constraints)*

```sql
-- Users and Organization
CREATE TABLE "Organization" (
    "organization_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "owner_user_id" UUID UNIQUE, -- Initially NULL, set after User created
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "User" (
    "user_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password_hash" VARCHAR(255), -- If not solely OIDC
    "role" VARCHAR(50) NOT NULL CHECK ("role" IN ('OWNER', 'EDITOR', 'VIEWER')),
    "full_name" VARCHAR(255),
    "organization_id" UUID NOT NULL REFERENCES "Organization"("organization_id") ON DELETE CASCADE,
    "google_auth_tokens" JSONB, -- Encrypted
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Organization" ADD CONSTRAINT "fk_owner_user_id" FOREIGN KEY ("owner_user_id") REFERENCES "User"("user_id") ON DELETE SET NULL;
CREATE INDEX "idx_user_email" ON "User"("email");
CREATE INDEX "idx_user_organization_id" ON "User"("organization_id");

-- Assets and Related
CREATE TABLE "Asset" (
    "asset_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL REFERENCES "Organization"("organization_id") ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "location" VARCHAR(255),
    "purchase_date" DATE,
    "notes" TEXT,
    "tags" TEXT[],
    "custom_fields" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_asset_organization_id" ON "Asset"("organization_id");
CREATE INDEX "idx_asset_category" ON "Asset"("category");
CREATE INDEX "idx_asset_tags" ON "Asset" USING GIN ("tags");

CREATE TABLE "UsageCounter" (
    "counter_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL REFERENCES "Asset"("asset_id") ON DELETE CASCADE,
    "counter_name" VARCHAR(100) NOT NULL,
    "current_value" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("asset_id", "counter_name")
);
CREATE INDEX "idx_usage_counter_asset_id" ON "UsageCounter"("asset_id");

-- Schedules
CREATE TABLE "Schedule" (
    "schedule_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL REFERENCES "Asset"("asset_id") ON DELETE CASCADE,
    "schedule_type" VARCHAR(50) NOT NULL CHECK ("schedule_type" IN ('FIXED_RECURRENCE', 'SEASONAL_TEMPLATE', 'USAGE_BASED', 'ONE_OFF')),
    "name" VARCHAR(255),
    "description_template" TEXT,
    "config_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_schedule_asset_id" ON "Schedule"("asset_id");
CREATE INDEX "idx_schedule_is_active" ON "Schedule"("is_active");
CREATE INDEX "idx_schedule_type" ON "Schedule"("schedule_type");

-- Tasks
CREATE TABLE "Task" (
    "task_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL REFERENCES "Schedule"("schedule_id") ON DELETE CASCADE,
    "asset_id" UUID NOT NULL REFERENCES "Asset"("asset_id") ON DELETE CASCADE,
    "organization_id" UUID NOT NULL REFERENCES "Organization"("organization_id") ON DELETE CASCADE,
    "description" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(50) NOT NULL CHECK ("status" IN ('PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED')) DEFAULT 'PLANNED',
    "completed_at" TIMESTAMPTZ,
    "skipped_at" TIMESTAMPTZ,
    "notes_details" TEXT,
    "estimated_duration_minutes" INTEGER,
    "actual_duration_minutes" INTEGER,
    "estimated_cost" DECIMAL(10,2),
    "actual_cost" DECIMAL(10,2),
    "google_calendar_event_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_task_schedule_id" ON "Task"("schedule_id");
CREATE INDEX "idx_task_asset_id" ON "Task"("asset_id");
CREATE INDEX "idx_task_organization_id" ON "Task"("organization_id");
CREATE INDEX "idx_task_due_date" ON "Task"("due_date");
CREATE INDEX "idx_task_status" ON "Task"("status");
CREATE INDEX "idx_task_google_calendar_event_id" ON "Task"("google_calendar_event_id");

-- Task Assignments
CREATE TABLE "TaskAssignment" (
    "task_assignment_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL REFERENCES "Task"("task_id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "User"("user_id") ON DELETE CASCADE,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("task_id", "user_id")
);
CREATE INDEX "idx_task_assignment_task_id" ON "TaskAssignment"("task_id");
CREATE INDEX "idx_task_assignment_user_id" ON "TaskAssignment"("user_id");

-- Task Comments
CREATE TABLE "TaskComment" (
    "comment_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL REFERENCES "Task"("task_id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "User"("user_id") ON DELETE CASCADE,
    "comment_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_task_comment_task_id" ON "TaskComment"("task_id");
CREATE INDEX "idx_task_comment_user_id" ON "TaskComment"("user_id");

-- Task Attachments
CREATE TABLE "TaskAttachment" (
    "attachment_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL REFERENCES "Task"("task_id") ON DELETE CASCADE,
    "uploaded_by_user_id" UUID NOT NULL REFERENCES "User"("user_id") ON DELETE CASCADE,
    "original_filename" VARCHAR(255) NOT NULL,
    "stored_filename" VARCHAR(255) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "upload_date" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_task_attachment_task_id" ON "TaskAttachment"("task_id");
CREATE INDEX "idx_task_attachment_uploaded_by_user_id" ON "TaskAttachment"("uploaded_by_user_id");

-- Schedule Change Log
CREATE TABLE "ScheduleChangeLog" (
    "log_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL REFERENCES "Schedule"("schedule_id") ON DELETE CASCADE,
    "changed_by_user_id" UUID NOT NULL REFERENCES "User"("user_id") ON DELETE CASCADE,
    "change_type" VARCHAR(50) NOT NULL CHECK ("change_type" IN ('CONTENT_UPDATE', 'PATTERN_UPDATE', 'STATUS_CHANGE')),
    "old_config_json" JSONB,
    "new_config_json" JSONB,
    "change_description" TEXT,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_schedule_change_log_schedule_id" ON "ScheduleChangeLog"("schedule_id");
CREATE INDEX "idx_schedule_change_log_changed_by_user_id" ON "ScheduleChangeLog"("changed_by_user_id");
CREATE INDEX "idx_schedule_change_log_changed_at" ON "ScheduleChangeLog"("changed_at");
```

## 5. API Design and Specification

### 5.1. Authentication and Authorization

*   **Authentication Methods:**
    *   **OIDC Integration:** JWT tokens from OIDC provider (e.g., Keycloak, Auth0).
    *   **API Keys:** For external integrations, stored securely and associated with specific permissions.
    *   **Fallback Local Auth:** JWT tokens issued by the application for username/password authentication.

*   **Authorization Middleware:**
    ```typescript
    interface AuthenticatedRequest extends Request {
        user: {
            user_id: string;
            organization_id: string;
            role: 'OWNER' | 'EDITOR' | 'VIEWER';
            email: string;
        };
    }

    // Middleware to validate JWT and populate req.user
    const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        // JWT validation logic using jsonwebtoken
    };

    // Middleware to check organization access
    const requireOrganizationAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        // Ensure user can only access data from their organization
    };

    // Middleware to check role permissions
    const requireRole = (roles: string[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        // Check if user role is in allowed roles
    };
    ```

### 5.2. Core API Endpoints

#### Assets
```typescript
// GET /api/assets
// Query params: ?page=1&limit=20&category=vehicle&search=honda&tags=outdoor
interface AssetListResponse {
    assets: Asset[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// POST /api/assets
interface CreateAssetRequest {
    name: string;
    category: string;
    location?: string;
    purchase_date?: string; // ISO date
    notes?: string;
    tags?: string[];
    custom_fields?: Record<string, any>;
}

// PUT /api/assets/:asset_id
interface UpdateAssetRequest extends Partial<CreateAssetRequest> {}
```

#### Schedules
```typescript
// POST /api/assets/:asset_id/schedules
interface CreateScheduleRequest {
    schedule_type: 'FIXED_RECURRENCE' | 'SEASONAL_TEMPLATE' | 'USAGE_BASED' | 'ONE_OFF';
    name?: string;
    description_template?: string;
    config_json: ScheduleConfig;
}

// Union type for different schedule configurations
type ScheduleConfig = 
    | FixedRecurrenceConfig 
    | SeasonalTemplateConfig 
    | UsageBasedConfig 
    | OneOffConfig;

interface FixedRecurrenceConfig {
    interval_unit: 'days' | 'weeks' | 'months' | 'years';
    interval_value: number;
    start_date: string; // ISO date
}

interface SeasonalTemplateConfig {
    tasks: Array<{
        month: number; // 1-12
        day_of_month?: number; // 1-31, optional for "any day in month"
        task_description: string;
    }>;
}

interface UsageBasedConfig {
    counter_name: string;
    threshold_value: number;
    unit?: string;
}

interface OneOffConfig {
    due_date: string; // ISO date
}
```

#### Tasks
```typescript
// GET /api/tasks
// Query params: ?asset_id=uuid&status=PLANNED&assigned_user_id=uuid&due_date_start=2024-01-01&due_date_end=2024-12-31&page=1&limit=20
interface TaskListResponse {
    tasks: TaskWithRelations[];
    pagination: PaginationInfo;
}

interface TaskWithRelations extends Task {
    asset: {
        asset_id: string;
        name: string;
        category: string;
    };
    assignees: Array<{
        user_id: string;
        full_name: string;
        email: string;
    }>;
}

// PUT /api/tasks/:task_id
interface UpdateTaskRequest {
    status?: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
    notes_details?: string;
    estimated_duration_minutes?: number;
    actual_duration_minutes?: number;
    estimated_cost?: number;
    actual_cost?: number;
    assignee_user_ids?: string[]; // Array of user IDs to assign
}
```

### 5.3. Error Handling

```typescript
interface APIError {
    error: {
        code: string;
        message: string;
        details?: any;
        timestamp: string;
    };
}

// Standard error codes
const ERROR_CODES = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
} as const;
```

## 6. Background Jobs and Task Processing

### 6.1. Bull Queue Configuration

```typescript
import Bull from 'bull';
import Redis from 'redis';

// Queue setup
const redis = new Redis(process.env.REDIS_URL);
const taskQueue = new Bull('task generation', { redis });
const notificationQueue = new Bull('notifications', { redis });
const calendarQueue = new Bull('calendar sync', { redis });

// Job types
interface GenerateTasksJob {
    type: 'generate-all-tasks' | 'generate-schedule-tasks';
    scheduleId?: string;
    forwardMonths: number;
}

interface NotificationJob {
    type: 'daily-digest' | 'task-reminder';
    userId?: string;
    taskId?: string;
}

interface CalendarSyncJob {
    type: 'sync-task-to-calendar' | 'process-calendar-webhook';
    taskId?: string;
    userId?: string;
    webhookPayload?: any;
}
```

### 6.2. Task Generation Logic

```typescript
class TaskGenerationService {
    async generateAllUpcomingTasks(): Promise<void> {
        const schedules = await this.getActiveSchedules();
        
        for (const schedule of schedules) {
            await this.generateTasksForSchedule(schedule);
        }
    }

    async generateTasksForSchedule(schedule: Schedule): Promise<Task[]> {
        const existingTasks = await this.getExistingTasks(schedule.schedule_id);
        const lastTaskDate = this.getLastTaskDate(existingTasks);
        
        switch (schedule.schedule_type) {
            case 'FIXED_RECURRENCE':
                return this.generateFixedRecurrenceTasks(schedule, lastTaskDate);
            case 'SEASONAL_TEMPLATE':
                return this.generateSeasonalTasks(schedule, lastTaskDate);
            case 'USAGE_BASED':
                return this.generateUsageBasedTasks(schedule);
            case 'ONE_OFF':
                return this.generateOneOffTask(schedule);
        }
    }

    private generateFixedRecurrenceTasks(schedule: Schedule, lastTaskDate?: Date): Task[] {
        const config = schedule.config_json as FixedRecurrenceConfig;
        const tasks: Task[] = [];
        const endDate = this.addMonths(new Date(), 12); // 12 months forward
        
        let currentDate = lastTaskDate ? 
            this.addInterval(lastTaskDate, config.interval_unit, config.interval_value) :
            new Date(config.start_date);

        while (currentDate <= endDate) {
            tasks.push(this.createTask(schedule, currentDate));
            currentDate = this.addInterval(currentDate, config.interval_unit, config.interval_value);
        }

        return tasks;
    }

    private addInterval(date: Date, unit: string, value: number): Date {
        // Use date-fns or dayjs for date manipulation
        switch (unit) {
            case 'days':
                return addDays(date, value);
            case 'weeks':
                return addWeeks(date, value);
            case 'months':
                return addMonths(date, value);
            case 'years':
                return addYears(date, value);
            default:
                throw new Error(`Unknown interval unit: ${unit}`);
        }
    }
}
```

## 7. Security Implementation

### 7.1. Authentication Security

```typescript
// JWT configuration
const JWT_CONFIG = {
    secret: process.env.JWT_SECRET,
    expiresIn: '24h',
    refreshExpiresIn: '7d',
    algorithm: 'HS256' as const
};

// Password hashing (if not using OIDC)
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash);
};
```

### 7.2. Data Encryption

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes key
const ALGORITHM = 'aes-256-gcm';

export const encryptSensitiveData = (text: string): string => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    cipher.setIV(iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

export const decryptSensitiveData = (encryptedData: string): string => {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    decipher.setIV(iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
};
```

### 7.3. Input Validation and Sanitization

```typescript
import Joi from 'joi';
import xss from 'xss';

// Asset validation schema
const createAssetSchema = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    category: Joi.string().min(1).max(100).required(),
    location: Joi.string().max(255).optional(),
    purchase_date: Joi.date().iso().optional(),
    notes: Joi.string().max(5000).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
    custom_fields: Joi.object().optional()
});

// Sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
            return xss(value, {
                whiteList: {}, // Allow no HTML tags
                stripIgnoreTag: true,
                stripIgnoreTagBody: ['script']
            });
        }
        if (Array.isArray(value)) {
            return value.map(sanitizeValue);
        }
        if (typeof value === 'object' && value !== null) {
            const sanitized: any = {};
            for (const [key, val] of Object.entries(value)) {
                sanitized[key] = sanitizeValue(val);
            }
            return sanitized;
        }
        return value;
    };

    req.body = sanitizeValue(req.body);
    req.query = sanitizeValue(req.query);
    next();
};
```

## 8. Performance Optimization

### 8.1. Database Optimization

*   **Connection Pooling:** Use connection pooling with libraries like `pg-pool` for PostgreSQL.
*   **Query Optimization:** Implement efficient indexes as shown in the schema.
*   **Pagination:** Always paginate large datasets with proper LIMIT/OFFSET or cursor-based pagination.
*   **Query Caching:** Cache frequently accessed, read-heavy data in Redis.

### 8.2. API Performance

```typescript
// Rate limiting
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many API requests, please try again later.'
});

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Stricter limit for sensitive operations
    message: 'Rate limit exceeded for this operation.'
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', strictLimiter);
```

### 8.3. Caching Strategy

```typescript
import Redis from 'redis';

class CacheService {
    private redis: Redis.RedisClient;

    constructor() {
        this.redis = new Redis(process.env.REDIS_URL);
    }

    async cacheUserTasks(userId: string, tasks: Task[], ttl: number = 300): Promise<void> {
        const key = `user_tasks:${userId}`;
        await this.redis.setex(key, ttl, JSON.stringify(tasks));
    }

    async getCachedUserTasks(userId: string): Promise<Task[] | null> {
        const key = `user_tasks:${userId}`;
        const cached = await this.redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }

    async invalidateUserCache(userId: string): Promise<void> {
        const pattern = `user_*:${userId}`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }
}
```

## 9. Testing Strategy

### 9.1. Backend Testing

```typescript
// Unit test example with Jest
import { TaskGenerationService } from '../services/TaskGenerationService';
import { Schedule } from '../models/Schedule';

describe('TaskGenerationService', () => {
    let service: TaskGenerationService;

    beforeEach(() => {
        service = new TaskGenerationService();
    });

    describe('generateFixedRecurrenceTasks', () => {
        it('should generate monthly tasks correctly', () => {
            const schedule: Schedule = {
                schedule_id: 'test-id',
                schedule_type: 'FIXED_RECURRENCE',
                config_json: {
                    interval_unit: 'months',
                    interval_value: 3,
                    start_date: '2024-01-01'
                }
            };

            const tasks = service.generateFixedRecurrenceTasks(schedule);
            
            expect(tasks).toHaveLength(4); // 4 quarters in a year
            expect(tasks[0].due_date).toBe('2024-01-01');
            expect(tasks[1].due_date).toBe('2024-04-01');
        });
    });
});
```

### 9.2. Integration Testing

```typescript
// API integration test
import request from 'supertest';
import { app } from '../app';

describe('Assets API', () => {
    let authToken: string;

    beforeAll(async () => {
        // Setup test user and get auth token
        authToken = await getTestAuthToken();
    });

    describe('POST /api/assets', () => {
        it('should create a new asset', async () => {
            const assetData = {
                name: 'Test Vehicle',
                category: 'vehicle',
                tags: ['outdoor', 'maintenance']
            };

            const response = await request(app)
                .post('/api/assets')
                .set('Authorization', `Bearer ${authToken}`)
                .send(assetData);

            expect(response.status).toBe(201);
            expect(response.body.asset.name).toBe(assetData.name);
            expect(response.body.asset.asset_id).toBeDefined();
        });
    });
});
```

## 10. Deployment and DevOps

### 10.1. Docker Configuration

```dockerfile
# Backend Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY dist/ ./dist/
COPY public/ ./public/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: maintenance_manager
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/maintenance_manager
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    ports:
      - "3001:3000"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      - backend

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: ["node", "dist/worker.js"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/maintenance_manager
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

### 10.2. Environment Configuration

```bash
# .env.example
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/maintenance_manager
POSTGRES_PASSWORD=your_secure_password

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secure-jwt-secret
ENCRYPTION_KEY=your-32-byte-encryption-key

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Google Calendar (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OIDC (optional)
OIDC_ISSUER_URL=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-oidc-client-id
OIDC_CLIENT_SECRET=your-oidc-client-secret

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB

# Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
```

This Technical Requirements Document provides a comprehensive blueprint for implementing the Maintenance Manager application using Node.js/Express backend and React/Next.js frontend, replacing the original Python/FastAPI design while maintaining all the core functionality and requirements outlined in the PRD. 