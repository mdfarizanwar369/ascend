export type StorageNamespace = "body-composition" | "food" | "progress";

export function storageKeyBelongsToUser(key: string, namespace: StorageNamespace, userId: string) {
  return key.startsWith(`${namespace}/${userId}/`) && key.length > namespace.length + userId.length + 2;
}
