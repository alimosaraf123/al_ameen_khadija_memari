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

## Render deployment (OMR)

The OMR evaluator uses Python with OpenCV and NumPy. For a Node web service on
Render, set the service's build command to:

~~~sh
npm install && python3 -m pip install -r requirements.txt
~~~

Keep the start command as `npm start`. The OMR scan directory is selected at
runtime and no longer depends on the Windows `d:/memari_soft` path. You may set
`OMR_SCANS_DIR` to an absolute writable directory if needed.

OMR uploads require the same Cloudinary environment variables shown in
`.env.example`. Uploaded scan images go to `al-ameen/omr-scans`, are retained
for 15 days by default (`OMR_SCAN_RETENTION_DAYS` can override this), and are
then removed by the backend cleanup job. Evaluation results remain in
PostgreSQL.

When a school/council registration is not yet linked to a student, OMR identity
matching reads the sheet's handwritten name and matches it to the exam's student
roster. English OCR data is bundled with the Node dependencies. Results store the
student's real name, Mission registration and student ID before archiving or
terminal draft sync. Ambiguous names remain unmatched. New OMR uploads preserve
their original image format.

Both named OMR forms and signature-only forms are supported. The Python engine
detects the identity-field boxes and the OCR layer preserves blue handwriting.
Unresolved cursive signatures use a local TrOCR handwriting worker; its model is
downloaded once to `tmp/omr-handwriting-model` and then reused from disk. An
unresolved candidate can also be linked explicitly through the result details'
Mission Student selector. This stores the confirmed name and Mission ID in the
evaluation archive while preserving answers and scores.

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


## Cloudinary storage

All new student documents, legacy imports, student photos, teacher photos, and notice images are uploaded to Cloudinary. Images are resized and compressed to WebP in memory before upload; no temporary image is written to the server disk. PDFs are streamed from memory to Cloudinary as raw files.

Set these deployment environment variables:

~~~env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
~~~

Keep the API secret only on the backend. Existing local upload records remain readable for backward compatibility, while every new upload uses a Cloudinary HTTPS URL.

To migrate any remaining legacy local files safely, run npm run migrate:cloudinary. The command is resumable and deletes a local file only after its database URL is updated.
