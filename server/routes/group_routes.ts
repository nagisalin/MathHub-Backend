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
 * GET /groups - 取得所有群組（排除最高管理員群組）
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
             WHERE g.is_super_admin = false AND g.is_default_group = false
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
 * POST /groups - 建立新群組
 */
router.post(
	'/',
	PERMISSION_MIDDLEWARE.managePermissions,
	async (req: Request<{}, {}, { name: string; description?: string }>, res: Response) => {
		try {
			const { name, description } = req.body;

			if (!name || typeof name !== 'string' || name.trim().length === 0) {
				return res.status(400).json({ success: false, message: '群組名稱不能為空' });
			}

			// 檢查群組名稱是否已存在
			const existingGroup: QueryResult = await pool.query('SELECT id FROM test_schema.groups WHERE name = $1', [
				name.trim(),
			]);
			if (existingGroup.rows.length > 0) {
				return res.status(400).json({ success: false, message: '群組名稱已存在' });
			}

			// 建立新群組（預設無權限）
			const result: QueryResult = await pool.query(
				`INSERT INTO test_schema.groups (name, description, permissions)
             VALUES ($1, $2, $3)
             RETURNING id, name, description, permissions, created_at, updated_at`,
				[name.trim(), description || null, []]
			);

			res.status(201).json({
				success: true,
				data: {
					...result.rows[0],
					member_count: 0,
				},
			});
		} catch (error) {
			console.error('Create group error:', error);
			res.status(500).json({ success: false, message: '建立群組失敗' });
		}
	}
);

/**
 * PUT /groups/:id - 更新群組（名稱、描述、權限）
 */
router.put('/:id', PERMISSION_MIDDLEWARE.managePermissions, async (req: Request, res: Response) => {
	try {
		const groupId = req.params.id;
		const { name, description, permissions } = req.body;

		// 檢查群組是否存在
		const existingGroup: QueryResult = await pool.query(
			'SELECT is_super_admin, is_default_group FROM test_schema.groups WHERE id = $1',
			[groupId]
		);
		if (existingGroup.rows.length === 0) {
			return res.status(404).json({ success: false, message: '群組不存在' });
		}

		const isSuperAdminGroup = existingGroup.rows[0].is_super_admin === true;
		const isDefaultGroup = existingGroup.rows[0].is_default_group === true;

		// 如果更新的是最高管理員群組，必須保留 allowManagePermissions 權限
		if (isSuperAdminGroup && Array.isArray(permissions)) {
			if (!permissions.includes('allowManagePermissions')) {
				return res.status(400).json({
					success: false,
					message: '最高管理員群組必須保留管理權限',
				});
			}
		}

		// 如果更新的是預設群組（一般成員），強制權限為空陣列
		if (isDefaultGroup && Array.isArray(permissions)) {
			if (permissions.length > 0) {
				return res.status(400).json({
					success: false,
					message: '一般成員群組不能擁有任何權限',
				});
			}
		}

		// 建立更新欄位
		const updates: string[] = [];
		const params: any[] = [];
		let paramIndex = 1;

		if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
			// 檢查新名稱是否與其他群組重複
			const nameCheck: QueryResult = await pool.query(
				'SELECT id FROM test_schema.groups WHERE name = $1 AND id != $2',
				[name.trim(), groupId]
			);
			if (nameCheck.rows.length > 0) {
				return res.status(400).json({ success: false, message: '群組名稱已存在' });
			}

			updates.push(`name = $${paramIndex}`);
			params.push(name.trim());
			paramIndex++;
		}

		if (description !== undefined) {
			updates.push(`description = $${paramIndex}`);
			params.push(description || null);
			paramIndex++;
		}

		if (Array.isArray(permissions)) {
			// 如果是預設群組，強制設為空陣列
			const finalPermissions = isDefaultGroup ? [] : permissions;
			updates.push(`permissions = $${paramIndex}`);
			params.push(finalPermissions);
			paramIndex++;
		}

		if (updates.length === 0) {
			return res.status(400).json({ success: false, message: '沒有要更新的欄位' });
		}

		updates.push(`updated_at = NOW()`);
		params.push(groupId);

		// 更新群組
		const result: QueryResult = await pool.query(
			`UPDATE test_schema.groups 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex}
             RETURNING id, name, description, permissions, created_at, updated_at`,
			params
		);

		// 取得成員數量
		const memberCountResult: QueryResult = await pool.query(
			'SELECT COUNT(*) as count FROM test_schema.auth WHERE group_id = $1',
			[groupId]
		);

		res.json({
			success: true,
			data: {
				...result.rows[0],
				member_count: parseInt(memberCountResult.rows[0].count),
			},
		});
	} catch (error) {
		console.error('Update group error:', error);
		res.status(500).json({ success: false, message: '更新群組失敗' });
	}
});

/**
 * DELETE /groups/:id - 刪除群組
 */
router.delete('/:id', PERMISSION_MIDDLEWARE.managePermissions, async (req: Request, res: Response) => {
	try {
		const groupId = req.params.id;

		// 檢查群組是否存在
		const existingGroup: QueryResult = await pool.query(
			'SELECT is_super_admin, is_default_group FROM test_schema.groups WHERE id = $1',
			[groupId]
		);
		if (existingGroup.rows.length === 0) {
			return res.status(404).json({ success: false, message: '群組不存在' });
		}

		// 不可刪除最高管理員群組
		if (existingGroup.rows[0].is_super_admin === true) {
			return res.status(403).json({ success: false, message: '不可刪除最高管理員群組' });
		}

		// 不可刪除預設群組（一般成員）
		if (existingGroup.rows[0].is_default_group === true) {
			return res.status(403).json({ success: false, message: '不可刪除一般成員群組' });
		}

		// 刪除群組（FOREIGN KEY 會自動將該群組的用戶 group_id 設為 NULL）
		const result: QueryResult = await pool.query('DELETE FROM test_schema.groups WHERE id = $1 RETURNING id', [
			groupId,
		]);

		if (result.rows.length === 0) {
			return res.status(404).json({ success: false, message: '群組不存在' });
		}

		res.json({ success: true, message: '群組已刪除' });
	} catch (error) {
		console.error('Delete group error:', error);
		res.status(500).json({ success: false, message: '刪除群組失敗' });
	}
});

export default router;
