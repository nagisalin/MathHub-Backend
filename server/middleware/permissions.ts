import { Request, Response, RequestHandler } from 'express';
import { QueryResult } from 'pg';
import { pool } from '../modules/db.js';
import { validateAuthToken, TokenName } from '../modules/token.js';

/**
 * 通用權限檢查 Middleware 工廠函數
 * @param requiredPermissions 需要的權限列表（滿足其中一個即可）
 * @returns Express middleware
 */
export const requirePermissions = (requiredPermissions: string[]): RequestHandler => {
    return async (req: Request, res: Response, next: Function): Promise<void> => {
        try {
            // 驗證 token
            const authPayload = validateAuthToken(req.cookies[TokenName.AUTH]);
            
            // 查詢用戶權限
            const result: QueryResult = await pool.query(
                `SELECT g.permissions 
                 FROM test_schema.auth a 
                 JOIN test_schema.groups g ON a.group_id = g.id 
                 WHERE a.id = $1`,
                [authPayload.username]
            );
            
            const userPermissions = result.rows[0]?.permissions || [];
            
            // 檢查用戶是否有任一所需權限
            const hasPermission = requiredPermissions.some(permission => 
                userPermissions.includes(permission)
            );
            
            if (hasPermission) {
                next();
            } else {
                res.status(403).json({ 
                    success: false, 
                    message: '權限不足',
                    required: requiredPermissions 
                });
            }
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(401).json({ 
                success: false, 
                message: '未授權' 
            });
        }
    };
};

/**
 * 預定義的權限 Middleware
 */
export const PERMISSION_MIDDLEWARE: Record<string, RequestHandler> = {
    // 管理相關
    managePermissions: requirePermissions(['allowManagePermissions']),
    manageUsers: requirePermissions(['allowManageUsers']),
    manageNotices: requirePermissions(['allowManageNotices']),
    manageSettings: requirePermissions(['allowManageSettings']),
    
    // 內容管理
    manageProblems: requirePermissions(['allowManageProblems']),
    manageProblemStatus: requirePermissions(['allowManageProblemStatus']),
    manageComments: requirePermissions(['allowManageComments']),
    manageReports: requirePermissions(['allowManageReports']),
    
    // 組合權限（滿足其中一個即可）
    anyAdmin: requirePermissions([
        'allowManagePermissions',
        'allowManageUsers',
        'allowManageNotices',
        'allowManageSettings'
    ]),
    anyContent: requirePermissions([
        'allowManageProblems',
        'allowManageProblemStatus',
        'allowManageComments',
        'allowManageReports'
    ]),
};

