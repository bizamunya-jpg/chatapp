# ChatApp Backend

This directory contains the Java/Spring Boot API for ChatApp. It handles user
authentication, conversations, rooms, messages, file attachments, calls, and
real-time messaging. The Next.js frontend calls its HTTP API and connects to
its WebSocket/STOMP endpoint.

## What the backend does and why

### Spring Boot API

Spring MVC exposes versioned JSON endpoints under `/api/v1`. The backend keeps
HTTP request handling in controllers, business operations in services, and
database access in Spring Data repositories. This separation makes API behavior
easier to test and keeps persistence and authorization rules close to the
operations they protect.

### PostgreSQL and Prisma schema

PostgreSQL is the shared application database. The Prisma schema and checked-in
migrations in `../frontend/prisma` describe the database structure used by the
frontend and backend. Java entities map onto those existing tables; Hibernate
uses `ddl-auto=validate` to detect mismatches at startup rather than silently
changing a shared database.

Use reviewed Prisma migrations to change the database. Do not use `prisma db
push` against the shared or production database. Existing rooms without an
owner are left unowned rather than assigning ownership based on guesses.

Rooms and direct conversations share the same underlying `Conversation`
records. The `type` field distinguishes `GROUP` from direct conversations.
This keeps participants, messages, calls, and attachments consistent across
both types of conversation.

### Authentication and authorization

Passwords are stored as BCrypt hashes, never as plaintext. Successful
registration or login returns a signed JWT access token and a refresh token.
Access tokens last three hours. Refresh tokens last 30 days, are stored as
SHA-256 hashes, and are rotated when refreshed. Logout revokes the active
refresh token.

The API is stateless: protected requests carry the signed access token using
the HTTP bearer-token authorization scheme instead of a server-side login
session.
Protected conversation and attachment operations also check the caller's
membership; knowing a conversation ID alone does not grant access.

Room roles are scoped to a room, not global application roles. The creator is
made an `ADMIN`; approved joiners and users who accept invitations become
`PARTICIPANT`s. Admin-only operations include inviting users, reviewing join
requests, changing roles, and deleting the room. A room must retain at least
one admin.

### Real-time messaging and calls

The WebSocket endpoint is `/ws`, using STOMP. Clients send application messages
to `/app` destinations and subscribe to `/topic` destinations. STOMP `CONNECT`
frames must include the same bearer token in the `Authorization` native header.

Chat messages and call-state/signaling events are relayed through the backend.
WebRTC media itself is exchanged by clients; the backend does not carry audio
or video streams.

### Private attachment storage

Attachments are uploaded through the authenticated backend as
`multipart/form-data`. The backend checks membership, file size, allowed MIME
type, and file signature before storing the file. The database stores metadata
and an opaque storage key; downloads are authorized by conversation membership.

Local filesystem storage is the default. Cloudflare R2 is an optional,
S3-compatible backend. When enabled, the server uses its private credentials to
upload, download, and delete objects. R2 keys must not be sent to the frontend.
Existing local files are not moved automatically when switching storage.

### API conventions

- `/api/v1/room` (singular) creates one room; `/api/v1/rooms` (plural) lists
  group rooms and contains join-request routes.
- Registration and login are public. Other HTTP API routes require a bearer
  token, except Swagger, the root redirect, and CORS preflight requests.
- Invalid request bodies are validated at the API boundary.
- Message history is paginated, with a maximum page size of 100.
- Duplicate direct conversations are avoided with a deterministic database key;
  message client IDs can make sending retries idempotent.
- Swagger UI is available at `/swagger-ui/index.html`; `/` redirects to it.

## Request flows

### Register and authenticate

1. The frontend submits a username, email, and password to
   `POST /api/v1/auth/register`.
2. The backend validates the values, normalizes username and email, hashes the
   password with BCrypt, and creates the user.
3. The backend returns an access token, refresh token, expiry timestamp, and
   user profile.
4. The frontend sends the access token as a bearer token on protected API calls.
5. When access expires, the frontend exchanges the refresh token at
   `POST /api/v1/auth/refresh`. The refresh token is rotated; the old token
   cannot be reused.

### Create a room and join it

1. An authenticated user sends
   `POST /api/v1/room` with `{"roomname":"Study Group"}`.
2. The backend creates the group conversation, records its owner, and adds the
   creator as an `ADMIN` in the same transaction.
3. Other users discover rooms with `GET /api/v1/rooms` and submit a request to
   `POST /api/v1/rooms/{roomId}/join-requests`.
