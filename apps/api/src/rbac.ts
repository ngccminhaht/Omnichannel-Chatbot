export type WorkspaceRole = "owner" | "admin" | "supervisor" | "agent";

export type WorkspacePermission =
  | "workspace:read"
  | "workspace:manage"
  | "conversation:read"
  | "conversation:assign"
  | "conversation:reply"
  | "conversation:handoff"
  | "channel:manage"
  | "audit:read";

const rolePermissions: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  owner: ["workspace:read", "workspace:manage", "conversation:read", "conversation:assign", "conversation:reply", "conversation:handoff", "channel:manage", "audit:read"],
  admin: ["workspace:read", "workspace:manage", "conversation:read", "conversation:assign", "conversation:reply", "conversation:handoff", "channel:manage", "audit:read"],
  supervisor: ["workspace:read", "conversation:read", "conversation:assign", "conversation:reply", "conversation:handoff", "audit:read"],
  agent: ["workspace:read", "conversation:read", "conversation:reply", "conversation:handoff"],
};

export function can(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return rolePermissions[role].includes(permission);
}

export function assertPermission(role: WorkspaceRole, permission: WorkspacePermission): void {
  if (!can(role, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === "owner" || value === "admin" || value === "supervisor" || value === "agent";
}
