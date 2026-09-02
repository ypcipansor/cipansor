import { Request, Response, NextFunction } from 'express';
import { rolesService } from './roles.service';
import { generateTokenPair, getExpirationDate } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';
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
        input.isPrimary
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

      const result = await rolesService.switchRole(userId, input.roleAssignmentId);

      // Generate new tokens with the new active role and its assigned unit
      const tokens = generateTokenPair({
        id: result.user.id,
        sub: result.user.id,
        email: result.user.email,
        role: result.user.role ?? '',
        roleCode: result.activeRole.role.code,
        roleId: result.activeRole.roleId,
        unitId: result.activeRole.unitId ?? result.user.unitId,
        permissions: (result.activeRole.role.permissions as string[]) ?? [],
      });

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: result.user.id,
          expiresAt: getExpirationDate(config.jwt.refreshExpiresIn),
        },
      });

      res.json({
        success: true,
        data: {
          message: 'Role switched successfully',
          activeRole: {
            id: result.activeRole.id,
            role: result.activeRole.role,
            unit: result.activeRole.unit,
          },
          ...tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rolesController = new RolesController();
