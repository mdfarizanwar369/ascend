import { NextFunction, Request, Response } from "express";
import { Role } from "@ascend/shared";
import { query } from "../db/pool";
import { getFirebaseAuth } from "../integrations/firebase";

export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string;
  roles: Role[];
  primaryRole: Role;
  gymId?: string;
  trainerId?: string;
}

export interface FirebaseTokenUser {
  firebaseUid: string;
  email?: string;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      firebaseUser?: FirebaseTokenUser;
    }
  }
}

export async function requireFirebaseToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
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
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const decoded = await getFirebaseAuth().verifyIdToken(token);
    const userResult = await query<{
      id: string;
      firebase_uid: string;
      email: string;
      primary_role: Role;
      gym_id?: string;
      trainer_id?: string;
      roles: Role[];
    }>(
      `
      select u.id, u.firebase_uid, u.email, u.primary_role, u.gym_id, t.id as trainer_id,
        coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}') as roles
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join trainers t on t.user_id = u.id
      where u.firebase_uid = $1
      group by u.id, t.id
      `,
      [decoded.uid]
    );

    const dbUser = userResult.rows[0];
    if (!dbUser) return res.status(403).json({ error: "User profile has not been provisioned" });

    req.user = {
      id: dbUser.id,
      firebaseUid: dbUser.firebase_uid,
      email: dbUser.email,
      primaryRole: dbUser.primary_role,
      roles: dbUser.roles.length ? dbUser.roles : [dbUser.primary_role],
      gymId: dbUser.gym_id,
      trainerId: dbUser.trainer_id
    };

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.some((role) => req.user?.roles.includes(role))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
