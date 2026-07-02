import { NextFunction, Request, Response } from "express";
import { Role } from "@ascend/shared";
import { query } from "../db/pool";
import { getFirebaseAuth } from "../integrations/firebase";
import { env } from "../config/env";
import { createFoodAiTrace, timeFoodAiStage } from "../services/foodAiPerformance";

export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string;
  roles: Role[];
  primaryRole: Role;
  gymId?: string;
  trainerId?: string;
  isPlatformOwner: boolean;
}

export interface FirebaseTokenUser {
  firebaseUid: string;
  email?: string;
  name?: string;
}

function parseRoles(roles: Role[] | string | null | undefined): Role[] {
  if (Array.isArray(roles)) return roles;
  if (typeof roles !== "string") return [];

  return roles
    .replace(/^{|}$/g, "")
    .split(",")
    .map((role) => role.trim().replace(/^"|"$/g, ""))
    .filter((role): role is Role => ["client", "trainer", "admin", "owner"].includes(role));
}

function normalizeRoles(primaryRole: Role, roles: Role[] | string | null | undefined) {
  const parsedRoles = parseRoles(roles);
  const roleSet = new Set<Role>(parsedRoles.length ? parsedRoles : [primaryRole]);
  roleSet.add(primaryRole);

  if (primaryRole === "owner" || roleSet.has("owner")) {
    roleSet.add("owner");
    roleSet.add("admin");
  }

  return Array.from(roleSet);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      firebaseUser?: FirebaseTokenUser;
      foodAiPerf?: ReturnType<typeof createFoodAiTrace>;
    }
  }
}

export function parseBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1].length > 16_384) return null;
  return match[1];
}

export async function requireFirebaseToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req.header("Authorization"));
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const decoded = await getFirebaseAuth().verifyIdToken(token);
    req.firebaseUser = {
      firebaseUid: decoded.uid,
      email: decoded.email,
      name: decoded.name
    };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const requestPath = req.path ?? req.url ?? "";
  const token = parseBearerToken(req.header("Authorization"));
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  let decoded: Awaited<ReturnType<ReturnType<typeof getFirebaseAuth>["verifyIdToken"]>>;
  try {
    decoded = await timeFoodAiStage(req.foodAiPerf, "Authentication: Firebase token verification", () => getFirebaseAuth().verifyIdToken(token));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const ownerEmail = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    const decodedEmail = decoded.email?.trim().toLowerCase();
    if (!req.foodAiPerf && requestPath.includes("/food-logs/estimate") && ownerEmail && decodedEmail === ownerEmail) {
      req.foodAiPerf = createFoodAiTrace(requestPath);
    }

    const userResult = await timeFoodAiStage(req.foodAiPerf, "Authentication: PostgreSQL user lookup", () => query<{
      id: string;
      firebase_uid: string;
      email: string;
      primary_role: Role;
      status: string;
      gym_id?: string;
      trainer_id?: string;
      roles: Role[];
    }>(
      `
      select u.id, u.firebase_uid, u.email, u.primary_role, u.status, u.gym_id, t.id as trainer_id,
        coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}') as roles
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join trainers t on t.user_id = u.id
      where u.firebase_uid = $1
      group by u.id, t.id
      `,
      [decoded.uid]
    ));

    const dbUser = userResult.rows[0];
    if (!dbUser) return res.status(403).json({ error: "User profile has not been provisioned" });
    if (dbUser.status !== "active") return res.status(403).json({ error: "This account has been deactivated" });

    const isPlatformOwner = Boolean(ownerEmail && dbUser.email.trim().toLowerCase() === ownerEmail);
    let roles = normalizeRoles(dbUser.primary_role, dbUser.roles);

    if (isPlatformOwner) {
      const needsRoleRepair = dbUser.primary_role !== "owner" || !roles.includes("owner") || !roles.includes("admin");
      if (needsRoleRepair) {
        await timeFoodAiStage(req.foodAiPerf, "Authentication: owner role repair", async () => {
          await query("update users set primary_role = 'owner', updated_at = now() where id = $1 and primary_role <> 'owner'", [dbUser.id]);
          await query(
            "insert into user_roles (user_id, role) values ($1, 'owner'), ($1, 'admin') on conflict (user_id, role) do nothing",
            [dbUser.id]
          );
        });
      }
      dbUser.primary_role = "owner";
      roles = normalizeRoles("owner", [...roles, "owner", "admin"]);
    }

    req.user = {
      id: dbUser.id,
      firebaseUid: dbUser.firebase_uid,
      email: dbUser.email,
      primaryRole: dbUser.primary_role,
      roles,
      gymId: dbUser.gym_id,
      trainerId: dbUser.trainer_id,
      isPlatformOwner
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.some((role) => req.user?.roles.includes(role) || req.user?.primaryRole === role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function requirePlatformOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (!req.user.isPlatformOwner) {
    return res.status(403).json({ error: "Founder access only" });
  }
  next();
}