4. An admin lists pending requests at
   `GET /api/v1/room/{roomId}/join-requests` and approves or rejects one using
   `PATCH /api/v1/room/{roomId}/join-requests/{requestId}` with
   `{"approved":true}` or `{"approved":false}`.
5. Approval adds the requester as a `PARTICIPANT`. Alternatively, an admin can
   invite an existing user; the invitee must accept before becoming a
   participant.

### Send a message

1. A room or direct-conversation member sends
   `POST /api/v1/conversations/{conversationId}/messages`.
2. The backend verifies membership, persists the message, then publishes it to
   `/topic/room/{conversationId}` for subscribed clients.
3. The same membership check protects message history, edits, and deletes.

### Upload and download an attachment

1. A member uploads to
   `POST /api/v1/conversations/{conversationId}/attachments` as
   `multipart/form-data` with a `file` field.
2. The backend validates the file, stores its bytes locally or in R2, then
   stores metadata and its storage key in PostgreSQL.
3. A member downloads it from `GET /api/v1/attachments/{attachmentId}`. The
   backend checks the attachment's conversation membership before reading from
   storage.

## API outline

All examples below are relative to `http://localhost:8080`. Protected routes
require an access token sent using the HTTP bearer-token authorization scheme.

### Authentication and users

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register and issue tokens |
| `POST` | `/api/v1/auth/login` | Login with `username` and password |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token and issue new tokens |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token |
| `GET`, `PATCH` | `/api/v1/users/me` | Read or update the signed-in profile |
| `GET` | `/api/v1/users?query=...` | Search for users |

### Conversations and messages

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/conversations` | List conversations the caller belongs to |
| `POST` | `/api/v1/conversations/direct` | Create or retrieve a direct conversation |
| `POST` | `/api/v1/conversations/{id}/participants` | Add a group participant (admin only) |
| `GET` | `/api/v1/conversations/{id}/messages` | Get a page of message history |
| `POST` | `/api/v1/conversations/{id}/messages` | Send a message |
| `PATCH` | `/api/v1/conversations/{id}/messages/{messageId}` | Edit own message |
| `DELETE` | `/api/v1/conversations/{id}/messages/{messageId}` | Delete own message |
| `PATCH` | `/api/v1/conversations/{id}/read` | Update read marker |

Message history accepts `page` (default `0`) and `size` (default `50`, maximum
`100`) query parameters.

### Rooms

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/room` | Create a room; creator becomes admin |
| `GET` | `/api/v1/rooms` | Discover group rooms |
| `DELETE` | `/api/v1/room/{roomId}` | Delete room (admin only) |
| `GET` | `/api/v1/room/{roomId}/participants` | List members and room roles |
| `PATCH` | `/api/v1/room/{roomId}/participants/{userId}/role` | Set role to `ADMIN` or `PARTICIPANT` |
| `POST` | `/api/v1/rooms/{roomId}/join-requests` | Request to join |
| `GET` | `/api/v1/rooms/{roomId}/join-request` | Read own latest join request |
| `GET` | `/api/v1/room/{roomId}/join-requests` | List pending requests (admin only) |
| `PATCH` | `/api/v1/room/{roomId}/join-requests/{requestId}` | Approve or reject a request |
| `POST` | `/api/v1/room/{roomId}/invitations` | Invite an existing user (admin only) |
| `GET` | `/api/v1/room/invitations` | List own pending invitations |
| `PATCH` | `/api/v1/room/invitations/{invitationId}` | Accept or decline an invitation |

Room deletion is permanent. Database foreign-key cascades remove related
participants, messages, attachments, calls, join requests, and invitations.

