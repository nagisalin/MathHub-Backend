import express, { Router, Request, Response } from 'express';
import { pool } from '../modules/db.js';
import { QueryResult } from 'pg';
import { validateAuthToken, TokenName } from '../modules/token.js';

const router: Router = express.Router();

// 系統所有可用權限定義
const AVAILABLE_PERMISSIONS = [
    {
        id: 'allowManagePermissions',
        name: '管理權限',
        description: '可以進入後台並編輯群組權限設定',
        category: 'admin'
    },
    // 之後擴充其他權限時加在這裡
];

/**
 * GET /groups/permissions/available - 取得系統所有可用權限
 */
router.get('/permissions/available', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: AVAILABLE_PERMISSIONS
    });
});

/**
 * Middleware: 驗證是否有管理權限
 */
const requireManagePermission = async (req: Request, res: Response, next: Function) => {
    try {
        const authPayload = validateAuthToken(req.cookies[TokenName.AUTH]);
        const result: QueryResult = await pool.query(
            `SELECT g.permissions 
             FROM test_schema.auth a 
             JOIN test_schema.groups g ON a.group_id = g.id 
             WHERE a.id = $1`,
            [authPayload.username]
        );
        
        const permissions = result.rows[0]?.permissions || [];
        if (permissions.includes('allowManagePermissions')) {
            next();
        } else {
            res.status(403).json({ success: false, message: '權限不足' });
        }
    } catch (error) {
        console.error('Permission check error:', error);
        res.status(401).json({ success: false, message: '未授權' });
    }
};

/**
 * GET /groups - 取得所有群組
 */
router.get('/', requireManagePermission, async (req: Request, res: Response) => {
    try {
        const result: QueryResult = await pool.query(
            `SELECT 
                g.id, 
                g.name, 
                g.description, 
                g.permissions, 
                g.created_at, 
                g.updated_at,
                COUNT(a.id) as member_count
             FROM test_schema.groups g
             LEFT JOIN test_schema.auth a ON a.group_id = g.id
             GROUP BY g.id, g.name, g.description, g.permissions, g.created_at, g.updated_at
             ORDER BY g.created_at ASC`
        );
        
        res.json({ 
            success: true, 
            data: result.rows.map(row => ({
                ...row,
                member_count: parseInt(row.member_count)
            }))
        });
    } catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ success: false, message: '取得群組失敗' });
    }
});

/**
 * GET /groups/:id - 取得單一群組
 */
router.get('/:id', requireManagePermission, async (req: Request, res: Response) => {
    try {
        const result: QueryResult = await pool.query(
            `SELECT id, name, description, permissions, created_at, updated_at
             FROM test_schema.groups WHERE id = $1`,
            [req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: '群組不存在' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Get group error:', error);
        res.status(500).json({ success: false, message: '取得群組失敗' });
    }
});

/**
 * PUT /groups/:id - 更新群組權限
 */
router.put('/:id', requireManagePermission, async (req: Request, res: Response) => {
    try {
        const { permissions, description } = req.body;
        
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: '權限格式錯誤' });
        }
        
        const result: QueryResult = await pool.query(
            `UPDATE test_schema.groups 
             SET permissions = $1, description = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING id, name, description, permissions, updated_at`,
            [permissions, description, req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: '群組不存在' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Update group error:', error);
        res.status(500).json({ success: false, message: '更新群組失敗' });
    }
});

export default router;

