import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

const fixture = JSON.parse(process.env.DELETION_FIXTURE ?? "{}");
if (!fixture.userId || !fixture.objectKey) throw new Error("DELETION_FIXTURE is required.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const storage = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

try {
  const user = await pool.query("select count(*)::int as count from users where id = $1", [fixture.userId]);
  const request = await pool.query(
    "select status, workflow_stage, attempt_count, firebase_deleted_at is not null as firebase_done, storage_deleted_at is not null as storage_done, database_deleted_at is not null as database_done from account_deletion_requests where id = $1",
    [process.env.DELETION_REQUEST_ID]
  );
  let objectExists = true;
  try {
    await storage.send(new HeadObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: fixture.objectKey }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") objectExists = false;
    else throw error;
  }
  console.log(JSON.stringify({ userCount: user.rows[0].count, objectExists, request: request.rows[0] }));
} finally {
  await pool.end();
}
