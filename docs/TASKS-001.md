# DumbAssets Enhanced - Phase 1 Tasks: Foundation - Database Migration & Core User System

## 1. Database

*   [ ] **DB Design:** Design the initial PostgreSQL schema for core entities: `users`, `organizations` (or `households`), `assets` (core fields for migration), `schema_migrations`. (Ref: PRD 5.3)
*   [ ] **DB Setup:** Configure PostgreSQL to run within the Docker environment by default. Implement logic to allow connection to an optional external PostgreSQL instance via environment variables. Ensure data persistence for the embedded DB using Docker volumes.
*   [ ] **ORM Setup:** Integrate Prisma ORM (or TypeORM as per PRD 5.2) into the Node.js application. Generate initial ORM models based on the schema.
*   [ ] **Migration Tool Setup:** Configure Prisma Migrate (or chosen migration tool) for managing database schema changes, compatible with both embedded and external DB.
*   [ ] **Data Migration Script Dev:** Develop scripts to migrate existing DumbAssets JSON data into the new PostgreSQL schema, mapping old fields to new structures. (Ref: PRD 6.1)
    *   [ ] Script for migrating assets and their core properties.
    *   [ ] Script for migrating users (if any from old system) or preparing for new user structure.
    *   [ ] Script for migrating file attachment metadata (paths/references).
*   [ ] **Data Migration Execution & Validation:** Run migration scripts in a development environment and validate data integrity and completeness.

## 2. Backend Development

*   [ ] **Project Setup:** Initialize Node.js (TypeScript, Express.js) project structure. Configure ESLint, Prettier, and other development tools.
*   [ ] **User Entity & Logic:** Implement the `User` entity and business logic for creation, profile updates, and retrieval. (Ref: PRD 4.5, 5.3)
*   [ ] **Organization Entity & Logic:** Implement the `Organization` (or `Household`) entity for multi-tenancy/data isolation. Logic for creation, user association. (Ref: PRD 4.5)
*   [ ] **Authentication - Email/Password:** Implement user registration with email/password, password hashing (e.g., bcrypt), and login. (Ref: PRD 4.5)
*   [ ] **Authentication - 2FA:** Implement Time-based One-Time Password (TOTP) 2FA setup and verification for email/password accounts. (Ref: PRD 4.5)
*   [ ] **Session Management:** Implement JWT-based session management (access and refresh tokens). (Ref: PRD 4.5, 5.4)
*   [ ] **API Token Generation:** Implement logic for generating and managing API tokens for users. (Ref: PRD 4.5)
*   [ ] **RBAC - Initial Roles:** Implement basic Role-Based Access Control framework. Define `Owner/Admin` role and initial permissions. (Ref: PRD 4.5)
*   [ ] **Background Job Worker Setup:** Integrate Bull Queue with Redis for background tasks (e.g., future email sending). (Ref: PRD 5.2)

## 3. API Design / Integration

*   [ ] **API - Auth Endpoints:** Design and implement REST API endpoints for user registration, login (email/password), logout, 2FA setup/validation, token refresh.
*   [ ] **API - OIDC Integration:** Integrate with the chosen OIDC provider for login and registration flows. Implement callback handling and user provisioning. (Ref: PRD 4.5)
*   [ ] **API - User Profile Endpoints:** Design and implement REST API endpoints for users to manage their profiles (CRUD operations, password change).
*   [ ] **API - Organization Endpoints:** Design and implement REST API endpoints for `Owner/Admin` to manage organizations (CRUD) and user associations.
*   [ ] **API - Health Check Endpoint:** Create a `/health` endpoint for Docker health checks. (Ref: PRD 5.6)

## 4. Frontend Development

*   [ ] **Project Setup:** Initialize Next.js (React, TypeScript) project. Configure MUI, Zustand, React Query, React Hook Form. (Ref: PRD 5.2)
*   [ ] **UI - Layout Shell:** Create the basic application layout (header, navigation placeholder, footer).
*   [ ] **UI - Registration Page:** Develop the user registration page (email/password).
*   [ ] **UI - Login Page:** Develop the user login page (email/password and OIDC option).
*   [ ] **UI - 2FA Setup Page:** Develop UI for users to set up 2FA.
*   [ ] **UI - User Profile Page:** Develop page for users to view/edit their profile information and manage 2FA.
*   [ ] **UI - Organization Management (Admin):** Basic UI for admins to view/manage organization details and users.
*   [ ] **UI - Initial Navigation:** Implement basic navigation structure based on roles.
*   [ ] **API Integration:** Connect frontend components to the backend authentication and user management APIs.

