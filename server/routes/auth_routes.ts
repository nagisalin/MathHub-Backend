import express, { Router, Request, Response } from 'express';
import { pool } from '../modules/db.js';
import { QueryResult } from 'pg';
import crypto from 'node:crypto';
import { AuthTokenPayload, createRSAToken, TokenName, validateAuthToken } from '../modules/token.js';
import { HttpError, HttpStatusCode } from '../modules/http_status_code.js';

const router: Router = express.Router();

// 密碼格式驗證：至少8位，最長64位，至少一個大寫字母和一個特殊字元
const PASSWORD_FORMAT: RegExp =
	/^(?=.*[A-Z])(?=.*[!"#$%&'()*+,-./:;<=>?@^_`{|}~])[a-zA-Z0-9!"#$%&'()*+,-./:;<=>?@^_`{|}~]{8,64}$/;

// 電子郵件格式驗證
const EMAIL_FORMAT: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 格式化用戶資料回應
 */
function formatUserResponse(user: any) {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		permissionList: user.permission_list || [],
		birthday: user.birthday ? Number(user.birthday) : null,
		grade: user.grade || null,
		isActive: user.is_active,
		isEmailValidated: user.is_email_validated || false,
		isDisabled: user.is_disabled || false,
		isArchived: user.is_archived || false,
		createdAt: user.created_at ? new Date(user.created_at).getTime() : null,
		updatedAt: user.updated_at ? new Date(user.updated_at).getTime() : null,
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
		message,
		status: 'failed',
		data: {},
	});
}

/**
 * 用戶註冊
 * POST /auth/register
 */
router.post(
	'/register',
	async (req: Request<{}, {}, { email: string; username: string; password: string }>, res: Response) => {
		try {
			const { email, username, password } = req.body;

			// 驗證必填欄位
			if (!email || !username || !password) {
				return errorResponse(res, 'invalid params');
			}

			// 驗證電子郵件格式
			if (!EMAIL_FORMAT.test(email)) {
				return errorResponse(res, '電子郵件格式不正確');
			}

			// 驗證密碼格式
			if (!PASSWORD_FORMAT.test(password)) {
				return errorResponse(res, '密碼格式不正確，需要8-64位，至少包含一個大寫字母和一個特殊字元');
			}

			// 檢查電子郵件是否已存在
			const existingUser: QueryResult = await pool.query('SELECT email FROM test_schema.auth WHERE email = $1', [
				email,
			]);
			if (existingUser.rows.length > 0) {
				return errorResponse(res, '此電子郵件已被註冊');
			}

			// 密碼加密
			const salt: string = crypto.randomBytes(16).toString('hex');
			const hashedPassword: Buffer = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512');

		// 新增用戶
		const result: QueryResult = await pool.query(
			`INSERT INTO test_schema.auth (
                email, name, password, salt,
                group_id,
                is_email_validated, is_disabled, is_archived
             ) 
             VALUES ($1, $2, $3, $4, 
                     (SELECT id FROM test_schema.groups WHERE name = '一般成員'),
                     $5, $6, $7) 
             RETURNING id`,
			[email, username, hashedPassword, salt, true, false, false]
		);

		// 取得完整用戶資料（包含 group permissions）
		const userResult: QueryResult = await pool.query(
			`SELECT 
				a.id, a.email, a.name, a.birthday, a.grade, a.is_active,
				a.is_email_validated, a.is_disabled, a.is_archived, 
				a.created_at, a.updated_at,
				COALESCE(g.permissions, ARRAY[]::TEXT[]) as permission_list
			FROM test_schema.auth a
			LEFT JOIN test_schema.groups g ON a.group_id = g.id
			WHERE a.id = $1`,
			[result.rows[0].id]
		);

		const user = userResult.rows[0];

			// 產生 Token
			const expiresIn: number = 3600; // 1 小時
			const payload: AuthTokenPayload = new AuthTokenPayload(
				user.id,
				user.permission_list?.[0] || 'user',
				Math.floor(Date.now() + expiresIn * 1000)
			);
			const accessToken: string = createRSAToken(payload);

			// 設定 Cookie
			res.cookie(TokenName.AUTH, accessToken, {
				httpOnly: true,
				sameSite: 'strict',
				maxAge: expiresIn * 1000,
			});

			successResponse(
				res,
				{
					accessToken,
					idToken: accessToken,
					expiresIn,
					user: formatUserResponse(user),
				},
				201
			);
		} catch (error) {
			console.error('Register error:', error);
			errorResponse(res, '註冊失敗，請稍後再試', 500);
		}
	}
);

