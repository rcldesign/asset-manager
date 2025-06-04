## 0. Manual Prerequisites (Must be completed before development starts)

*   [ ] **OIDC Provider Account:** Set up and configure an OpenID Connect provider (e.g., Auth0, or a self-hosted Keycloak instance). Obtain the necessary client ID, client secret, and discovery endpoint URL for integration with the application.
*   [ ] **SMTP Service Credentials:** Configure an SMTP service (e.g., a commercial service like SendGrid, or a self-hosted email server like Postfix) for sending transactional emails. Obtain SMTP host, port, username, and password.
*   [ ] **Google Cloud Platform Project & Calendar API:**
    *   [ ] Create a Google Cloud Platform (GCP) project.
    *   [ ] Enable the Google Calendar API for this project.
    *   [ ] Set up OAuth 2.0 credentials (client ID and client secret) for application access.
    *   [ ] Configure the OAuth consent screen with application details and required scopes.
*   [ ] **GitHub Repository:** Create the GitHub repository for the "DumbAssets Enhanced" project. Initialize with a README, .gitignore (for Node.js/Next.js), and a license file (e.g., MIT). Configure main branch protection rules.
*   [ ] **GitHub Actions Secrets:** Securely store any necessary API keys or credentials (e.g., for OIDC provider, SMTP service, Google API) as GitHub Actions secrets if they are needed during the CI/CD build process (e.g. for automated tests that call external services).
*   [ ] **Docker Host Environment:** Prepare a suitable Docker host environment for deploying the application (e.g., a server with Docker and Docker Compose installed).
*   [ ] **Domain Name Registration:** Register a suitable domain name for the application if one is not already available. Plan for DNS configuration to point to the Docker host.
*   [ ] **SSL Certificate Strategy (Self-Hosted):** Plan for SSL certificate acquisition and automated renewal for the self-hosted domain. Options include Let's Encrypt with Certbot (run on host or in a dedicated container), or using a reverse proxy like Nginx, Traefik, or Caddy that handles SSL.
*   [ ] **(Optional) Stripe Account:** If billing/payment features are anticipated, create a Stripe account. Obtain test and live API keys.
*   [ ] **(Optional) Twilio Account:** If SMS notifications are a confirmed requirement, create a Twilio account. Obtain Account SID, Auth Token, and provision a phone number.
*   [ ] **(Optional) OpenAI API Key:** If LLM/AI features are planned, obtain an OpenAI API key and set up billing.
*   [ ] **Apprise Configuration:** If using Apprise for notifications, set up your Apprise instance or ensure connection details to an existing Apprise-compatible notification aggregation service are available. (Ref: PRD 4.6). 