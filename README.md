# Desk Platform

**A job-first execution platform for government knowledge work**

Desk is a minimal, secure platform for managing and executing long-running jobs with phase-based workflows. Built with simplicity and security as core principles.

## Architecture

Desk consists of two main components:

### 1. Ralph Kernel (Bash)
- **Filesystem-as-database**: All job state stored in `jobs/` directory
- **Phase-based execution**: RESEARCH → PLAN → IMPLEMENT → REVIEW → VERIFY → PACKAGE
- **Queue system**: Filesystem-based queue with worker process
- **Git-based audit trail**: Every phase execution creates a commit
- **Lock mechanism**: Prevents concurrent execution with TTL-based locks

### 2. Web UI (Node.js + Express)
- **Server-rendered**: EJS templates, no JSON API, no SPA
- **Cookie sessions**: express-session + SQLite (no JWT)
- **Security-first**: Command injection prevention, path traversal protection
- **Desktop-only**: Minimal CSS, manual refresh, no auto-polling
- **Role-based access**: Officers and Supervisors

## Quick Start

### Prerequisites
- **Node.js** ≥ 18.0.0
- **Bash** (macOS/Linux)
- **GNU coreutils** (for `timeout`/`gtimeout`)
  ```bash
  # macOS
  brew install coreutils

  # Linux (usually pre-installed)
  apt-get install coreutils
  ```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/virgchiniwala/Desk.git
   cd Desk
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Configure environment**
   ```bash
   # .env file already exists with defaults
   # For production, generate a secure session secret:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Then update .env with the generated secret
   ```

4. **Start the server**
   ```bash
   npm start
   # Server runs on http://localhost:3000
   ```

5. **Login**
   - **URL**: http://localhost:3000
   - **Username**: `admin`
   - **Password**: `admin123`

## Ralph Kernel CLI

### Create a Job
```bash
./ralph/new-job.sh PROJECT-001 "Job description"
```

Creates job structure:
```
jobs/PROJECT-001/
  ├── inputs/          # Place input files here
  ├── output/          # Generated artifacts
  ├── tmp/             # Logs and temp files
  ├── meta.json        # Job metadata
  ├── plan.md          # Execution plan
  ├── progress.md      # Progress log
  └── session-handoff.md  # Session continuity notes
```

### Enqueue a Phase
```bash
./ralph/enqueue.sh PROJECT-001 PLAN \
  --exec "echo 'Planning complete'" \
  --time-min 30
```

Options:
- `--exec "CMD"` - Command to execute (required)
- `--time-min N` - Time budget in minutes (default: 30)
- `--retries N` - Max retry attempts (default: 0)
- `--checkpointable` - Allow re-enqueue on timeout

### Run Worker
```bash
./ralph/worker.sh
# Or with options:
./ralph/worker.sh --loop-sleep 5 --lock-ttl-hours 2
```

The worker:
- Scans queue every N seconds (default: 10)
- Acquires locks to prevent concurrent execution
- Executes jobs via `ralph/run.sh`
- Updates status to NEEDS_REVIEW on failure
- Creates checkpoint commits

### Unlock a Stuck Job
```bash
./ralph/unlock-job.sh PROJECT-001
```

Removes stale lock file after confirmation.

## Web UI Features

### Job Management
- **Create Jobs**: Web form with PROJECT-NNN validation
- **View Jobs**: Sortable table with status, phase, date
- **Job Detail**: Metadata, progress log, output files
- **Trigger Phases**: Enqueue phases via web form
- **View Logs**: Real-time worker logs
- **Download Artifacts**: Stream files from job output directory

### Authentication
- **Cookie-based sessions**: 24-hour expiry
- **bcrypt password hashing**: 10 rounds
- **Role-based access**: Officer and Supervisor roles

### Security Features
- **Command injection prevention**: `spawn()` with `shell: false`
- **Path traversal protection**: Job ID validation + path normalization
- **Session security**: httpOnly cookies, HTTPS in production
- **Helmet security headers**: CSP, XSS protection
- **Input validation**: Forms validate before submission

