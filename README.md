# Amity Medical Clinic — Care Desk

An offline-first clinic management application with a React single-page frontend and a Spring Boot REST API backed by MySQL. Changes are saved in the browser first and queued for synchronization when the signed-in API is available.

## Project structure

```text
.
├── backend/                 Spring Boot API, security, persistence, and Flyway migrations
├── frontend/                React application, Vite configuration, and frontend tests
├── docker-compose.yml       Optional full-stack Docker Compose deployment
└── README.md
```

## Requirements

For local development without Docker:

- Node.js 20.19+ or 22.12+
- Java 21
- Maven 3.9+
- MySQL 8.4

Docker Desktop with Docker Compose is an alternative to installing and running MySQL and the API separately.

## Local development

### 1. Create the database

Start MySQL, connect to it as an administrator, and create a database and a dedicated application account. Use a unique database password and keep it out of source control.

```sql
CREATE DATABASE clinic_management CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'clinic_app'@'127.0.0.1' IDENTIFIED BY '<unique-database-password>';
GRANT ALL PRIVILEGES ON clinic_management.* TO 'clinic_app'@'127.0.0.1';
```

If the API and database run on different hosts, create a database account restricted to the API host instead of `127.0.0.1`; do not use a wildcard host in production.

### 2. Start the API

In a PowerShell terminal, from the project root:

```powershell
$env:DB_URL = "jdbc:mysql://127.0.0.1:3306/clinic_management?useSSL=false&serverTimezone=UTC"
$env:DB_USERNAME = "clinic_app"
$env:DB_PASSWORD = "<unique-database-password>"
$env:CLINIC_ADMIN_USERNAME = "clinic-admin"
$env:CLINIC_ADMIN_PASSWORD = "<unique-password-of-at-least-12-characters>"
$env:CLINIC_ALLOWED_ORIGINS = "http://localhost:5173"
$env:SECURE_COOKIES = "false"

Set-Location .\backend
mvn spring-boot:run
```

Keep this terminal open. The API listens on port `8080`; Flyway applies the database migrations during startup. The configured clinic account is created or updated at every API startup, so `CLINIC_ADMIN_PASSWORD` resets that account's password when the API is restarted. Configure credentials through environment variables or a secrets manager; never commit real passwords or `.env` files.

For production, use HTTPS, set `SECURE_COOKIES=true`, restrict allowed origins, and use a database account with only the required privileges. Do not expose a development server directly to the public internet.

### 3. Start the frontend

In a second terminal, from the project root:

```powershell
Set-Location .\frontend
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` requests to `http://localhost:8080`.

If the API or database is unavailable, choose **Open offline workspace on this device** at sign-in. Offline work is stored in that browser and does not authenticate or synchronize with the clinic server.

## Checks and production builds

Run from `frontend/`:

```powershell
npm run lint
npm test
npm run build
```

Build the backend from `backend/`:

```powershell
mvn test
mvn package
```

The frontend production output is generated in `frontend/dist/`; the executable Spring Boot JAR is generated in `backend/target/`. These are build artifacts, not source files to edit.

## Docker Compose

The optional Compose setup runs MySQL, the API, and an Nginx-hosted frontend. From the project root, set unique secrets in the current shell and start the services:

```powershell
$env:DB_PASSWORD = "<unique-database-password>"
$env:MYSQL_ROOT_PASSWORD = "<different-unique-root-password>"
$env:CLINIC_ADMIN_USERNAME = "clinic-admin"
$env:CLINIC_ADMIN_PASSWORD = "<unique-password-of-at-least-12-characters>"
$env:CLINIC_ALLOWED_ORIGINS = "http://localhost"
$env:SECURE_COOKIES = "false"

docker compose up --build
```

Open [http://localhost](http://localhost). The MySQL data is stored in the `clinic_mysql` Docker volume. Back up the volume securely. Stop the stack with `Ctrl+C`; `docker compose down` stops and removes its containers without deleting the database volume. Do not use `docker compose down -v` unless you intend to permanently delete that database.

## Application behavior and API

- `GET /api/auth/csrf`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/patients`, `PUT /api/patients/{id}`
- `GET /api/profile`, `PUT /api/profile`

Patient and profile endpoints require an authenticated clinic session; state-changing requests require a Spring Security CSRF token. Frontend data is cached per account in browser `localStorage`; pending changes are queued locally and retained if synchronization fails. Browser storage is not encrypted, so avoid shared or public devices and sign out when finished.

The queue includes fictional sample visits for demonstration. Patient record totals, analytics, and exports exclude those samples and count clinic records only.

## Deployment

GitHub Pages serves static files only and cannot run the Spring Boot API or MySQL, so it cannot host the complete signed-in application. Deploy the frontend, API, and database to infrastructure that supports them. The included Nginx and Docker Compose configuration provides a single-origin deployment. Separate frontend and API domains require carefully configured CORS and cross-site secure session cookies; that configuration is not enabled by default.

This project is a development starting point, not a certified electronic health-record system. Before using real patient information, obtain an appropriate security and compliance review and establish operational access controls, audit and retention policies, and encrypted backups. Sample patients are fictional.
