import express, { Router, Request, Response } from 'express';
import { pool } from '../modules/db.js';
import { QueryResult } from 'pg';
import crypto from 'node:crypto';
import { validateAuthToken, TokenName } from '../modules/token.js';
import { PERMISSION_MIDDLEWARE } from '../middleware/permissions.js';

const router: Router = express.Router();

// 密碼格式驗證：至少8位，最長64位，至少一個大寫字母和一個特殊字元
const PASSWORD_FORMAT: RegExp =
	/^(?=.*[A-Z])(?=.*[!"#$%&'()*+,-./:;<=>?@^_`{|}~])[a-zA-Z0-9!"#$%&'()*+,-./:;<=>?@^_`{|}~]{8,64}$/;

// 電子郵件格式驗證
const EMAIL_FORMAT: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 檢查帳號是否為最高管理員
 */
async function isSuperAdmin(userId: string): Promise<boolean> {
	try {
		const result: QueryResult = await pool.query(
			`SELECT g.is_super_admin 
			 FROM test_schema.auth a 
			 JOIN test_schema.groups g ON a.group_id = g.id 
			 WHERE a.id = $1`,
			[userId]
		);
		return result.rows[0]?.is_super_admin === true;
	} catch (error) {
		console.error('Check super admin error:', error);
		return false;
	}
}

/**
 * 檢查群組是否為最高管理員群組
 */
async function isSuperAdminGroup(groupId: string): Promise<boolean> {
	try {
		const result: QueryResult = await pool.query(
			`SELECT is_super_admin FROM test_schema.groups WHERE id = $1`,
			[groupId]
		);
		return result.rows[0]?.is_super_admin === true;
	} catch (error) {
		console.error('Check super admin group error:', error);
		return false;
	}
}

/**
 * 格式化用戶資料回應
 */
function formatUserResponse(user: any) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		group_id: user.group_id,
		group_name: user.group_name || null,
		birthday: user.birthday ? Number(user.birthday) : null,
		grade: user.grade || null,
		is_email_validated: user.is_email_validated || false,
		is_disabled: user.is_disabled || false,
		is_archived: user.is_archived || false,
		created_at: user.created_at ? new Date(user.created_at).getTime() : null,
		updated_at: user.updated_at ? new Date(user.updated_at).getTime() : null,
	};
}

/**
 * 回傳成功回應
 */
function successResponse(res: Response, data: any, statusCode: number = 200) {
	res.status(statusCode).json({
		success: true,
		data,
	});
}

/**
 * 回傳失敗回應
 */
function errorResponse(res: Response, message: string, statusCode: number = 400) {
	res.status(statusCode).json({
		success: false,
		message,
	});
}

/**
 * GET /auth/users - 取得帳號列表（分頁）
 */
