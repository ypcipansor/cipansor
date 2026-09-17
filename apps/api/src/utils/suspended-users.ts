const suspendedUserSet = new Set<string>();

export function markUserSuspended(userId: string): void {
  suspendedUserSet.add(userId);
}

export function unmarkUserSuspended(userId: string): void {
  suspendedUserSet.delete(userId);
}

export function isUserSuspended(userId: string): boolean {
  return suspendedUserSet.has(userId);
}