## 5. Security

*   [ ] **Password Hashing:** Ensure strong password hashing algorithms (e.g., bcrypt) are used for email/password auth.
*   [ ] **Input Validation:** Implement input validation on all API endpoints and frontend forms.
*   [ ] **Secure JWT Handling:** Implement secure practices for JWT storage (e.g., HTTPOnly cookies for refresh tokens) and transmission.
*   [ ] **OIDC Security Review:** Review OIDC integration for common vulnerabilities (e.g., redirect mismatches).
*   [ ] **CORS Configuration:** Configure Cross-Origin Resource Sharing (CORS) policies on the backend.
*   [ ] **Basic Rate Limiting:** Implement basic rate limiting on authentication endpoints.
*   [ ] **CSP Headers:** Define and implement Content Security Policy (CSP) headers. (Ref: PRD 5.4)

## 6. DevOps / Hosting

*   [ ] **Dockerfile - Base Setup:** Create initial `Dockerfile` to set up Node.js, embedded PostgreSQL server, and embedded Redis server. (Ref: PRD 5.1, 5.6)
*   [ ] **Dockerfile - Application:** Add application build and run steps to `Dockerfile`. Include supervisor (or similar process manager) to manage multiple processes (app, embedded DB, embedded Redis) if they are all running in the same container.
*   [ ] **Docker Compose:** Create `docker-compose.yml` for local development, including volume mounts for embedded data persistence and clear environment variable examples for configuring an optional external database and optional SMB file storage.
*   [ ] **CI/CD - Initial Pipeline (GitHub Actions):** Set up a basic CI/CD pipeline using GitHub Actions for linting, running tests (unit & integration), and building the Docker image. Push tagged images to GitHub Container Registry (or Docker Hub if preferred).
*   [ ] **Configuration Management:** Establish environment-based configuration for database connection (supporting embedded and external), OIDC credentials, JWT secrets, optional SMB credentials, etc. Ensure these are clearly documented for self-hosters.

## 7. Testing

*   [ ] **Tests:** **Unit Tests:** Backend: OIDC integration logic, email/password auth, 2FA logic, JWT generation/validation, user/org models and services, RBAC enforcement. (Ref: PHASES.md)
*   [ ] **Tests:** **Unit Tests:** Frontend: Core components (login form, registration form, profile page), state management logic for auth.
*   [ ] **Tests:** **Integration Tests:** API endpoints for auth (OIDC & email/pass), user CRUD, organization CRUD. Database interaction for user/org creation. (Ref: PHASES.md)
*   [ ] **Tests:** **E2E Tests:** User registration flow (email/password), login flow (email/password & OIDC), 2FA setup and login, basic profile update.
*   [ ] **Tests:** **Manual Tests:** Full user lifecycle: registration (email, OIDC), login, 2FA, logout. Admin user management tasks. Data migration validation by spot-checking migrated data. (Ref: PHASES.md)
*   [ ] **Tests:** **Security Tests:** Basic penetration testing for authentication endpoints (SQLi, XSS, CSRF on forms). (Ref: PHASES.md)

## 8. Documentation

*   [ ] **Docs:** **API Documentation:** Set up Swagger/OpenAPI for auth, user, and organization API endpoints. Draft initial definitions.
*   [ ] **Docs:** **Code Documentation (JSDoc):** Add JSDoc comments to all new backend functions and key frontend components/hooks related to auth and user management.
*   [ ] **Docs:** **README Updates - Setup Instructions:** Update project README with detailed setup instructions for Phase 1, covering:
    *   Running the application using Docker (default embedded DB).
    *   Optionally configuring an external PostgreSQL database (env vars).
    *   Optionally configuring SMB/CIFS for file storage (env vars, placeholder for Phase 2 functionality).
    *   OIDC provider configuration notes.
*   [ ] **Docs:** **Database Schema Diagram:** Create an initial visual diagram of the Phase 1 database schema. 