## User Management

### Create a New User
```bash
cd server
npm run create-user
# Follow prompts for username, password, role
```

Roles:
- **Officer**: Access to jobs (future: own jobs only)
- **Supervisor**: Access to all jobs

## Project Structure

```
Desk/
├── ralph/                    # Ralph kernel (Bash scripts)
│   ├── new-job.sh           # Create job directory
│   ├── enqueue.sh           # Add job to queue
│   ├── worker.sh            # Background worker
│   ├── run.sh               # Execute job phase
│   ├── unlock-job.sh        # Remove stale locks
│   └── queue/               # Filesystem queue
│       ├── pending/         # Jobs waiting to execute
│       ├── processing/      # Currently executing
│       ├── completed/       # Successfully completed
│       └── failed/          # Failed execution
├── jobs/                     # Job directories (auto-created)
│   └── PROJECT-001/         # Example job
├── server/                   # Web UI (Node.js)
│   ├── server.js            # Express app
│   ├── routes/              # HTTP routes
│   ├── views/               # EJS templates
│   ├── middleware/          # Auth middleware
│   ├── lib/                 # Libraries
│   │   ├── shell-runner.js  # Safe shell execution
│   │   └── job-reader.js    # Filesystem helpers
│   ├── db/                  # SQLite database
│   │   ├── init.sql         # Schema
│   │   └── db.js            # Connection
│   └── public/              # Static assets
├── vault/                    # Knowledge management (PARA)
│   ├── CLAUDE.md            # Vault operating contract
│   ├── 01_Inbox/            # Unprocessed notes
│   ├── 02_Projects/         # Active initiatives
│   ├── 03_Areas/            # Ongoing responsibilities
│   ├── 04_Knowledge/        # Reusable knowledge
│   └── 05_Archive/          # Historical records
├── AGENTS.md                 # Agent execution contract
└── .env                      # Environment config (not in repo)
```

## Job Lifecycle

```
1. CREATE    → Job directory created (new-job.sh)
2. ENQUEUE   → Phase added to queue (enqueue.sh)
3. ACQUIRE   → Worker acquires lock
4. EXECUTE   → Worker runs phase via run.sh
5. VALIDATE  → Postflight checks unauthorized writes
6. COMMIT    → Git checkpoint commit
7. RELEASE   → Worker releases lock
8. STATUS    → Job status updated (COMPLETED or NEEDS_REVIEW)
```

## Job Phases

| Phase | Purpose | Example Command |
|-------|---------|----------------|
| **RESEARCH** | Gather information | `curl https://api.example.com/data` |
| **PLAN** | Define approach | `cat inputs/requirements.txt` |
| **IMPLEMENT** | Execute work | `python scripts/process.py` |
| **REVIEW** | Validate output | `diff expected.txt output/result.txt` |
| **VERIFY** | Final checks | `bash scripts/verify.sh` |
| **PACKAGE** | Prepare deliverables | `tar -czf output/delivery.tar.gz output/` |

## Security Considerations

### Command Injection Prevention
```javascript
// ❌ NEVER: String interpolation with shell: true
exec(`ls ${userInput}`)  // Vulnerable!

// ✅ ALWAYS: spawn() with argv array and shell: false
spawn('ls', [userInput], { shell: false })  // Safe
```

### Path Traversal Prevention
```javascript
// Job ID validation (PROJECT-NNN format)
if (!/^[A-Z]+-[0-9]{3}$/.test(jobId)) {
  throw new Error('Invalid job ID');
}

// Path normalization and boundary check
const safePath = path.resolve(jobPath, userPath);
if (!safePath.startsWith(jobPath + path.sep)) {
  throw new Error('Path traversal detected');
}
```

### Write Path Enforcement
Jobs have explicit allowed write paths in `meta.json`:
```json
{
  "jobId": "PROJECT-001",
  "elevated": false,
  "allowedPaths": ["jobs/PROJECT-001/"]
}
```

Non-elevated jobs cannot write outside their directory.

