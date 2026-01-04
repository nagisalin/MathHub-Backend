import express, { Router, Request, Response } from 'express';
import { pool } from '../modules/db.js';
import { QueryResult } from 'pg';
import { PERMISSION_MIDDLEWARE } from '../middleware/permissions.js';

const router: Router = express.Router();

// 系統所有可用權限定義
// 順序對應前端頁面菜單順序：儀表板、帳號管理、留言管理、審題/新增題目、修改題目狀態、檢舉審核、公告編輯、權限管理、系統設定
const AVAILABLE_PERMISSIONS = [
	// 1. 帳號管理
	{
		id: 'allowManageUsers',
		name: '管理帳號',
		description: '可以查看、編輯、停用帳號',
		category: 'admin',
	},
	// 2. 留言管理
	{
		id: 'allowManageComments',
		name: '管理留言',
		description: '可以查看、編輯、刪除用戶留言',
		category: 'content',
	},
	// 3. 審題/新增題目
	{
		id: 'allowManageProblems',
		name: '管理題目',
		description: '可以新增、編輯、審核題目',
		category: 'content',
	},
	// 4. 修改題目狀態
	{
		id: 'allowManageProblemStatus',
		name: '修改題目狀態',
		description: '可以修改題目的發布狀態',
		category: 'content',
	},
	// 5. 檢舉審核
	{
		id: 'allowManageReports',
		name: '管理檢舉',
		description: '可以審核、處理用戶檢舉',
		category: 'content',
	},
	// 6. 公告編輯
	{
		id: 'allowManageNotices',
		name: '管理公告',
		description: '可以新增、編輯、刪除系統公告',
		category: 'admin',
	},
	// 7. 權限管理
	{
		id: 'allowManagePermissions',
		name: '管理權限',
		description: '可以進入後台並編輯群組權限設定',
		category: 'admin',
	},
	// 8. 系統設定
	{
		id: 'allowManageSettings',
		name: '管理系統設定',
		description: '可以修改系統全局設定',
		category: 'admin',
	},
];

/**
 * GET /groups/permissions/available - 取得系統所有可用權限
 * 需要 allowManagePermissions 權限
 */
router.get('/permissions/available', PERMISSION_MIDDLEWARE.managePermissions, (req: Request, res: Response) => {
	res.json({
		success: true,
		data: AVAILABLE_PERMISSIONS,
	});
});

/**
 * GET /groups - 取得所有群組
 */
router.get('/', PERMISSION_MIDDLEWARE.managePermissions, async (req: Request, res: Response) => {
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
			data: result.rows.map((row) => ({
				...row,
				member_count: parseInt(row.member_count),
			})),
		});
	} catch (error) {
		console.error('Get groups error:', error);
		res.status(500).json({ success: false, message: '取得群組失敗' });
	}
});

/**
 * GET /groups/:id - 取得單一群組
 */
router.get('/:id', PERMISSION_MIDDLEWARE.managePermissions, async (req: Request, res: Response) => {
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
router.put('/:id', PERMISSION_MIDDLEWARE.managePermissions, async (req: Request, res: Response) => {
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
