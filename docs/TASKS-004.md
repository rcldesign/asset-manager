# DumbAssets Enhanced - Phase 4 Tasks: Dashboards, Reporting, API & Mobile

## 1. Database

*   [ ] **DB Design - Audit Trail:** Design `audit_trail` table to log all significant changes (who, what, when, before/after values for key fields). (Ref: PRD 5.4)
*   [ ] **DB Design - Custom Reports:** Design tables to store custom report definitions if the builder is sufficiently complex (e.g., `custom_reports`, `report_filters`, `report_display_fields`). (Ref: PRD 4.7)
*   [ ] **DB Design - Scheduled Reports:** Design `scheduled_reports` table (linking to reports, users/emails, frequency, last sent). (Ref: PRD 4.7)
*   [ ] **DB Migrations:** Create and apply database migrations for audit trail and any reporting-specific tables.

## 2. Backend Development

*   [ ] **Dashboard - Data Aggregation Logic:** Implement backend services to aggregate data for all four dashboard views (Overview, Asset-Centric, Calendar-Centric, Task-Centric). (Ref: PRD 4.4)
*   [ ] **Reporting - Asset Reports:** Implement logic to generate asset reports (age, warranty status, maintenance history). (Ref: PRD 4.7)
*   [ ] **Reporting - Task Reports:** Implement logic to generate task reports (completion rates, costs, delays). (Ref: PRD 4.7)
*   [ ] **Reporting - User Reports:** Implement logic to generate user reports (workload, performance). (Ref: PRD 4.7)
*   [ ] **Reporting - Custom Report Builder (Basic):** Implement backend logic for a basic custom report builder (e.g., selecting fields, basic filters). (Ref: PRD 4.7)
*   [ ] **Reporting - PDF Export:** Integrate a library (e.g., `pdfmake`, `Puppeteer` for HTML to PDF) to generate PDF versions of reports. (Ref: PRD 4.7)
*   [ ] **Reporting - Scheduled Reports:** Implement a background job (using Bull Queue) to generate and email scheduled reports. (Ref: PRD 4.7)
*   [ ] **Data Management - Enhanced Import/Export:** Enhance Excel/CSV import with field mapping capabilities. Implement full data export in JSON, CSV, Excel. (Ref: PRD 4.7)
*   [ ] **Data Management - Backup/Restore:** Develop scripts/procedures for backing up and restoring the PostgreSQL database (embedded or external link) and user-uploaded files (from Docker volume or guidance for SMB share). Document the process clearly for self-hosters. (Ref: PRD 4.7)
*   [ ] **API - Comprehensive Coverage:** Review all features and ensure comprehensive REST API coverage. Add any missing endpoints or refine existing ones. (Ref: PRD 4.6)
*   [ ] **API - Webhook Enhancements:** Enhance webhook event payloads and potentially add more event types based on new features. (Ref: PRD 4.6)
*   [ ] **PWA - Offline Sync Logic:** Implement robust backend logic to handle data synchronization from offline PWA clients (conflict resolution if necessary). (Ref: PRD 4.8)
*   [ ] **Security - Audit Trail Service:** Implement a service to record changes to critical data in the `audit_trail` table. (Ref: PRD 5.4)
*   [ ] **Security - GDPR Tools:** Implement backend logic for GDPR data export (for a single user) and data deletion requests. (Ref: PRD 5.4)

## 3. API Design / Integration

*   [ ] **API - Dashboards:** Design and implement REST API endpoints to provide aggregated data for each dashboard view. (Ref: PRD 4.4)
*   [ ] **API - Reporting:** Design and implement API endpoints for generating and retrieving all report types, including custom reports and PDF exports. (Ref: PRD 4.7)
*   [ ] **API - Data Import/Export:** API endpoints for initiating enhanced data import and full export operations. (Ref: PRD 4.7)
*   [ ] **API - Backup/Restore:** (If admin-triggered) API endpoints for managing backup/restore operations.
*   [ ] **API - Audit Trail:** API endpoint for privileged users to query the audit trail.
*   [ ] **API - GDPR Requests:** API endpoints for users to request data export or account deletion.

## 4. Frontend Development

*   [ ] **UI - Overview Dashboard:** Develop the Overview Dashboard UI with summary cards, quick actions, activity feed, mini calendar, and charts (Chart.js, D3.js). (Ref: PRD 4.4.1)
*   [ ] **UI - Asset-Centric Dashboard:** Develop the Asset-Centric Dashboard UI, enhancing the current DumbAssets view with new charts and indicators. (Ref: PRD 4.4.2)
*   [ ] **UI - Calendar-Centric Dashboard:** Develop the Calendar-Centric Dashboard UI with full calendar (FullCalendar), task density, drag-and-drop rescheduling, color coding, and filters. (Ref: PRD 4.4.3)
*   [ ] **UI - Task-Centric Dashboard:** Develop the Task-Centric Dashboard UI with Kanban board, list view, personalized views, workload visualization, and metrics. (Ref: PRD 4.4.4)
*   [ ] **UI - Reporting Views:** Develop UI for viewing standard reports and interacting with the custom report builder. (Ref: PRD 4.7)
*   [ ] **UI - PDF Export Trigger:** Add UI elements to trigger PDF export for reports.
*   [ ] **UI - Scheduled Reports Management:** UI for users to set up and manage their scheduled reports.
*   [ ] **UI - Enhanced Import/Export:** UI for advanced Excel/CSV import with field mapping and for triggering full data exports. (Ref: PRD 4.7)
*   [ ] **UI - PWA Offline Support:** Implement UI patterns to indicate offline status and manage offline data/sync. (Ref: PRD 4.8)
*   [ ] **UI - Mobile Optimization:** Review and optimize all features for mobile PWA experience. (Ref: PRD 4.8)
*   [ ] **UI - Camera Integration:** Integrate camera access via PWA for quick photo attachments to tasks/assets. (Ref: PRD 4.8)
*   [ ] **UI - Barcode Scanning:** Integrate barcode scanning via PWA for asset lookup. (Ref: PRD 4.8)
*   [ ] **UI - Audit Trail Viewer (Admin):** Basic UI for admins to view audit trail records.
*   [ ] **UI - GDPR Request Forms:** UI for users to request their data or account deletion.
*   [ ] **API Integration:** Connect all new frontend dashboards, reports, and PWA features to their respective backend APIs.

