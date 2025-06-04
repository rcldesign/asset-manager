# DumbAssets Enhanced - Phase 3 Tasks: Advanced Capabilities

## 1. Database

*   [ ] **DB Design - Schedules (Advanced):** Extend `schedules` table or related tables to support `config` for Seasonal/Monthly templates, Usage-Based triggers (counter definitions), multiple schedules per asset, schedule dependencies, blackout dates, business days option. (Ref: PRD 4.2)
*   [ ] **DB Design - Usage Counters:** Design `usage_counters` table (linking to assets or schedules, storing counter type, value, last updated). (Ref: PRD 4.2)
*   [ ] **DB Design - Tasks (Advanced):** Extend `tasks` table for multi-user assignment (e.g., join table `task_assignees`), subtasks (self-referential foreign key or join table), completion requirements (JSONB for checklist, photo required flag, etc.). (Ref: PRD 4.3)
*   [ ] **DB Design - User Invitations:** Design `user_invitations` table (token, email, inviting user, organization, expiration). (Ref: PRD 4.5)
*   [ ] **DB Design - Activity Streams:** Design `activity_streams` table (recording user actions, related entity, timestamp). (Ref: PRD 4.5)
*   [ ] **DB Design - Notification Preferences:** Design `user_notification_preferences` table. (Ref: PRD 4.6)
*   [ ] **DB Migrations:** Create and apply database migrations for all schema changes related to advanced scheduling, tasks, collaboration, and notifications.

## 2. Backend Development

*   [ ] **Scheduling Logic - Seasonal/Monthly:** Implement logic for seasonal/monthly schedule templates and task generation. (Ref: PRD 4.2)
*   [ ] **Scheduling Logic - Usage-Based:** Implement logic for usage-based schedules, including manual counter updates and task generation upon counter triggers. (Ref: PRD 4.2)
*   [ ] **Scheduling Logic - Multiple Schedules per Asset:** Ensure an asset can have multiple independent schedules. (Ref: PRD 4.2)
*   [ ] **Scheduling Logic - Dependencies:** Implement logic to handle schedule dependencies (complete task A before task B starts). (Ref: PRD 4.2)
*   [ ] **Scheduling Logic - Blackout Dates/Business Days:** Implement support for blackout dates and "business days only" options in scheduling. (Ref: PRD 4.2)
*   [ ] **Task Management - Multi-User Assignment:** Implement logic for assigning tasks to multiple users. (Ref: PRD 4.3)
*   [ ] **Task Management - Schedule Change Propagation:** Implement forward-only propagation for schedule changes to planned tasks. (Ref: PRD 4.3)
*   [ ] **Task Management - Subtasks:** Implement backend logic for creating and managing subtasks. (Ref: PRD 4.3)
*   [ ] **Task Management - Completion Requirements:** Implement backend logic to define and track completion requirements (e.g., checklist items, photo required). (Ref: PRD 4.3)
*   [ ] **Collaboration - Invitation System:** Implement backend logic for user invitations (generate token, send email, handle acceptance). (Ref: PRD 4.5)
*   [ ] **Collaboration - @mentions:** Implement backend logic to parse @mentions in comments and link to users, potentially triggering notifications. (Ref: PRD 4.5)
*   [ ] **Collaboration - Activity Streams:** Implement service to record key user actions (CRUD on assets, tasks, schedules, comments) to the activity stream. (Ref: PRD 4.5)
*   [ ] **Collaboration - Shared Asset Visibility:** Implement controls for shared asset visibility within an organization. (Ref: PRD 4.5)
*   [ ] **Notifications - Email Service:** Integrate SMTP service for sending email notifications. (Ref: PRD 4.6)
*   [ ] **Notifications - PWA Push (Basic):** Set up backend infrastructure for sending basic PWA push notifications (e.g., using web-push library). (Ref: PRD 4.6)
*   [ ] **Notifications - Apprise Integration:** Implement Apprise integration for dispatching notifications through various channels. (Ref: PRD 4.6)
*   [ ] **Notifications - Webhooks (Outbound):** Implement basic outbound webhook dispatch for key events (e.g., task completion, new asset). (Ref: PRD 4.6)
*   [ ] **Notifications - Expanded Types:** Implement logic for all specified notification types (warranty, task assignments/due/overdue, mentions, schedule changes). (Ref: PRD 4.6)
*   [ ] **Calendar - Google Calendar Sync:** Implement two-way synchronization logic with Google Calendar API for tasks (creation, updates, deletion). Handle OAuth tokens securely. (Ref: PRD 4.6)
*   [ ] **Calendar - iCalendar Export:** Implement logic to generate an iCalendar (.ics) feed for user tasks. (Ref: PRD 4.6)

## 3. API Design / Integration

*   [ ] **API - Schedules (Advanced):** Extend/create API endpoints for managing advanced schedule types and features. (Ref: PRD 4.2)
*   [ ] **API - Usage Counters:** API endpoints for updating usage counters (manual updates). (Ref: PRD 4.2)
*   [ ] **API - Tasks (Advanced):** Extend/create API endpoints for multi-user assignment, subtasks, completion requirements. (Ref: PRD 4.3)
*   [ ] **API - Invitations:** API endpoints for sending and managing user invitations. (Ref: PRD 4.5)
*   [ ] **API - Activity Streams:** API endpoint to fetch activity stream data (e.g., per asset, per organization). (Ref: PRD 4.5)
*   [ ] **API - Notifications (Expanded):** API endpoints for managing user notification preferences and retrieving notifications from various channels. (Ref: PRD 4.6)
*   [ ] **API - Google Calendar Auth:** API endpoints to handle Google OAuth flow for calendar sync authorization.
*   [ ] **API - iCalendar Feed:** API endpoint to provide the iCalendar feed URL.
*   [ ] **API - Webhook Configuration:** (If configurable by user) API endpoints for managing webhook subscriptions.

