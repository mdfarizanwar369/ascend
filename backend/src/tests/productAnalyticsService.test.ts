import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, pool, structuredLog } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, pool: { connect: vi.fn(async () => client) }, structuredLog: vi.fn() };
});

vi.mock("../db/pool", () => ({ pool }));
vi.mock("../observability/logger", () => ({ structuredLog }));
vi.mock("../config/env", () => ({ env: { NODE_ENV: "test" } }));

import { recordProductEvent, recordProductEventSafely } from "../services/productAnalyticsService";

describe("product analytics", () => {
  beforeEach(() => {
    client.query.mockReset();
    client.release.mockReset();
    pool.connect.mockClear();
    structuredLog.mockReset();
  });

  it("stores only validated, versioned structured properties", async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({});

    await expect(recordProductEvent({
      name: "product.meal_ai_succeeded.v1",
      eventId: "request-12345678:meal-ai-success",
      userId: "user-1",
      properties: { mode: "photo" }
    })).resolves.toEqual({ recorded: true, id: "event-1" });

    const insert = client.query.mock.calls[3];
    expect(insert[1][2]).toBe("product.meal_ai_succeeded.v1");
    expect(JSON.parse(insert[1][3])).toEqual({
      eventId: "request-12345678:meal-ai-success",
      version: 1,
      environment: "test",
      testAccount: false,
      properties: { mode: "photo" }
    });
  });

  it("deduplicates a repeated event ID", async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "existing" }] })
      .mockResolvedValueOnce({});

    await expect(recordProductEvent({
      name: "product.registration_started.v1",
      eventId: "request-12345678:registration-started",
      properties: {}
    })).resolves.toEqual({ recorded: false, reason: "duplicate" });
  });

  it("honors opt-out before opening a database connection", async () => {
    await expect(recordProductEvent({
      name: "product.onboarding_started.v1",
      eventId: "request-12345678:onboarding-started",
      properties: {},
      analyticsAllowed: false
    })).resolves.toEqual({ recorded: false, reason: "opted_out" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects unexpected or sensitive free-form properties", async () => {
    await expect(recordProductEvent({
      name: "product.meal_photo_submitted.v1",
      eventId: "request-12345678:photo",
      properties: { imageUrl: "secret" } as never
    })).rejects.toThrow();
  });

  it("does not break a business action if internal analytics fails", async () => {
    pool.connect.mockRejectedValueOnce(new Error("analytics unavailable"));
    await expect(recordProductEventSafely({
      name: "product.account_deletion_requested.v1",
      eventId: "request-12345678:deletion",
      properties: { mode: "immediate" }
    })).resolves.toEqual({ recorded: false, reason: "failed" });
    expect(structuredLog).toHaveBeenCalledWith("warn", "product_analytics_event_failed", expect.objectContaining({
      eventName: "product.account_deletion_requested.v1"
    }));
  });
});