### Attachments and calls

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/conversations/{id}/attachments` | Upload a private attachment |
| `GET` | `/api/v1/attachments/{attachmentId}` | Download after membership verification |
| `POST` | `/api/v1/conversations/{id}/calls` | Start a call |
| `PATCH` | `/api/v1/conversations/{id}/calls/{callId}` | Update call state |

Call signaling is sent over STOMP `/app/call/{conversationId}` and published to
`/topic/call/{callId}`. Call events are published to
`/topic/call-events/{conversationId}`.

## Dependencies and why they are used

The authoritative dependency list is `pom.xml`. Spring Boot manages compatible
versions for the Spring starters; dependencies with explicit versions are
shown below.

| Dependency | Scope/version | Why it is used |
|---|---|---|
| `spring-boot-starter-webmvc` | Production | REST controllers, HTTP routing, multipart requests, and embedded Tomcat |
| `spring-boot-starter-jackson` | Production | Convert JSON request and response bodies |
| `spring-boot-starter-websocket` | Production | WebSocket, STOMP, and the in-process message broker |
| `spring-boot-starter-data-jpa` | Production | Map Java entities to PostgreSQL and implement repositories/transactions |
| `spring-boot-starter-security` | Production | Stateless request security, CORS policy, and password encoding |
| `spring-boot-starter-oauth2-resource-server` | Production | Validate JWT bearer tokens on protected HTTP requests |
| `spring-boot-starter-validation` | Production | Validate request DTOs such as required fields and input limits |
| `software.amazon.awssdk:s3` | Production, `2.31.54` | S3-compatible operations used for optional Cloudflare R2 object storage |
| `springdoc-openapi-starter-webmvc-ui` | Production, `3.0.0` | Generate OpenAPI documentation and serve Swagger UI |
| `org.postgresql:postgresql` | Runtime | PostgreSQL JDBC driver |
| `spring-boot-devtools` | Optional runtime | Local development restart and developer conveniences; not needed in production |
| `org.projectlombok:lombok` | Optional/compile-time | Generate repetitive Java accessors and constructors during compilation |
| `spring-boot-starter-webmvc-test` | Test | Spring MVC testing support, including MockMvc |
| `spring-boot-starter-websocket-test` | Test | Test support for WebSocket/STOMP configuration |
| `com.h2database:h2` | Test | In-memory relational database for isolated backend integration tests |

The Maven wrapper (`./mvnw`) pins and downloads the Maven version declared by
the wrapper, so a separate system Maven installation is not required.

## Configuration

Configuration is loaded from environment variables and, for local development,
the ignored `backend/.env` file. Never commit `.env` or paste secret values into
chat, source code, or logs.

| Variable | Required | Purpose/default |
|---|---|---|
| `DATABASE_URL` or `SPRING_DATASOURCE_URL` | Yes | PostgreSQL connection |
| `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | Sometimes | Separate database credentials if not embedded in the connection URL |
| `JWT_SECRET` | Yes | HMAC signing secret; at least 32 characters |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated frontend origin patterns; default `http://localhost:*` |
| `FILE_STORAGE_ROOT` | No | Local private attachment directory; default `./private-uploads` |
| `FILE_MAX_SIZE_BYTES` | No | Attachment byte limit; default `10485760` |
| `FILE_MAX_SIZE`, `FILE_MAX_REQUEST_SIZE` | No | Multipart limits; default `10MB` and `11MB` |
| `R2_ENABLED` | No | `false` by default; set `true` to use R2 instead of local storage |
| `R2_ENDPOINT` | When R2 enabled | HTTPS account endpoint, without a bucket path |
| `R2_BUCKET` | When R2 enabled | R2 bucket name |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | When R2 enabled | Private R2 API credentials |

For the provided bucket URL, the R2 endpoint is
`https://140d77b6222325f9ef2a70f95a319cf9.r2.cloudflarestorage.com` and the
bucket is `chatapp`. The access key and secret are separate credentials issued
by Cloudflare; they are not part of that URL. Configure them in the private
`backend/.env` file. Switching to R2 does not copy files from local disk.

## Run locally

1. Ensure PostgreSQL is available and the backend `.env` has the connection
   string. Keep the JWT secret stable; changing it invalidates issued access
   tokens.
2. Deploy pending Prisma migrations from the repository root:

   ```sh
   cd frontend
   npx prisma migrate deploy
   cd ..
   ```

   Do not rerun the recorded baseline or use `prisma db push` against the shared
   database. Migrations do not infer owners for legacy rooms.
3. Start the API in the background:

   ```sh
   cd backend
   ./backend.sh start
   ```

   The runner generates a private JWT secret if missing, writes logs and PID
   data under the ignored `.run/` directory, and starts the server at
   `http://localhost:8080`.
4. Manage the process from `backend/`:

   ```sh
   ./backend.sh status
   ./backend.sh logs
   ./backend.sh restart
   ./backend.sh stop
   ```

   Ctrl+C exits the log viewer, not the backend. The runner keeps the backend
   alive when the terminal closes, but does not automatically start it after a
   computer reboot.
5. To run in the foreground instead, use `./mvnw spring-boot:run` from
   `backend/`; Ctrl+C stops that process.

## Tests

Run the backend test suite from `backend/`:

```sh
./mvnw test
```

Tests use H2 and local HTTP stubs where appropriate; they do not require the
production PostgreSQL database or live R2 credentials. The R2 storage test
verifies S3-compatible upload, download, and deletion requests against a local
stub server.