## 5. Security

*   [ ] **Audit Trail Verification:** Thoroughly test that audit trail logs all specified actions correctly.
*   [ ] **GDPR Compliance Testing:** Test data export and deletion features to ensure compliance.
*   [ ] **PWA Security Review:** Review security aspects of offline data storage and sync for the PWA.

## 6. DevOps / Hosting

*   [ ] **PWA - Service Worker Enhancements:** Optimize service worker for caching strategies (cache-first, network-first) and background sync for offline mode. (Ref: PRD 4.8)
*   [ ] **Performance Monitoring - Dashboards:** Set up monitoring for dashboard data aggregation performance (e.g., logging slow queries, API response times).
*   [ ] **Backup Automation:** Document and provide example scripts (if feasible) for automating backups of the Docker volume (for embedded DB and local file uploads). For external DBs and SMB shares, document that backup is the user's responsibility using their existing infrastructure tools.
*   [ ] **CI/CD - Phase 4 Tests:** Add new unit, integration, and E2E tests for Phase 4 features to the GitHub Actions CI/CD pipeline.

## 7. Testing

*   [ ] **Tests:** **Unit Tests:** Backend: Dashboard data aggregation services, reporting logic for all report types, PDF generation, scheduled report service, enhanced import/export logic, PWA sync conflict resolution (if any), audit trail logging, GDPR functions. (Ref: PHASES.md)
*   [ ] **Tests:** **Unit Tests:** Frontend: All dashboard components, report view components, PWA offline data handling logic, camera/barcode scanner integration points.
*   [ ] **Tests:** **Integration Tests:** API endpoints for dashboards, all reports, PDF export, import/export, audit trail access. PWA service worker caching and background sync. (Ref: PHASES.md)
*   [ ] **Tests:** **E2E Tests:** User flow through each dashboard, data accuracy verification. Generate and export a report in PDF/CSV. Perform an offline task update, go online, verify sync. Test camera/barcode features. (Ref: PHASES.md)
*   [ ] **Tests:** **Manual Tests:** Thoroughly test all dashboard views with various data scenarios (empty, small, large datasets). Verify accuracy and formatting of all reports (including PDF and scheduled emails). Test PWA functionality across different mobile devices and network conditions (offline, flaky connection, online). Test audit trail and GDPR features. (Ref: PHASES.md)
*   [ ] **Tests:** **Performance Tests:** Dashboard loading times with large datasets. Report generation times (especially for complex custom reports and large exports). PWA sync performance. (Ref: PHASES.md)
*   [ ] **Tests:** **Accessibility Tests (WCAG):** Test PWA and dashboards for accessibility compliance. (Ref: PHASES.md)
*   [ ] **Tests:** **Security Tests:** Verify audit trail integrity. Test GDPR data export/deletion to ensure all relevant user data is handled. (Ref: PHASES.md)

## 8. Documentation

*   [ ] **Docs:** **API Documentation:** Finalize Swagger/OpenAPI for all endpoints, ensuring comprehensive coverage and accuracy.
*   [ ] **Docs:** **Code Documentation (JSDoc):** Ensure all backend and key frontend code is well-documented with JSDoc.
*   [ ] **Docs:** **User Guide - Dashboards:** Document each dashboard view and its features.
*   [ ] **Docs:** **User Guide - Reporting:** Document how to generate standard reports, use the custom report builder, and manage scheduled reports.
*   [ ] **Docs:** **User Guide - Data Management:** Document enhanced import/export features. Detail backup/restore procedures for the default Docker volume (embedded DB, local files) and provide guidance for users with external databases or SMB shares.
*   [ ] **Docs:** **User Guide - PWA & Mobile:** Document PWA installation, offline capabilities, and mobile-specific features (camera, barcode).
*   [ ] **Docs:** **User Guide - GDPR & Audit:** Document GDPR data request process for users and audit trail access for admins.
*   [ ] **Docs:** **Technical Architecture Document:** Create/update a document detailing the final system architecture, including data models, key components, integrations, and data storage options (embedded DB/files, external DB, SMB).
*   [ ] **Docs:** **Deployment Guide:** Finalize deployment guide for the Docker container, including all configuration options (embedded DB, external DB, local file storage, SMB file storage, service credentials via env vars) and troubleshooting.
*   [ ] **Docs:** **Database Schema Diagram:** Finalize the complete database schema diagram. 