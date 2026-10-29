This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Connecting the frontend to the backend

The browser calls the Spring Boot API through `lib/backend-api.ts`. The API
client adds the configured backend base URL, bearer authorization, JSON
handling, and refresh-token rotation. Copy `.env.example` to `.env.local` and
set `NEXT_PUBLIC_BACKEND_URL` to the reachable backend origin:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

Restart `npm run dev` after changing the environment file. For a deployed
frontend, use the public HTTPS origin of the deployed backend. The backend's
`CORS_ALLOWED_ORIGINS` must allow the frontend's origin.

## Google and GitHub sign-in

The login and registration pages use NextAuth v4 for Google and GitHub OAuth.
After the provider redirects back, the frontend server sends the provider
access token directly to Spring. Spring validates it against the provider,
persists the verified provider identity, and returns ChatApp's own access and
refresh tokens. Provider tokens and OAuth client secrets are never sent to the
browser. Protected chat API calls continue to use ChatApp bearer tokens.

Set these variables in the private `frontend/.env.local` file (see
`.env.example`):

- `NEXTAUTH_SECRET`: a random secret generated with `openssl rand -base64 32`.
- `NEXTAUTH_URL`: the public frontend origin.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
- `BACKEND_URL`: backend URL used only by the server-side OAuth exchange.

Register these OAuth callback URLs with each provider:

- Google: `http://localhost:3000/api/auth/callback/google`
- GitHub: `http://localhost:3000/api/auth/callback/github`

Use the corresponding HTTPS frontend callback URLs in production. GitHub must
grant `read:user` and `user:email` scopes so Spring can confirm the account's
verified primary email. OAuth sign-in will not automatically attach a provider
to an existing password account with the same email, because that account's
email may not have been verified; account linking is not currently supported.
Deploy pending OAuth, profile-image, and group-call database migrations with
`npx prisma migrate deploy` before starting the updated backend.

The frontend validates form inputs and auth responses with Zod. Spring also
validates incoming request DTOs independently.

Use the typed functions exported from `lib/backend-api.ts` for auth, user,
conversation, room, attachment, and call HTTP operations. For example:

```ts
import { backendApi } from "@/lib/backend-api";

const session = await backendApi.auth.login({ username, password });
const rooms = await backendApi.rooms.list();
```

API calls for protected resources automatically include the ChatApp bearer
token and refresh it when needed. Calls and attachment downloads are restricted
by the backend to conversation participants. Selecting a conversation opens a
popup with quick call and file controls plus links to the dedicated Calls and
Attachments pages. Incoming calls appear as an in-app answer/decline dialog;
direct chats support one-to-one voice calls and groups support multi-member
voice calls. Group-call invitations can be accepted or declined in the app, and
joined members connect over peer-to-peer audio. Browser notifications can be
enabled from the incoming-call dialog. Users can upload or remove a profile
image (JPG, PNG, GIF, or WebP, up to 2 MB); profiles without an uploaded image
remain blank.
Configure the backend's `CORS_ALLOWED_ORIGINS` with the frontend's exact
deployed origin as well as local development origins.

Access and refresh tokens are held in browser `sessionStorage` and cleared when
logout completes. Do not put backend secrets, database URLs, or R2 credentials
in `NEXT_PUBLIC_*` variables. The frontend connects to the API; it should not
use Prisma as a browser-side database client.

## Prisma schema and migrations

The Prisma CLI uses the database connection variables in the private `.env`
file to validate the schema, generate its client, and run migrations:

- `DATABASE_URL` is the pooled connection used by the application.
- `DIRECT_URL` is the direct connection used for Prisma migrations.

The schema is in [`prisma/schema.prisma`](./prisma/schema.prisma). Validate it and generate the client with:

```bash
npx prisma validate
npx prisma generate
```

## Java backend database

The Java backend uses the same PostgreSQL database and maps its rooms to Prisma's
`Conversation` records and its messages to Prisma's `Message` records. It accepts
the Prisma `DATABASE_URL` from the process environment and converts it to a JDBC
URL. Keep the URL in `.env`; do not commit it or paste its credentials into source.

