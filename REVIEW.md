# Code Review

### 1. SQL Injection Vulnerability in Task Search
* **File:** `src/app/api/projects/[id]/tasks/route.ts` (Lines ~21-28)
* **Category:** Security
* **Severity:** Critical
* **Description:** The `q` search parameter from the URL is interpolated directly into a raw SQL string using `prisma.$queryRawUnsafe`. This allows an attacker to pass maliciously crafted strings (e.g., `' OR 1=1; DROP TABLE tasks; --`) to execute arbitrary database commands, leading to complete database compromise.
* **Recommended Fix:** Replace `prisma.$queryRawUnsafe` with Prisma's tagged template `prisma.$queryRaw`, which automatically parameterizes inputs and escapes special characters securely.

### 2. Broken Access Control (IDOR) on Task Updates
* **File:** `src/app/api/tasks/[id]/route.ts` (Lines ~16-20)
* **Category:** Security / Architecture
* **Severity:** Critical
* **Description:** The `PATCH` endpoint authenticates the user but completely fails to authorize them against the specific project. Because there is no check against `getProjectMembership`, any authenticated user can update or modify *any* task across the entire application simply by guessing or knowing a valid Task ID.
* **Recommended Fix:** Before calling `prisma.task.update`, retrieve the existing task to get its `projectId`, then verify that the current user has a valid membership for that project with editing privileges (just like the `DELETE` method does).

//Example
curl -X PATCH http://localhost:3000/api/tasks/[id] -H "Authorization: Bearer token"  -H "Content-Type: application/json" -d "{\"status\":\"todo\"}"


### 3. Sensitive Data Leakage (Password Hashes) via Project API
* **File:** `src/app/api/projects/[id]/route.ts` (Lines ~22-30)
* **Category:** Security / Data Integrity
* **Severity:** High
* **Description:** The `GET` request fetches the project and heavily includes relational data (e.g., `owner: true`, `memberships: { include: { user: true } }`). Because the `User` model contains the `passwordHash` field, this query accidentally leaks the hashed passwords of project owners, members, and task assignees in the JSON response.
* **Recommended Fix:** Never use `true` for user includes. Instead, explicitly use the `select` argument to whitelist safe fields only (e.g., `select: { id: true, name: true, email: true }`).

### 4. Missing Unique Constraint on User Email
* **File:** `prisma/schema.prisma` (Line ~20)
* **Category:** Data Integrity
* **Severity:** High
* **Description:** The `email` field in the `User` model lacks a `@unique` database constraint. While application-level validation might exist during registration, race conditions could allow multiple users to be created with the exact same email address, permanently breaking authentication logic.
* **Recommended Fix:** Update the schema to `email String @unique` and generate a new Prisma migration to enforce this strictly at the PostgreSQL level.