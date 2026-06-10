import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  AWS_REGION: z.string().default("ap-southeast-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  TOYYIBPAY_BASE_URL: z.string().default("https://toyyibpay.com"),
  TOYYIBPAY_SECRET_KEY: z.string().optional(),
  TOYYIBPAY_CATEGORY_CODE: z.string().optional(),
  TOYYIBPAY_RETURN_URL: z.string().optional(),
  TOYYIBPAY_CALLBACK_URL: z.string().optional()
});

export const env = schema.parse(process.env);

