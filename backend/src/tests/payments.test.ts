import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ToyyibPay provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  });

  it("accepts successful callbacks using the external reference", async () => {
    const { ToyyibPayProvider } = await import("../integrations/payments");
    const provider = new ToyyibPayProvider();

    await expect(
      provider.verifyWebhook({
        billExternalReferenceNo: "ASC-user-123",
        status_id: "1"
      })
    ).resolves.toEqual({
      reference: "ASC-user-123",
      status: "active"
    });
  });

  it("accepts common alternate callback field names", async () => {
    const { ToyyibPayProvider } = await import("../integrations/payments");
    const provider = new ToyyibPayProvider();

    await expect(
      provider.verifyWebhook({
        refno: "ASC-user-456",
        status: "cancelled"
      })
    ).resolves.toEqual({
      reference: "ASC-user-456",
      status: "canceled"
    });
  });

  it("rejects callbacks that cannot be matched to an Ascend checkout", async () => {
    const { ToyyibPayProvider } = await import("../integrations/payments");
    const provider = new ToyyibPayProvider();

    await expect(provider.verifyWebhook({ status_id: "1" })).rejects.toThrow("missing the Ascend reference");
  });
});
