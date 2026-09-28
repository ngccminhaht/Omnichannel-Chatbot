import type { FastifyRequest } from "fastify";
import { query } from "./db.js";
import { can, isWorkspaceRole, type WorkspacePermission, type WorkspaceRole } from "./rbac.js";

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export async function requireWorkspaceContext(request: FastifyRequest, workspaceId: string, permission: WorkspacePermission): Promise<WorkspaceContext> {
  const expectedApiKey = process.env.CHAT2_API_KEY;
  const authorization = request.headers.authorization;
  if (!expectedApiKey || authorization !== `Bearer ${expectedApiKey}`) {
    throw new Error("UNAUTHORIZED");
  }

  const userId = request.headers["x-chat2-user-id"]?.toString();
  if (!userId) throw new Error("USER_CONTEXT_REQUIRED");

  const result = await query<{ role: string }>(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  const role = result.rows[0]?.role;
  if (!isWorkspaceRole(role)) throw new Error("WORKSPACE_ACCESS_DENIED");

  if (!can(role, permission)) throw new Error("PERMISSION_DENIED");
  return { userId, workspaceId, role };
}
