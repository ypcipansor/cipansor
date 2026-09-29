import { Request, Response, NextFunction } from 'express';
import { rolesService } from './roles.service';
import { generateTokenPair, getExpirationDate, decodeToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { tokenUnitId } from '@/utils/resolve-unit-id';
import { tokenLegacyRole } from '@/middleware/auth';
import { mayReturnTokens, randomCsrfToken, setSessionCookies } from '@/modules/auth/auth.cookies';
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
        req.user!,
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
      await rolesService.removeRoleAssignment(req.user!, req.params.id);
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
      const assignment = await rolesService.setPrimaryRole(
        req.user!,
        userId,
        input.roleAssignmentId
      );
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
        role: tokenLegacyRole(result.activeRole.role.code, result.user.role),
        roleCode: result.activeRole.role.code,
        roleId: result.activeRole.roleId,
        // Same rule as login, 2FA and refresh (tokenUnitId): only a foundation
        // role may carry no unit. Deciding it differently here gave a switched
        // role one scope until the next refresh and another after it.
        unitId: tokenUnitId(
          result.activeRole.unitId,
          result.activeRole.role.code,
          result.user.unitId
        ),
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

      // Rotate the session in HttpOnly cookies, exactly as login does. A
      // request authenticated by a cookie never gets a token back (see
      // mayReturnTokens): a page script setting `X-Client: bearer` must not be
      // handed a fresh access and refresh token.
      const payload = decodeToken(tokens.accessToken);
      const roleCode = payload?.roleCode ?? result.activeRole.role.code;
      setSessionCookies(res, tokens.accessToken, tokens.refreshToken, randomCsrfToken(), {
        id: payload?.sub ?? result.user.id,
        role: payload?.role ?? roleCode,
        roleCode,
      });

      const bearer = mayReturnTokens(req);

      res.json({
        success: true,
        data: {
          message: 'Role switched successfully',
          activeRole: {
            id: result.activeRole.id,
            role: result.activeRole.role,
            unit: result.activeRole.unit,
          },
          ...(bearer ? tokens : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rolesController = new RolesController();
