import { Request, Response, NextFunction } from 'express';
import { rolesService } from './roles.service';
import {
  accessTokenTtlSeconds,
  sessionCookies,
  setCookies,
  wantsRawTokens,
} from '@/utils/auth-cookies';
import type { Realm } from '@prisma/client';
import type {
  GetRolesQuery,
  AssignRoleInput,
  SwitchRoleInput,
  SetPrimaryRoleInput,
  CreateRoleInput,
  UpdateRoleInput,
} from './roles.schema';

export class RolesController {
  /**
   * Get all roles
   */
  async getAllRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as GetRolesQuery;
      const roles = await rolesService.getAllRoles(query.realm as Realm);
      res.json({ success: true, data: roles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get role by ID
   */
  async getRoleById(req: Request, res: Response, next: NextFunction) {
    try {
      const role = await rolesService.getRoleById(req.params.id);
      res.json({ success: true, data: role });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new role
   */
  async createRole(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as CreateRoleInput;
      const role = await rolesService.createRole(input);
      res.status(201).json({ success: true, data: role });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update role
   */
  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as UpdateRoleInput;
      const role = await rolesService.updateRole(req.params.id, input);
      res.json({ success: true, data: role });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user's role assignments
   */
  async getMyRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const roles = await rolesService.getUserRoles(userId);
      res.json({ success: true, data: roles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific user's role assignments (admin only)
   */
  async getUserRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await rolesService.getUserRoles(req.params.userId);
      res.json({ success: true, data: roles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign role to user (admin only)
   */
  async assignRole(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as AssignRoleInput;
      const assignment = await rolesService.assignRoleToUser(
        input.userId,
        input.roleId,
        input.unitId,
        input.isPrimary,
        req.user?.roleCode
      );
      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove role assignment (admin only)
   */
  async removeRoleAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      await rolesService.removeRoleAssignment(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set primary role for user (admin only)
   */
  async setPrimaryRole(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.userId;
      const input = req.body as SetPrimaryRoleInput;
      const assignment = await rolesService.setPrimaryRole(userId, input.roleAssignmentId);
      res.json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Switch active role (for current user)
   * Returns new tokens with updated roleId
   */
  async switchRole(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const input = req.body as SwitchRoleInput;

      // Switch, re-validate account state, mint the pair and store the refresh
      // token in one transaction — see `switchRoleAndIssueSession`. Doing the
      // token insert here, outside the lock, let a suspension that committed in
      // the gap delete every token it could see while this one survived.
      const result = await rolesService.switchRoleAndIssueSession(userId, input.roleAssignmentId);

      // Re-issue the session cookies so the browser's `HttpOnly` access token
      // and routing hint carry the newly active role, not the previous one. A
      // bug here is exactly the "switched role has a stale scope" class the
      // tokenUnitId comment below guards against.
      setCookies(res, await sessionCookies(result.tokens));

      res.json({
        success: true,
        data: {
          message: 'Role switched successfully',
          activeRole: {
            id: result.activeRole.id,
            role: result.activeRole.role,
            unit: result.activeRole.unit,
          },
          // The browser's session is the cookie; only a native client gets the
          // raw pair in the body (`X-Client-Type: native`).
          ...(wantsRawTokens(req) ? result.tokens : { expiresIn: accessTokenTtlSeconds() }),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rolesController = new RolesController();