## 4. Frontend Development

*   [ ] **UI - Advanced Schedule Creation/Management:** Develop UI for creating and managing seasonal, usage-based schedules, including dependencies, blackout dates. (Ref: PRD 4.2)
*   [ ] **UI - Usage Counter Input:** UI for manually updating usage counters for assets.
*   [ ] **UI - Task Enhancements:** Update task UI for multi-user assignment, subtask display/management, and completion requirements (e.g., checklists). (Ref: PRD 4.3)
*   [ ] **UI - User Invitation Management:** UI for admins/managers to send and track user invitations. (Ref: PRD 4.5)
*   [ ] **UI - @mention Support:** Implement @mention suggestion/highlighting in comment input fields. (Ref: PRD 4.5)
*   [ ] **UI - Activity Stream Display:** UI component to display activity streams (e.g., on asset detail page or org dashboard). (Ref: PRD 4.5)
*   [ ] **UI - Notification Settings:** Page for users to manage their notification preferences for different channels/types. (Ref: PRD 4.6)
*   [ ] **UI - PWA Push Notification Opt-in:** Implement UI for users to grant permission for push notifications. (Ref: PRD 4.6)
*   [ ] **UI - Google Calendar Sync Setup:** UI for users to connect their Google Calendar account. (Ref: PRD 4.6)
*   [ ] **UI - iCalendar Feed Display:** Display iCalendar feed URL for users.
*   [ ] **API Integration:** Connect all new frontend views and components to their respective backend APIs.

## 5. Security

*   [ ] **Secure OAuth Token Handling (Google Calendar):** Ensure secure storage and handling of Google Calendar OAuth tokens (e.g., encrypted in DB, managed via environment variables/secrets for the application).
*   [ ] **Webhook Security:** If implementing configurable webhooks, consider payload signing and verification.
*   [ ] **Invitation Token Security:** Ensure invitation tokens are secure, single-use, and expire.

## 6. DevOps / Hosting

*   [ ] **SMTP Configuration:** Ensure SMTP service credentials are securely configured for the application via environment variables.
*   [ ] **Google API Credentials:** Securely manage Google API credentials for the application via environment variables.
*   [ ] **Apprise Configuration:** Configure Apprise service connections (URL, tokens if any) for the application via environment variables.
*   [ ] **PWA Service Worker:** Implement service worker for PWA push notifications and caching strategies.
*   [ ] **CI/CD - Phase 3 Tests:** Add new unit, integration, and E2E tests for Phase 3 features to the GitHub Actions CI/CD pipeline.

## 7. Testing

*   [ ] **Tests:** **Unit Tests:** Backend: Advanced scheduling logic (seasonal, usage-based, dependencies, blackout dates), multi-user task assignment, subtask logic, invitation system, @mention parsing, activity stream generation, all notification channel integrations (Email, PWA Push, Apprise, Webhooks), Google Calendar sync logic, iCalendar generation. (Ref: PHASES.md)
*   [ ] **Tests:** **Unit Tests:** Frontend: Advanced schedule forms, task components with multi-assign/subtasks, invitation UI, notification preferences UI.
*   [ ] **Tests:** **Integration Tests:** Full lifecycle for each advanced schedule type. Google Calendar API sync (create, update, delete tasks). SMTP service integration. Apprise notification dispatch. Webhook event triggering. (Ref: PHASES.md)
*   [ ] **Tests:** **E2E Tests:** Create an asset, add a seasonal schedule, verify task generation over a year. Assign a task to multiple users. Invite a new user. Test @mentions in comments trigger notification. Sync tasks with Google Calendar and verify. (Ref: PHASES.md)
*   [ ] **Tests:** **Manual Tests:** Thoroughly test all advanced scheduling options. Verify all notification channels (email content, push display, Apprise messages, webhook payloads). Test Google Calendar sync robustness (conflicts, updates from both ends). Test user invitation flow. (Ref: PHASES.md)
*   [ ] **Tests:** **Usability Tests:** For new collaboration features, advanced scheduling UI, and notification preferences. (Ref: PHASES.md)

## 8. Documentation

*   [ ] **Docs:** **API Documentation:** Add/update Swagger/OpenAPI for all new/modified Phase 3 endpoints.
*   [ ] **Docs:** **Code Documentation (JSDoc):** Add JSDoc for all new backend services and key frontend components for Phase 3 features.
*   [ ] **Docs:** **User Guide - Advanced Scheduling:** Document how to use seasonal, usage-based, and other advanced scheduling features.
*   [ ] **Docs:** **User Guide - Collaboration:** Document invitation system, @mentions, activity streams.
*   [ ] **Docs:** **User Guide - Notifications & Calendar Sync:** Document how to configure notifications and link Google Calendar.
*   [ ] **Docs:** **Webhook Event Documentation:** Document available webhook events and their payload structures.
*   [ ] **Docs:** **Database Schema Diagram:** Update schema diagram for Phase 3 changes. 