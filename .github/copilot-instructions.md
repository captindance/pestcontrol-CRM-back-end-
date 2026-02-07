# Backend Copilot Instructions

## Project Overview
This is the **backend** for the PestControl CRM system - a multi-tenant, read-only reporting platform for the pest control industry. It is a REST API built with Node.js/Express and TypeScript, serving as the data access and business logic layer.

## Tech Stack
- **Runtime**: Node.js with TypeScript (ES Modules - NodeNext)
- **Framework**: Express.js
- **Database**: MySQL with Prisma ORM (version 5.22.0)
- **Authentication**: JWT tokens (jsonwebtoken)
- **Email**: Nodemailer for invitations and notifications
- **Security**: bcryptjs for password hashing
- **Real-time Updates**: Server-Sent Events (SSE) for live notifications

## Architecture
- **Entry Point**: `src/server.ts`
- **Database Layer**: Prisma schema at `prisma/schema.prisma`
- **Routes**: RESTful API routes in `src/routes/`
  - `authRoutes.ts` - Login, signup, email verification
  - `adminRoutes.ts` - Platform admin operations (clients, managers, invitations)
  - `managerRoutes.ts` - Manager assignments and client access
  - `clientRoutes.ts` - Client-specific operations
  - `reportRoutes.ts` - Report creation, execution, and results
  - `connectionRoutes.ts` - Database connection management
  - `connectionPermissionRoutes.ts` - Connection permission management
- **Middleware**: 
  - `auth.ts` - JWT authentication and role verification
  - `tenant.ts` - Multi-tenant isolation via x-tenant-id header
- **Services**: Business logic in `src/services/`
  - `emailService.ts` - Email sending and template management
  - `connectionService.ts` - Database connection handling
  - `queryService.ts` - Report query execution
  - `permissionService.ts` - Permission checks
  - `auditService.ts` - Audit logging
  - `routeService.ts` - Route utilities
  - `sseService.ts` - Server-Sent Events handling
- **Models**: Data models in `src/models/`
- **Types**: TypeScript type definitions in `src/types/`
- **Config**: Configuration files in `src/config/` (e.g., jwt.config.ts)
- **Security**: Security utilities in `src/security/`
- **Database Access**: Prisma client in `src/db/prisma.js`

## Key Guidelines

### Separation of Concerns
- **This is backend code only** - do not create or modify frontend components, React code, or UI elements
- Keep all business logic, data validation, and database operations in the backend
- Expose data through REST API endpoints only
- Do not embed frontend routing or UI logic here

### Multi-Tenant Architecture
- **Strict Tenant Isolation**: All client-specific data must be scoped to tenantId (clientId)
- Use `tenantMiddleware` to extract `x-tenant-id` header and set `req.tenantId`
- Platform admins operate without tenant context (clientId = null in user_roles)
- Managers can access multiple clients through assignments
- Always verify tenant access before returning data

### Role-Based Access Control
- **Roles**: `platform_admin`, `business_owner`, `delegate`, `manager`, `viewer`
- Platform admin: Full system access, manages all clients and managers
- Business owner: Full control within their tenant (client)
- Delegate: Limited access to assigned reports within tenant
- Manager: Cross-tenant access via assignments (see multiple clients)
- Viewer: Read-only access within tenant
- Use `req.user.roles` array to check permissions
- Store roles in `user_roles` table with optional clientId

### Database & Prisma
- All database schema changes must be done through Prisma migrations
- Use Prisma Client for all database queries via `prisma` instance from `src/db/prisma.js`
- Schema uses explicit column mapping (e.g., `@map("created_at")`)
- Never write raw SQL unless absolutely necessary for report execution
- Connection pooling and management handled by Prisma

### API Design
- Follow REST conventions for endpoints
- Use proper HTTP status codes (200, 201, 204, 400, 401, 403, 404, 500)
- Return consistent JSON response structures
- Implement proper error handling and validation
- Use Express middleware for cross-cutting concerns
- Support special headers: `x-tenant-id`, `x-acting-role`, `Authorization`

### Authentication & Security
- Always validate and sanitize user inputs
- Use JWT for authentication with tokens verified via `authMiddleware`
- Token payload includes: userId, tenantId (optional), roles array
- Hash passwords with bcryptjs before storing
- Apply `authMiddleware` to all protected routes
- Never log sensitive data (passwords, tokens, connection credentials)
- Email verification required before users can fully access system
- Invitation system for onboarding new users

### Real-Time Features
- Server-Sent Events (SSE) for live updates to admin and manager dashboards
- Global functions `notifyManagerUpdate()` and `notifyManagerAssignmentUpdate(userId)`
- Store SSE clients in `sseAdminClients` Set and `sseManagerClients` Map
- Properly handle SSE connection lifecycle (keepalive, cleanup on disconnect)

### TypeScript & ES Modules
- Use ES Modules (type: "module" in package.json)
- Module resolution: NodeNext (use .js extensions in imports for .ts files)
- TypeScript strict mode is disabled (strict: false)
- Define interfaces/types in `src/types/` or inline
- Avoid excessive use of `any` types where possible
- Use Express type augmentation for custom req.user properties

### File Organization
- Routes should only handle HTTP request/response, delegate to services
- Business logic belongs in services
- Keep middleware focused and composable
- Database operations centralized in Prisma client usage
- Configuration loaded from environment variables via dotenv

## Environment Variables
Configuration is managed through `.env` file - see `.env.example` for required variables:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Secret key for JWT token signing
- `JWT_EXPIRY` - Token expiration time (e.g., "7d")
- SMTP settings for email (host, port, user, pass, from)

## Running the Backend
- **Development**: `npm run dev` (nodemon watches src/ for changes, compiles and restarts)
- **Build**: `npm run build` (compiles TypeScript to dist/)
- **Production**: `npm start` (runs compiled dist/server.js)
- **Dev with frontend**: `npm run dev:both` (starts both servers via PowerShell script)

## Database Migrations
- Create migration: `npx prisma migrate dev --name migration_name`
- Apply migrations: `npx prisma migrate deploy`
- Generate Prisma Client: `npx prisma generate`
- Seed database: `npm run seed` (uses prisma/seed.ts)

## Development Notes
- Backend runs on port 3001 in development
- Uses .js extensions in imports even for .ts files (NodeNext module resolution)
- nodemon configured via .nodemon.json
- TypeScript compiled to dist/ directory

## Important Notes
- This backend is designed to work with a separate React frontend (Vite)
- All frontend-backend communication happens via REST API calls
- CORS is configured to allow frontend origin
- Multi-tenant system with strict data isolation
- Read-only reporting platform - does not modify source system data
- Asynchronous report execution via query service
- Keep backend and frontend code completely separate
