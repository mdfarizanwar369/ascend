import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { query } from "../db/pool";
import {
  disconnectHealthSync,
  getHealthSyncConnection,
  getHealthSyncStatus,
  importHealthSyncData,
  ImportedHealthSyncRecord
} from "../services/healthSyncService";

export const healthSyncRouter = Router();

const importedRecordSchema = z.object({
  type: z.enum(["steps_daily", "active_calories_daily", "exercise_session"]),
  externalRecordId: z.string().min(1).max(200),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  valueNumeric: z.number().finite().optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  sourceApp: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable()
});

const syncImportSchema = z.object({
  provider: z.literal("health_connect").default("health_connect"),
  permissions: z.array(z.string().min(1)).max(8).default([]),
  timezone: z.string().min(2).max(120).optional().nullable(),
  syncedAt: z.string().datetime().optional().nullable(),
  records: z.array(importedRecordSchema).max(120).default([])
});

async function trackHealthSyncEvent(userId: string, gymId: string | null | undefined, eventName: string, metadata: Record<string, unknown> = {}) {
  await query(
    `
    insert into analytics_events (user_id, gym_id, event_name, metadata)
    values ($1, $2, $3, $4)
    `,
    [userId, gymId ?? null, eventName, metadata]
  );
}

healthSyncRouter.get("/health-sync/status", requireAuth, async (req, res, next) => {
  try {
    res.json({ status: await getHealthSyncStatus(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

healthSyncRouter.post("/health-sync/import", requireAuth, async (req, res, next) => {
  try {
    const input = syncImportSchema.parse(req.body);
    const previousConnection = await getHealthSyncConnection(req.user!.id);
    const result = await importHealthSyncData(req.user!.id, {
      provider: input.provider,
      permissions: input.permissions,
      timezone: input.timezone ?? null,
      syncedAt: input.syncedAt ?? null,
      records: input.records as ImportedHealthSyncRecord[]
    });

    if (!previousConnection || previousConnection.status !== "connected") {
      await trackHealthSyncEvent(req.user!.id, req.user!.gymId, "health_sync_connected", {
        provider: input.provider,
        permissions: input.permissions
      });
    }
    await trackHealthSyncEvent(req.user!.id, req.user!.gymId, "health_sync_sync_success", {
      provider: input.provider,
      importedCount: result.importedCount
    });
    await trackHealthSyncEvent(req.user!.id, req.user!.gymId, "health_sync_records_imported", {
      provider: input.provider,
      importedCount: result.importedCount
    });

    res.json({ importedCount: result.importedCount, summary: result.summary });
  } catch (error) {
    await trackHealthSyncEvent(req.user!.id, req.user!.gymId, "health_sync_sync_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: typeof (error as { code?: unknown })?.code === "string"
        ? String((error as { code: string }).code).slice(0, 80)
        : null
    }).catch(() => undefined);
    next(error);
  }
});

healthSyncRouter.post("/health-sync/disconnect", requireAuth, async (req, res, next) => {
  try {
    await disconnectHealthSync(req.user!.id);
    await trackHealthSyncEvent(req.user!.id, req.user!.gymId, "health_sync_disconnected");
    res.json({ disconnected: true });
  } catch (error) {
    next(error);
  }
});
