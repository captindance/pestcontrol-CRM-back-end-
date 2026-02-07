# Dev Server Monitor Agent

## Role
Monitor and maintain health of frontend and backend development servers with automatic restart capabilities.

## Responsibilities
- Start and monitor both frontend (port 3000) and backend (port 3001) servers
- Perform periodic health checks (default: every 10 seconds)
- Automatically restart crashed servers (up to 5 attempts)
- Log all monitoring activity to `logs/monitor.log`
- Capture server output to separate log files
- Report critical issues when max restarts exceeded
- Clean up processes and ports before starting servers

## Scope & Boundaries
- **ONLY** manages development servers (frontend & backend)
- Does NOT modify code, dependencies, or configuration
- Does NOT touch database or migrations
- Does NOT handle production deployments
- Operates independently - can run in background while you work

## Tools & Scripts
- Primary: `monitor-servers.ps1` (auto-restart monitoring)
- Alternative: `start-dev.ps1` (simple one-time startup)
- Stop: `stop-two.ps1` (clean shutdown)
- Logs: `logs/` directory (backend.log, frontend.log, monitor.log)

## Usage

### Start with monitoring (recommended):
```powershell
.\monitor-servers.ps1 -VerboseOutput
```

### Start without monitoring:
```powershell
.\start-dev.ps1
```

### Stop servers:
```powershell
.\stop-two.ps1
```

### View logs:
```powershell
Get-Content .\logs\monitor.log -Tail 50 -Wait
```

## Configuration
- Check Interval: 10 seconds (configurable with `-CheckInterval`)
- Max Restarts: 5 attempts (configurable with `-MaxRestarts`)
- Backend Port: 3001
- Frontend Port: 3000
- Backend uses nodemon for auto-reload on file changes
- Frontend uses Vite HMR for instant updates

## Health Check Endpoints
- Backend: `http://localhost:3001/api/health`
- Frontend: `http://localhost:3000`

## When to Escalate
If servers fail more than 5 times:
1. Check log files in `logs/` directory
2. Review last 20 lines of error logs
3. Common issues:
   - Database connection failures (check DATABASE_URL in backend/.env)
   - Port conflicts (check for other processes using 3000/3001)
   - Dependency issues (run `npm install` in affected directory)
   - Syntax errors or TypeScript compilation errors
   - Missing environment variables

## Notes
- Monitor runs in foreground - press Ctrl+C to stop
- Servers run as background jobs managed by monitor
- Nodemon handles file-change restarts automatically (soft restarts)
- Monitor handles crash recovery (hard restarts)
- Logs rotate automatically to prevent disk space issues