## Configuration

### Environment Variables (.env)
```bash
# Server port
PORT=3000

# Session secret (CHANGE IN PRODUCTION!)
SESSION_SECRET=generate-random-64-char-hex-string

# Node environment
NODE_ENV=development  # or 'production'
```

### Database
- **SQLite** database at `server/db/desk.db`
- **Schema**: Users + Sessions tables
- **Sessions**: Managed by connect-sqlite3
- **Backups**: Copy `desk.db` file

## Development

### Run in Development Mode
```bash
cd server
npm run dev  # Uses node --watch for auto-reload
```

### Run Security Tests
```bash
cd server
node test-security.js
```

Tests:
- Command injection prevention
- Path traversal protection
- Job ID validation
- File path validation

### Project Conventions
- **Bash scripts**: Set errexit (`set -euo pipefail`)
- **Job IDs**: `PROJECT-NNN` format (uppercase, 3 digits)
- **Commit messages**: Conventional commits (`feat:`, `fix:`, `docs:`)
- **No emojis**: Unless explicitly requested
- **Server-rendered**: No client-side JavaScript frameworks

## Troubleshooting

### Worker Won't Start
```bash
# Check if timeout/gtimeout is installed
command -v timeout || command -v gtimeout

# Install coreutils if missing
brew install coreutils  # macOS
```

### Job Stuck with Lock
```bash
# Remove stale lock
./ralph/unlock-job.sh PROJECT-001

# Check lock age in jobs/PROJECT-001/tmp/worker.lock
```

### Database Issues
```bash
# Reset database (WARNING: Deletes all users/sessions)
cd server
rm db/desk.db db/desk.db-*
npm start  # Recreates with default admin user
```

### Server Won't Start
```bash
# Check port availability
lsof -i :3000

# Kill existing process
kill $(lsof -t -i :3000)

# Check logs for errors
cd server
npm start
```

## Design Principles

1. **Filesystem as database**: All state in `jobs/` directory
2. **Git as audit trail**: Every phase creates a commit
3. **Server-rendered over SPA**: Simplicity and security
4. **Cookie sessions over JWT**: Rails-style authentication
5. **Manual refresh over polling**: Explicit user action
6. **Desktop-only**: No mobile/responsive complexity
7. **Security by default**: Input validation, safe execution

## Implementation Notes

### Why Server-Rendered?
- **Simpler**: No JSON API, no frontend build step
- **Faster**: No client-side hydration, immediate interactivity
- **More secure**: No CORS, no client-side secrets
- **Rails-inspired**: Proven pattern for CRUD apps

### Why Filesystem Queue?
- **No dependencies**: No Redis, Kafka, or RabbitMQ
- **Observable**: Queue state visible in `ralph/queue/`
- **Git-friendly**: Queue items are tracked files
- **Atomic operations**: Filesystem moves are atomic

### Why Bash for Kernel?
- **Universal**: Runs anywhere with Bash
- **Simple**: No runtime dependencies
- **Transparent**: Easy to read and debug
- **Composable**: Standard Unix tools

## Contributing

### Before Submitting PR
1. Run security tests: `node server/test-security.js`
2. Test happy path: Create job → Enqueue phase → View logs
3. Check commit messages follow conventional format
4. Ensure no secrets in code (use .env)

### Code Review Checklist
- [ ] No command injection vulnerabilities
- [ ] No path traversal vulnerabilities
- [ ] Input validation on all forms
- [ ] Passwords never logged or exposed
- [ ] Session secrets in .env, not code
- [ ] Git commits are checkpoint-style

## License

See LICENSE file.

## Credits

Built with:
- **Express** - Web framework
- **EJS** - Template engine
- **better-sqlite3** - SQLite database
- **bcryptjs** - Password hashing
- **helmet** - Security headers

Design influenced by:
- **Rails** - Server-rendered conventions
- **PARA** - Knowledge management system
- **Unix philosophy** - Small, composable tools

---

🤖 Implementation assisted by [Claude Code](https://claude.com/claude-code)
