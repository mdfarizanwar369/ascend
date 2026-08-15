import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

const required = ["DATABASE_URL", "TEST_FIREBASE_UID", "TEST_EMAIL", "AWS_REGION", "AWS_S3_ENDPOINT", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

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
  const inserted = await pool.query(
    "insert into users(firebase_uid,email,full_name) values($1,$2,$3) returning id",
    [process.env.TEST_FIREBASE_UID, process.env.TEST_EMAIL, "Disposable Delete User"]
  );
  const userId = inserted.rows[0].id;
  const objectKey = `food/${userId}/deletion-proof.jpg`;
  const body = Buffer.from("deletion-proof");
  await storage.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: objectKey,
    Body: body,
    ContentType: "image/jpeg"
  }));
  await pool.query(
    `insert into media_uploads(
      user_id,purpose,object_key,status,declared_content_type,detected_content_type,byte_size,width,height
    ) values($1,'food',$2,'completed','image/jpeg','image/jpeg',$3,1,1)`,
    [userId, objectKey, body.byteLength]
  );
  console.log(JSON.stringify({ userId, objectKey }));
} finally {
  await pool.end();
}
