# Al-Ameen Backend

Node.js + Express + Neon PostgreSQL backend for the Al-Ameen Khadija Memari mobile app.

## Setup
1. Copy `.env.example` to `.env`.
2. Put the real Neon `DATABASE_URL` and a long `JWT_SECRET` in `.env`.
3. Run the SQL in `sql/schema.sql` in Neon SQL Editor.
4. `npm install`
5. Set `ADMIN_PASSWORD` temporarily and run `npm run create-admin`.
6. Remove `ADMIN_PASSWORD` from `.env` after the admin is created.
7. Start: `npm start`

## Important
- Never commit `.env`.
- Rotate credentials that were exposed in screenshots/chats.
- For production, deploy the Node backend to a Node-compatible host and set environment variables there.
- `uploads/` is local file storage for development. For production, use persistent object/file storage.

## Main API routes
- POST `/api/login`
- GET/POST `/api/rooms`
- GET/POST `/api/students`
- GET/POST `/api/teachers`
- GET/POST `/api/guardians`
- GET `/api/guardians/home`
- GET `/api/guardians/student/:studentId`
- GET `/api/attendance/room/:roomId?date=YYYY-MM-DD`
- POST `/api/attendance/batch`
- GET/POST `/api/problems`
- GET/POST `/api/behavior`
- GET/POST `/api/notices`
- GET/POST `/api/routines`
- Marks under `/api/marks`
- Dues under `/api/dues`
- Documents under `/api/documents`
