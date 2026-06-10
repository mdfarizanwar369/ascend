import dotenv from "dotenv";
import { Pool } from "pg";
import { LOCAL_FOODS } from "@ascend/shared";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const gyms = await Promise.all([
      upsertGym(client, "Anytime Fitness Austin Green", "anytime-fitness-austin-green", "Austin Green, Johor"),
      upsertGym(client, "Anytime Fitness Kulai Indahpura", "anytime-fitness-kulai-indahpura", "Kulai Indahpura, Johor")
    ]);

    const admin = await upsertUser(client, {
      firebaseUid: "seed-admin",
      email: "owner@ascend.test",
      fullName: "Ascend Owner",
      role: "owner",
      gymId: gyms[0].id
    });

    await client.query("update gyms set owner_user_id = $1 where id = any($2::uuid[])", [admin.id, gyms.map((gym) => gym.id)]);

    const jasonUser = await upsertUser(client, {
      firebaseUid: "seed-trainer-jason",
      email: "jason@ascend.test",
      fullName: "Jason Tan",
      role: "trainer",
      gymId: gyms[0].id
    });
    const sitiUser = await upsertUser(client, {
      firebaseUid: "seed-trainer-siti",
      email: "siti@ascend.test",
      fullName: "Siti Aminah",
      role: "trainer",
      gymId: gyms[1].id
    });

    const jason = await upsertTrainer(client, jasonUser.id, gyms[0].id, ["Fat loss", "Beginner coaching"]);
    const siti = await upsertTrainer(client, sitiUser.id, gyms[1].id, ["Strength", "Nutrition habits"]);

    await upsertReferral(client, "AF-AUSTIN", "gym", gyms[0].id, null, admin.id);
    await upsertReferral(client, "AF-KULAI", "gym", gyms[1].id, null, admin.id);
    await upsertReferral(client, "TRAINER-JASON", "trainer", gyms[0].id, jason.id, jasonUser.id);
    await upsertReferral(client, "TRAINER-SITI", "trainer", gyms[1].id, siti.id, sitiUser.id);

    await upsertClient(client, "seed-client-ahmad", "ahmad@ascend.test", "Ahmad Rahman", gyms[0].id, jason.id, "fat_loss");
    await upsertClient(client, "seed-client-mei", "mei@ascend.test", "Mei Ling", gyms[0].id, jason.id, "maintenance");
    await upsertClient(client, "seed-client-kumar", "kumar@ascend.test", "Kumar Raj", gyms[1].id, siti.id, "muscle_gain");

    for (const food of LOCAL_FOODS) {
      await client.query(
        `
        insert into local_food_items (name, country, typical_calories, typical_protein_g, typical_carbs_g, typical_fat_g)
        values ($1, 'Malaysia/Singapore', 550, 22, 65, 20)
        on conflict (name) do nothing
        `,
        [food]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function upsertGym(client: any, name: string, slug: string, location: string) {
  const result = await client.query(
    "insert into gyms (name, slug, location) values ($1, $2, $3) on conflict (slug) do update set name = excluded.name returning *",
    [name, slug, location]
  );
  return result.rows[0];
}

async function upsertUser(client: any, input: { firebaseUid: string; email: string; fullName: string; role: string; gymId: string }) {
  const result = await client.query(
    `
    insert into users (firebase_uid, email, full_name, primary_role, gym_id)
    values ($1, $2, $3, $4, $5)
    on conflict (firebase_uid) do update set full_name = excluded.full_name, primary_role = excluded.primary_role
    returning *
    `,
    [input.firebaseUid, input.email, input.fullName, input.role, input.gymId]
  );
  await client.query("insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing", [result.rows[0].id, input.role]);
  return result.rows[0];
}

async function upsertTrainer(client: any, userId: string, gymId: string, specialties: string[]) {
  const result = await client.query(
    `
    insert into trainers (user_id, gym_id, specialties)
    values ($1, $2, $3)
    on conflict (user_id) do update set specialties = excluded.specialties
    returning *
    `,
    [userId, gymId, specialties]
  );
  return result.rows[0];
}

async function upsertReferral(client: any, code: string, type: string, gymId: string, trainerId: string | null, createdBy: string) {
  await client.query(
    `
    insert into referral_codes (code, type, gym_id, trainer_id, created_by_user_id)
    values ($1, $2, $3, $4, $5)
    on conflict (code) do update set active = true
    `,
    [code, type, gymId, trainerId, createdBy]
  );
}

async function upsertClient(
  client: any,
  firebaseUid: string,
  email: string,
  fullName: string,
  gymId: string,
  trainerId: string,
  goalType: string
) {
  const result = await client.query(
    `
    insert into users (
      firebase_uid, email, full_name, primary_role, gym_id, assigned_trainer_id,
      referred_by_gym_id, referred_by_trainer_id, goal_type, starting_weight_kg, target_weight_kg
    )
    values ($1, $2, $3, 'client', $4, $5, $4, $5, $6, 82, 75)
    on conflict (firebase_uid) do update set full_name = excluded.full_name
    returning *
    `,
    [firebaseUid, email, fullName, gymId, trainerId, goalType]
  );
  await client.query("insert into user_roles (user_id, role) values ($1, 'client') on conflict do nothing", [result.rows[0].id]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