router.get('/', PERMISSION_MIDDLEWARE.manageUsers, async (req: Request, res: Response) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 20;
		const search = req.query.search as string;
		const groupId = req.query.group_id as string;
		const isDisabled = req.query.is_disabled as string;

		const offset = (page - 1) * limit;

		// 建立 WHERE 條件
		const conditions: string[] = ['a.is_archived = false']; // 過濾已刪除
		const params: any[] = [];
		let paramIndex = 1;

		// 過濾最高管理員群組
		conditions.push(`(g.is_super_admin = false OR g.is_super_admin IS NULL)`);

		// 搜尋條件
		if (search) {
			conditions.push(`(a.email ILIKE $${paramIndex} OR a.name ILIKE $${paramIndex})`);
			params.push(`%${search}%`);
			paramIndex++;
		}

		// 群組篩選
		if (groupId) {
			conditions.push(`a.group_id = $${paramIndex}`);
			params.push(groupId);
			paramIndex++;
		}

		// 停用狀態篩選
		if (isDisabled === 'true' || isDisabled === 'false') {
			conditions.push(`a.is_disabled = $${paramIndex}`);
			params.push(isDisabled === 'true');
			paramIndex++;
		}

		const whereClause = conditions.join(' AND ');

		// 查詢總數
		const countResult: QueryResult = await pool.query(
			`SELECT COUNT(*) as total
			 FROM test_schema.auth a
			 LEFT JOIN test_schema.groups g ON a.group_id = g.id
			 WHERE ${whereClause}`,
			params
		);
		const total = parseInt(countResult.rows[0].total);

		// 查詢列表
		const result: QueryResult = await pool.query(
			`SELECT 
				a.id, a.email, a.name, a.group_id, a.birthday, a.grade,
				a.is_email_validated, a.is_disabled, a.is_archived,
				a.created_at, a.updated_at,
				g.name as group_name
			 FROM test_schema.auth a
			 LEFT JOIN test_schema.groups g ON a.group_id = g.id
			 WHERE ${whereClause}
			 ORDER BY a.created_at DESC
			 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
			[...params, limit, offset]
		);

		successResponse(res, {
			users: result.rows.map(formatUserResponse),
			total,
			page,
			limit,
		});
	} catch (error) {
		console.error('Get users error:', error);
		errorResponse(res, '取得帳號列表失敗', 500);
	}
});

/**
 * GET /auth/users/:id - 取得單一帳號
 */
router.get('/:id', PERMISSION_MIDDLEWARE.manageUsers, async (req: Request, res: Response) => {
	try {
		const result: QueryResult = await pool.query(
			`SELECT 
				a.id, a.email, a.name, a.group_id, a.birthday, a.grade,
				a.is_email_validated, a.is_disabled, a.is_archived,
				a.created_at, a.updated_at,
				g.name as group_name
			 FROM test_schema.auth a
			 LEFT JOIN test_schema.groups g ON a.group_id = g.id
			 WHERE a.id = $1 AND a.is_archived = false`,
			[req.params.id]
		);

		if (result.rows.length === 0) {
			return errorResponse(res, '帳號不存在', 404);
		}

		successResponse(res, formatUserResponse(result.rows[0]));
	} catch (error) {
		console.error('Get user error:', error);
		errorResponse(res, '取得帳號失敗', 500);
	}
});

/**
 * POST /auth/users - 建立新帳號
 */
router.post('/', PERMISSION_MIDDLEWARE.manageUsers, async (
	req: Request<{}, {}, {
		email: string;
		name: string;
		password: string;
		group_id?: string;
		birthday?: number;
		grade?: string;
		is_email_validated?: boolean;
	}>,
	res: Response
) => {
	try {
		const { email, name, password, group_id, birthday, grade, is_email_validated } = req.body;

		// 驗證必填欄位
		if (!email || !name || !password) {
			return errorResponse(res, '缺少必填欄位：email, name, password');
		}

		// 驗證電子郵件格式
		if (!EMAIL_FORMAT.test(email)) {
			return errorResponse(res, '電子郵件格式不正確');
		}

		// 驗證密碼格式
		if (!PASSWORD_FORMAT.test(password)) {
			return errorResponse(res, '密碼格式不正確，需要8-64位，至少包含一個大寫字母和一個特殊字元');
		}

		// 檢查電子郵件是否已存在（包括 archived 帳號）
		const existingUser: QueryResult = await pool.query(
			'SELECT id FROM test_schema.auth WHERE email = $1',
			[email]
		);
		if (existingUser.rows.length > 0) {
			return errorResponse(res, '此電子郵件已被使用');
		}

		// 密碼加密
		const salt: string = crypto.randomBytes(16).toString('hex');
		const hashedPassword: Buffer = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512');

		// 取得預設群組（如果未指定）
		let finalGroupId = group_id;
		if (!finalGroupId) {
			const defaultGroupResult: QueryResult = await pool.query(
				"SELECT id FROM test_schema.groups WHERE name = '一般成員'"
			);
			if (defaultGroupResult.rows.length > 0) {
				finalGroupId = defaultGroupResult.rows[0].id;
			}
		}

		// 建立帳號
		const result: QueryResult = await pool.query(
			`INSERT INTO test_schema.auth (
				email, name, password, salt, group_id,
				birthday, grade, is_email_validated, is_disabled, is_archived
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id, email, name, group_id, birthday, grade,
				is_email_validated, is_disabled, is_archived, created_at, updated_at`,
			[
				email,
				name,
				hashedPassword,
				salt,
				finalGroupId,
				birthday ? new Date(birthday) : null,
				grade || null,
				is_email_validated ?? true,
				false, // is_disabled 預設 false
				false, // is_archived 預設 false
			]
		);

		// 取得群組名稱
		const groupResult: QueryResult = await pool.query(
			'SELECT name FROM test_schema.groups WHERE id = $1',
			[finalGroupId]
		);

		const user = result.rows[0];
		successResponse(res, {
			...formatUserResponse(user),
			group_name: groupResult.rows[0]?.name || null,
		}, 201);
	} catch (error) {
		console.error('Create user error:', error);
		errorResponse(res, '建立帳號失敗', 500);
	}
});

/**
 * PATCH /auth/users/:id - 更新帳號
 */
router.patch('/:id', PERMISSION_MIDDLEWARE.manageUsers, async (
	req: Request<{ id: string }, {}, {
		name?: string;
		email?: string;
		group_id?: string;
		birthday?: number;
		grade?: string;
		is_email_validated?: boolean;
	}>,
	res: Response
) => {
	try {
		const userId = req.params.id;
		const { name, email, group_id, birthday, grade, is_email_validated } = req.body;

		// 檢查是否為最高管理員
		if (await isSuperAdmin(userId)) {
			return errorResponse(res, '不可編輯最高管理員', 403);
		}

		// 檢查帳號是否存在
		const existingUser: QueryResult = await pool.query(
			'SELECT id, email FROM test_schema.auth WHERE id = $1 AND is_archived = false',
			[userId]
		);
		if (existingUser.rows.length === 0) {
			return errorResponse(res, '帳號不存在', 404);
		}

		// 如果更新 email，檢查是否重複
		if (email && email !== existingUser.rows[0].email) {
			const emailCheck: QueryResult = await pool.query(
				'SELECT id FROM test_schema.auth WHERE email = $1 AND id != $2',
				[email, userId]
			);
			if (emailCheck.rows.length > 0) {
				return errorResponse(res, '此電子郵件已被使用');
			}

			// 驗證電子郵件格式
			if (!EMAIL_FORMAT.test(email)) {
				return errorResponse(res, '電子郵件格式不正確');
			}
		}

		// 建立更新欄位
		const updates: string[] = [];
		const params: any[] = [];
		let paramIndex = 1;

		if (name !== undefined) {
			updates.push(`name = $${paramIndex}`);
			params.push(name);
			paramIndex++;
		}
		if (email !== undefined) {
			updates.push(`email = $${paramIndex}`);
			params.push(email);
			paramIndex++;
		}
		if (group_id !== undefined) {
			updates.push(`group_id = $${paramIndex}`);
			params.push(group_id);
			paramIndex++;
		}
		if (birthday !== undefined) {
			updates.push(`birthday = $${paramIndex}`);
			params.push(birthday ? new Date(birthday) : null);
			paramIndex++;
		}
		if (grade !== undefined) {
			updates.push(`grade = $${paramIndex}`);
			params.push(grade || null);
			paramIndex++;
		}
		if (is_email_validated !== undefined) {
			updates.push(`is_email_validated = $${paramIndex}`);
			params.push(is_email_validated);
			paramIndex++;
		}

		if (updates.length === 0) {
			return errorResponse(res, '沒有要更新的欄位');
		}

		updates.push(`updated_at = NOW()`);
		params.push(userId);

		// 更新帳號
		const result: QueryResult = await pool.query(
			`UPDATE test_schema.auth 
			 SET ${updates.join(', ')}
			 WHERE id = $${paramIndex}
			 RETURNING id, email, name, group_id, birthday, grade,
				is_email_validated, is_disabled, is_archived, created_at, updated_at`,
			params
		);

		// 取得群組名稱
		const groupResult: QueryResult = await pool.query(
			'SELECT name FROM test_schema.groups WHERE id = $1',
			[result.rows[0].group_id]
		);

		successResponse(res, {
			...formatUserResponse(result.rows[0]),
			group_name: groupResult.rows[0]?.name || null,
		});
	} catch (error) {
		console.error('Update user error:', error);
		errorResponse(res, '更新帳號失敗', 500);
	}
});

/**
 * PATCH /auth/users/:id/status - 停用/啟用帳號
 */
router.patch('/:id/status', PERMISSION_MIDDLEWARE.manageUsers, async (
	req: Request<{ id: string }, {}, { is_disabled: boolean }>,
	res: Response
) => {
	try {
		const userId = req.params.id;
		const { is_disabled } = req.body;

		if (typeof is_disabled !== 'boolean') {
			return errorResponse(res, 'is_disabled 必須為 boolean');
		}

		// 檢查是否為最高管理員
		if (await isSuperAdmin(userId)) {
			return errorResponse(res, '不可停用最高管理員', 403);
		}

		// 更新狀態
		const result: QueryResult = await pool.query(
			`UPDATE test_schema.auth 
			 SET is_disabled = $1, updated_at = NOW()
			 WHERE id = $2 AND is_archived = false
			 RETURNING id, is_disabled`,
			[is_disabled, userId]
		);

		if (result.rows.length === 0) {
			return errorResponse(res, '帳號不存在', 404);
		}

		successResponse(res, {
			id: result.rows[0].id,
			is_disabled: result.rows[0].is_disabled,
			message: is_disabled ? '帳號已停用' : '帳號已啟用',
		});
	} catch (error) {
		console.error('Update user status error:', error);
		errorResponse(res, '更新帳號狀態失敗', 500);
	}
});

/**
 * DELETE /auth/users/:id - 刪除帳號（Archive）
 */
router.delete('/:id', PERMISSION_MIDDLEWARE.manageUsers, async (req: Request, res: Response) => {
	try {
		const userId = req.params.id;

		// 檢查是否為最高管理員
		if (await isSuperAdmin(userId)) {
			return errorResponse(res, '不可刪除最高管理員', 403);
		}

		// 軟刪除（設定 is_archived = true）
		const result: QueryResult = await pool.query(
			`UPDATE test_schema.auth 
			 SET is_archived = true, updated_at = NOW()
			 WHERE id = $1 AND is_archived = false
			 RETURNING id`,
			[userId]
		);

		if (result.rows.length === 0) {
			return errorResponse(res, '帳號不存在', 404);
		}

		successResponse(res, { message: '帳號已刪除' });
	} catch (error) {
		console.error('Delete user error:', error);
		errorResponse(res, '刪除帳號失敗', 500);
	}
});

export default router;

