import { Role } from "@ascend/shared";

export interface DeletionTarget {
  id: string;
  status: string;
  primaryRole: Role;
  roles: Role[];
  hasLivePaidSubscription: boolean;
}

export function permanentDeletionBlock(target: DeletionTarget, requestingUserId: string) {
  if (target.id === requestingUserId) return "You cannot permanently delete your own account.";
  if (target.status !== "inactive") return "Deactivate this user before permanently deleting the account.";
  if (target.primaryRole === "owner" || target.primaryRole === "admin" || target.roles.includes("owner") || target.roles.includes("admin")) {
    return "Owner and admin accounts cannot be permanently deleted from this screen.";
  }
  if (target.hasLivePaidSubscription) {
    return "Cancel this user's live paid subscription before permanently deleting the account.";
  }
  return null;
}
