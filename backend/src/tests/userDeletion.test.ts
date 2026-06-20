import { describe, expect, it } from "vitest";
import { permanentDeletionBlock } from "../services/userDeletionService";

const inactiveClient = {
  id: "client-1",
  status: "inactive",
  primaryRole: "client" as const,
  roles: ["client" as const],
  hasLivePaidSubscription: false
};

describe("permanent user deletion safeguards", () => {
  it("allows an owner to delete an inactive client without live billing", () => {
    expect(permanentDeletionBlock(inactiveClient, "owner-1")).toBeNull();
  });

  it("requires deactivation first", () => {
    expect(permanentDeletionBlock({ ...inactiveClient, status: "active" }, "owner-1")).toContain("Deactivate");
  });

  it("protects owner and admin accounts", () => {
    expect(permanentDeletionBlock({ ...inactiveClient, primaryRole: "admin", roles: ["admin"] }, "owner-1")).toContain("Owner and admin");
    expect(permanentDeletionBlock({ ...inactiveClient, primaryRole: "owner", roles: ["owner", "admin"] }, "owner-2")).toContain("Owner and admin");
  });

  it("blocks deletion while paid billing is live", () => {
    expect(permanentDeletionBlock({ ...inactiveClient, hasLivePaidSubscription: true }, "owner-1")).toContain("paid subscription");
  });

  it("cannot delete the requesting account", () => {
    expect(permanentDeletionBlock(inactiveClient, "client-1")).toContain("own account");
  });
});