/**
 * 用戶登入
 * POST /auth/login
 */
router.post(
	'/login',
	async (
		req: Request<{}, {}, { email: string; password: string; deviceID?: string; rememberMe?: boolean }>,
		res: Response
	) => {
		try {
			const { email, password, rememberMe } = req.body;

			// 驗證必填欄位
			if (!email || !password) {
				return errorResponse(res, 'invalid params');
			}

		// 查詢用戶（JOIN group 取得 permissions）
		const result: QueryResult = await pool.query(
			`SELECT 
				a.id, a.email, a.name, a.password, a.salt, a.birthday, a.grade, a.is_active,
				a.is_email_validated, a.is_disabled, a.is_archived, a.created_at, a.updated_at,
				COALESCE(g.permissions, ARRAY[]::TEXT[]) as permission_list
			FROM test_schema.auth a
			LEFT JOIN test_schema.groups g ON a.group_id = g.id
			WHERE a.email = $1`,
			[email]
		);

			if (result.rows.length === 0) {
				return errorResponse(res, '帳號或密碼錯誤', 401);
			}

			const user = result.rows[0];

			// 檢查帳號是否啟用
			if (!user.is_active) {
				return errorResponse(res, '此帳號已被停用', 403);
			}

			// 驗證密碼
			const hashedInputPassword: Buffer = crypto.pbkdf2Sync(password, user.salt, 100_000, 64, 'sha512');
			const isPasswordValid: boolean = crypto.timingSafeEqual(hashedInputPassword, user.password);

			if (!isPasswordValid) {
				return errorResponse(res, '帳號或密碼錯誤', 401);
			}

			// 產生 Token
			const expiresIn: number = 3600; // 1 小時
			const payload: AuthTokenPayload = new AuthTokenPayload(
				user.id,
				user.permission_list?.[0] || 'user',
				Math.floor(Date.now() + expiresIn * 1000)
			);
			const accessToken: string = createRSAToken(payload);

        // 設定 Cookie
        const cookieMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined; // 30天 或 session
        res.cookie(TokenName.AUTH, accessToken, {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: cookieMaxAge,
        });

			// 更新最後登入時間
			await pool.query('UPDATE test_schema.auth SET updated_at = NOW() WHERE id = $1', [user.id]);

			successResponse(res, {
				accessToken,
				idToken: accessToken,
				expiresIn,
				user: formatUserResponse(user),
			});
		} catch (error) {
			console.error('Login error:', error);
			errorResponse(res, '登入失敗，請稍後再試', 500);
		}
	}
);

/**
 * 驗證 Token
 * POST /auth/verify
 */
router.post('/verify', (req: Request, res: Response) => {
	try {
		const authPayload: AuthTokenPayload = validateAuthToken(req.cookies[TokenName.AUTH]);
		successResponse(res, { valid: true, payload: authPayload });
	} catch (error) {
		console.error('Verify error:', error);
		errorResponse(res, 'Token 無效或已過期', 401);
	}
});

/**
 * 取得當前用戶資訊
 * GET /auth/me
 */
router.get('/me', async (req: Request, res: Response) => {
	try {
		const authPayload: AuthTokenPayload = validateAuthToken(req.cookies[TokenName.AUTH]);

		const result: QueryResult = await pool.query(
			`SELECT 
				a.id, a.email, a.name, a.birthday, a.grade, a.is_active,
				a.is_email_validated, a.is_disabled, a.is_archived, a.created_at, a.updated_at,
				COALESCE(g.permissions, ARRAY[]::TEXT[]) as permission_list
			FROM test_schema.auth a
			LEFT JOIN test_schema.groups g ON a.group_id = g.id
			WHERE a.id = $1`,
			[authPayload.username]
		);

		if (result.rows.length === 0) {
			return errorResponse(res, '用戶不存在', 404);
		}

		const user = result.rows[0];
		successResponse(res, formatUserResponse(user));
	} catch (error) {
		console.error('Get user info error:', error);
		errorResponse(res, '無法取得用戶資訊', 401);
	}
});

/**
 * 用戶登出
 * POST /auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
	res.clearCookie(TokenName.AUTH);
	successResponse(res, { message: '登出成功' });
});

export default router;