Apply pending database changes with Prisma migrations before starting the
backend. Do not use `prisma db push`:

```bash
npx prisma migrate deploy
```

Then start the backend from the repository's `backend` directory. Its
`backend/.env` contains the database connection and JWT secret:

```bash
cd ../backend
./backend.sh start
```

The backend validates that the existing database schema matches the JPA entities
at startup. For the frontend, open another terminal in `frontend` and run
`npm run dev`, then browse to `http://localhost:3000`. The backend API is at
`http://localhost:8080`, with Swagger at
`http://localhost:8080/swagger-ui/index.html`.

Create a room with `POST http://localhost:8080/api/v1/room` and this JSON
request body:

```json
{
  "roomname": "Study Group"
}
```

Include the access token as a bearer token. The backend stores the room name as
the conversation title and generates a unique UUID `id`. The creator is
automatically added as the room owner, an `ADMIN`, and a participant. New
members join with the `PARTICIPANT` role. Room members and roles can be viewed
at `GET /api/v1/room/{roomId}/participants`; an admin can change a member role
with `PATCH /api/v1/room/{roomId}/participants/{userId}/role` and
`{"role":"ADMIN"}` or `{"role":"PARTICIPANT"}`. At least one admin must remain.
`GET /api/v1/rooms`
lists group rooms that can be requested to join.

Room admins can permanently delete a room with
`DELETE /api/v1/room/{roomId}`. Deleting a room also deletes its related
memberships, messages, attachments, calls, join requests, and invitations.

To request access, send `POST /api/v1/rooms/{roomId}/join-requests` with the
access token. The owner can list requests with
`GET /api/v1/room/{roomId}/join-requests` and approve or reject one using
`PATCH /api/v1/room/{roomId}/join-requests/{requestId}` with
`{"approved":true}` or `{"approved":false}`.

An existing participant can invite a user with
`POST /api/v1/room/{roomId}/invitations` and `{"userId":"..."}` (admin role
required). The invitee
lists pending invitations at `GET /api/v1/room/invitations` and accepts or
declines via `PATCH /api/v1/room/invitations/{invitationId}` with
`{"accepted":true}` or `{"accepted":false}`. Invitations require acceptance
before the invitee is added. Room and conversation data are the same database
records; message endpoints continue to use the conversation ID. Existing rooms
are not assigned an inferred owner; legacy rooms without an owner remain
visible but cannot approve join requests until ownership is assigned.

Swagger UI is available at `http://localhost:8080/swagger-ui/index.html`, and the
OpenAPI document is at `http://localhost:8080/v3/api-docs`. For live chat, connect
a STOMP client to `/ws`, subscribe to `/topic/room/{roomId-or-name}`, and send a
JSON request to `/app/sendMessage/{roomId-or-name}`:

```json
{
  "sender": "an-existing-user-id",
  "roomId": "room-id-or-name",
  "content": "Hello"
}
```

## Access-token storage

The backend returns an access JWT from registration and login. In browser-side
code, use [`lib/auth-token.ts`](./lib/auth-token.ts) to store it in
`sessionStorage`:

```ts
import { storeAccessToken, getAccessToken, clearAccessToken } from "@/lib/auth-token";

storeAccessToken(authResponse.accessToken);
const token = getAccessToken();
clearAccessToken();
```

Use [`lib/api-client.ts`](./lib/api-client.ts) for protected backend calls; it
adds the stored token as `Authorization: Bearer <token>` and throws if no token
has been saved. Registration and login are public and should use `fetch`
directly, then save the returned `accessToken` with `storeAccessToken`.

`sessionStorage` is scoped to the current browser tab and is cleared when that
tab closes. It is accessible to JavaScript running on the page, so protect the
app against cross-site scripting; for higher-security deployments, prefer
server-managed `HttpOnly`, `Secure`, `SameSite` cookies.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

this website is going to be a `nextjs` project using `java` for its `backend` and using `prisma` for `database` using `postgres`
 