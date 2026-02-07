# Agent System Documentation

This repository contains specialized AI agents for the **Backend** (Node.js/Express/Prisma/MySQL).

## Agents in This Repository

### 1. **Backend Coding Agent** (`backend-coding-agent.md`)
**Purpose**: Implement backend features, APIs, business logic, and database operations
- Express routes and middleware
- Prisma queries and database operations
- JWT authentication and authorization
- Multi-tenant data isolation
- Server-Sent Events (SSE)

### 2. **Backend Security Agent** (`backend-security-agent.md`)
**Purpose**: Identify and prevent backend security vulnerabilities
- SQL injection prevention (Prisma ORM safety)
- Authentication and authorization security
- Multi-tenant isolation validation
- Secrets management
- Monthly vulnerability monitoring
- OWASP API Security Top 10 compliance

### 3. **Backend Testing Agent** (`backend-testing-agent.md`)
**Purpose**: Test backend APIs, business logic, and database operations
- Unit tests (services, utilities)
- Integration tests (routes + services + database)
- End-to-end tests (full API flows)
- Multi-tenant isolation tests
- Security test cases
- Email testing with captindanceman@yahoo.com

### 4. **Database Design Agent** (`database-design-agent.md`)
**Purpose**: Design and optimize MySQL database schema using Prisma
- Prisma schema design (3 normal forms: 1NF, 2NF, 3NF)
- Database migrations with automatic backups
- Auto-incrementing IDs and foreign key relationships
- Indexes for performance
- **CRITICAL**: Always backup before migrations (`.\scripts\backup-database.ps1`)

### 5. **Code Review Agent** (`code-review-agent.md`)
**Purpose**: Ensure code quality, maintainability, and best practices
- Reviews backend and frontend code
- Debates with coding agents on implementation approach
- Ensures dynamic, robust, reusable patterns
- Researches current best practices
- **Shared between backend and frontend repos**

### 6. **Dev Server Monitor** (`dev-server-monitor.md`)
**Purpose**: Keep development servers running with automatic crash recovery
- Monitors backend (Express on port 3001) and frontend (Vite on port 3000)
- Auto-restarts crashed servers
- Logs all activity for debugging
- **Shared between backend and frontend repos**

## How to Use Agents

### Working on Backend Features
1. **Planning**: Consult Code Review Agent for architecture guidance
2. **Database Changes**: Use Database Design Agent (always backup first!)
3. **Implementation**: Backend Coding Agent implements the feature
4. **Security Review**: Backend Security Agent reviews for vulnerabilities
5. **Testing**: Backend Testing Agent creates comprehensive tests
6. **Monitoring**: Dev Server Monitor keeps backend running during development

### Agent Collaboration Flow
```
Code Review Agent (architecture/quality gate)
    ↓
Database Design Agent (schema changes)
    ↓
Backend Coding Agent (implementation)
    ↓
Backend Security Agent (security review)
    ↓
Backend Testing Agent (test and verify)
```

## Backend Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript (ES Modules - NodeNext)
- **Database**: MySQL 8.0+
- **ORM**: Prisma 5.22.0
- **Authentication**: JWT tokens, bcryptjs
- **Real-time**: Server-Sent Events (SSE)
- **Testing**: Jest/Vitest, Supertest
- **Port**: 3001

## Multi-Tenant Architecture

All backend code must enforce tenant isolation:
- Every tenant-scoped query includes `clientId`
- Validate `x-tenant-id` header in middleware
- Never allow cross-tenant data access
- Test multi-tenant isolation thoroughly

## Database Backup Protocol

**CRITICAL**: Always backup before schema changes!

```powershell
# 1. BACKUP FIRST
.\scripts\backup-database.ps1

# 2. Then migrate
cd backend
npx prisma migrate dev --name descriptive_name
```

Backups stored at: `C:\Database_Backups\pestcontrol_crm\`

## Security Priorities

1. **SQL Injection**: Use Prisma parameterized queries (never raw SQL with user input)
2. **Authentication**: JWT tokens with strong secrets, bcrypt password hashing
3. **Authorization**: Role-based access control (RBAC) with proper checks
4. **Multi-tenant Isolation**: Strict `clientId` filtering on all queries
5. **Secrets Management**: All secrets in `.env` (never hardcoded)

## Coding Standards

See `backend/.github/copilot-instructions.md` for detailed standards:
- TypeScript with ES Modules (NodeNext)
- Async/await for all async operations
- Proper error handling with try/catch
- Input validation and sanitization
- RESTful API design
- Comprehensive JSDoc comments

## Testing Requirements

- **60% unit tests**: Services, utilities, middleware
- **30% integration tests**: Routes + services + database
- **10% E2E tests**: Full API flows
- **85%+ code coverage**
- All critical paths tested
- Email tests use captindanceman@yahoo.com (manual verification)

## Related Documentation

- **Frontend Agents**: See `frontend/.copilot/agents/README.md`
- **Backend Copilot Instructions**: `backend/.github/copilot-instructions.md`
- **Database Backup System**: `scripts/backup-database.ps1`

---

**Remember**: These agents work together. Backend Coding Agent implements, Security Agent reviews, Testing Agent verifies, and Database Design Agent ensures schema quality. Code Review Agent oversees the entire process.
