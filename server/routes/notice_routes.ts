import express, { Router, Request, Response } from 'express';
import { pool } from '../modules/db.js';
import { QueryResult } from 'pg';
import { validateAuthToken, TokenName } from '../modules/token.js';
import { PERMISSION_MIDDLEWARE } from '../middleware/permissions.js';

const router: Router = express.Router();

// 草稿標記時間（2286-01-01）
const DRAFT_TIMESTAMP = new Date('2286-01-01').getTime();

/**
 * 正規化 scheduleAt
 * -1 = 草稿（轉為 2286-01-01）
 * 0 = 立即發布（轉為 NOW()）
 * > 0 = 排程發布（直接使用）
 */
function normalizeScheduleAt(scheduleAt: number): Date {
	const now = new Date();

	if (scheduleAt === -1) {
		// 草稿：設為很遠的未來
		return new Date('2286-01-01');
	}

	if (scheduleAt === 0 || scheduleAt <= now.getTime()) {
		// 立即發布
		return now;
	}

	// 排程發布
	return new Date(scheduleAt);
}

/**
 * 取得目前最大 pin_order
 */
async function getMaxPinOrder(): Promise<number> {
	const result: QueryResult = await pool.query(
		`SELECT COALESCE(MAX(pin_order), 0) as max_order 
		 FROM test_schema.notices 
		 WHERE pin = true AND pin_order IS NOT NULL`
	);
	return parseInt(result.rows[0]?.max_order || '0', 10);
}

/**
 * 格式化公告回應
 */
function formatNoticeResponse(notice: any) {
	return {
		id: notice.id,
		title: notice.title,
		content: notice.content,
		scheduleAt: notice.schedule_at ? new Date(notice.schedule_at).getTime() : null,
		pin: notice.pin || false,
		pinOrder: notice.pin_order || null,
		category: notice.category || null,
		publisher: notice.publisher || null,
		hashtags: notice.hashtags || [],
		creator: notice.creator,
		createdAt: notice.created_at ? new Date(notice.created_at).getTime() : null,
		updatedAt: notice.updated_at ? new Date(notice.updated_at).getTime() : null,
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
 * GET /admin/noticeBoards - 取得公告列表（分頁）
 */
router.get('/', PERMISSION_MIDDLEWARE.manageNotices, async (req: Request, res: Response) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 20;
		const search = req.query.search as string;
		const status = req.query.status as string; // 'draft' | 'published' | 'scheduled' | undefined
		const pin = req.query.pin as string; // 'true' | 'false' | undefined
		const startDate = req.query.startDate as string; // ISO date string
		const endDate = req.query.endDate as string; // ISO date string

		const offset = (page - 1) * limit;
		const now = new Date();

		// 建立 WHERE 條件
		const conditions: string[] = [];
		const params: any[] = [];
		let paramIndex = 1;

		// 搜尋條件
		if (search) {
			conditions.push(`(title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`);
			params.push(`%${search}%`);
			paramIndex++;
		}

		// 狀態篩選
		if (status) {
			if (status === 'draft') {
				// 草稿：schedule_at = 2286-01-01
				conditions.push(`schedule_at = $${paramIndex}`);
				params.push(new Date('2286-01-01'));
				paramIndex++;
			} else if (status === 'published') {
				// 已發布：schedule_at != 2286-01-01 AND schedule_at <= NOW()
				conditions.push(`schedule_at != $${paramIndex} AND schedule_at <= $${paramIndex + 1}`);
				params.push(new Date('2286-01-01'));
				params.push(now);
				paramIndex += 2;
			} else if (status === 'scheduled') {
				// 未發布（排程）：schedule_at > NOW() AND schedule_at != 2286-01-01（排除草稿）
				conditions.push(`schedule_at > $${paramIndex} AND schedule_at != $${paramIndex + 1}`);
				params.push(now);
				params.push(new Date('2286-01-01'));
				paramIndex += 2;
			}
		}

		// 置頂篩選
		if (pin !== undefined) {
			conditions.push(`pin = $${paramIndex}`);
			params.push(pin === 'true');
			paramIndex++;
		}

		// 時間範圍篩選（基於 created_at）
		if (startDate) {
			conditions.push(`created_at >= $${paramIndex}`);
			params.push(new Date(startDate));
			paramIndex++;
		}
		if (endDate) {
			// 結束日期包含當天，所以加一天並用 <
			const endDateObj = new Date(endDate);
			endDateObj.setDate(endDateObj.getDate() + 1);
			conditions.push(`created_at < $${paramIndex}`);
			params.push(endDateObj);
			paramIndex++;
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		// 查詢總數
		const countResult: QueryResult = await pool.query(
			`SELECT COUNT(*) as total FROM test_schema.notices ${whereClause}`,
			params
		);
		const total = parseInt(countResult.rows[0].total, 10);

		// 查詢列表（按 pin DESC, pin_order ASC, created_at DESC）
		const result: QueryResult = await pool.query(
			`SELECT id, title, content, schedule_at, pin, pin_order, category, publisher, hashtags, creator, created_at, updated_at
			 FROM test_schema.notices
			 ${whereClause}
			 ORDER BY pin DESC, pin_order ASC NULLS LAST, created_at DESC
			 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
			[...params, limit, offset]
		);

		successResponse(res, {
			data: result.rows.map(formatNoticeResponse),
			totalNum: total,
			page,
			limit,
		});
	} catch (error) {
		console.error('Get notices error:', error);
		errorResponse(res, '取得公告列表失敗', 500);
	}
});

/**
 * POST /admin/noticeBoards - 新增公告
 */
router.post(
	'/',
	PERMISSION_MIDDLEWARE.manageNotices,
	async (
		req: Request<
			{},
			{},
			{
				title: string;
				content: string;
				scheduleAt: number;
				pin?: boolean;
				category?: string;
				publisher?: string;
				hashtags?: string[];
			}
		>,
		res: Response
	) => {
		try {
			// 取得當前建立者資訊
			const authPayload = validateAuthToken(req.cookies[TokenName.AUTH]);
			const creatorId = authPayload.username;

			// 查詢建立者資訊
			const creatorResult: QueryResult = await pool.query(
				`SELECT id, name, email FROM test_schema.auth WHERE id = $1`,
				[creatorId]
			);

			if (creatorResult.rows.length === 0) {
				return errorResponse(res, '建立者不存在', 404);
			}

			const creator = {
				id: creatorResult.rows[0].id,
				name: creatorResult.rows[0].name,
				email: creatorResult.rows[0].email,
			};

			const { title, content, scheduleAt, pin = false, category, publisher, hashtags = [] } = req.body;

			// 驗證必填欄位
			if (!title || !content || scheduleAt === undefined) {
				return errorResponse(res, '缺少必填欄位：title, content, scheduleAt');
			}

			// 正規化 scheduleAt
			const normalizedScheduleAt = normalizeScheduleAt(scheduleAt);

			// 處理 pin 和 pinOrder
			let pinOrder: number | null = null;
			if (pin) {
				const maxPinOrder = await getMaxPinOrder();
				pinOrder = maxPinOrder + 1;
			}

			// 處理 hashtags（確保是陣列）
			const hashtagsArray = Array.isArray(hashtags) ? hashtags : [];

			// 建立公告
			const result: QueryResult = await pool.query(
				`INSERT INTO test_schema.notices (
					title, content, schedule_at, pin, pin_order, category, publisher, hashtags, creator
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				RETURNING id, title, content, schedule_at, pin, pin_order, category, publisher, hashtags, creator, created_at, updated_at`,
				[title, content, normalizedScheduleAt, pin, pinOrder, category || null, publisher || null, JSON.stringify(hashtagsArray), JSON.stringify(creator)]
			);

			successResponse(res, formatNoticeResponse(result.rows[0]), 201);
		} catch (error) {
			console.error('Create notice error:', error);
			errorResponse(res, '建立公告失敗', 500);
		}
	}
);

/**
 * PATCH /admin/noticeBoards/:id - 更新公告
 */
router.patch(
	'/:id',
	PERMISSION_MIDDLEWARE.manageNotices,
	async (
		req: Request<
			{ id: string },
			{},
			{
				title?: string;
				content?: string;
				scheduleAt?: number;
				pin?: boolean;
				pinOrder?: number;
				category?: string;
				publisher?: string;
				hashtags?: string[];
			}
		>,
		res: Response
	) => {
		try {
			const noticeId = req.params.id;
			const { title, content, scheduleAt, pin, pinOrder, category, publisher, hashtags } = req.body;

			// 檢查公告是否存在
			const existingResult: QueryResult = await pool.query(
				`SELECT pin, pin_order FROM test_schema.notices WHERE id = $1`,
				[noticeId]
			);

			if (existingResult.rows.length === 0) {
				return errorResponse(res, '公告不存在', 404);
			}

			const existingNotice = existingResult.rows[0];
			const updates: string[] = [];
			const params: any[] = [];
			let paramIndex = 1;

			// 更新欄位
			if (title !== undefined) {
				updates.push(`title = $${paramIndex}`);
				params.push(title);
				paramIndex++;
			}

			if (content !== undefined) {
				updates.push(`content = $${paramIndex}`);
				params.push(content);
				paramIndex++;
			}

			if (scheduleAt !== undefined) {
				const normalizedScheduleAt = normalizeScheduleAt(scheduleAt);
				updates.push(`schedule_at = $${paramIndex}`);
				params.push(normalizedScheduleAt);
				paramIndex++;
			}

			// 處理 pin 和 pinOrder
			if (pin !== undefined) {
				updates.push(`pin = $${paramIndex}`);
				params.push(pin);
				paramIndex++;

				if (pin) {
					// 如果設定為置頂
					if (pinOrder !== undefined) {
						// 如果指定了 pinOrder，使用指定的值
						updates.push(`pin_order = $${paramIndex}`);
						params.push(pinOrder);
						paramIndex++;
					} else if (!existingNotice.pin) {
						// 如果原本不是置頂，分配新的 pinOrder
						const maxPinOrder = await getMaxPinOrder();
						updates.push(`pin_order = $${paramIndex}`);
						params.push(maxPinOrder + 1);
						paramIndex++;
					}
					// 如果原本就是置頂且沒有指定 pinOrder，保持原來的 pinOrder
				} else {
					// 如果取消置頂，清除 pinOrder 並補號
					const oldPinOrder = existingNotice.pin_order;
					if (oldPinOrder !== null) {
						// 將所有 pin_order > oldPinOrder 的公告減 1
						await pool.query(
							`UPDATE test_schema.notices 
							 SET pin_order = pin_order - 1 
							 WHERE pin = true AND pin_order > $1 AND id != $2`,
							[oldPinOrder, noticeId]
						);
					}
					updates.push(`pin_order = NULL`);
				}
			} else if (pinOrder !== undefined && existingNotice.pin) {
				// 如果只更新 pinOrder（且原本是置頂）
				updates.push(`pin_order = $${paramIndex}`);
				params.push(pinOrder);
				paramIndex++;
			}

			// 更新 category
			if (category !== undefined) {
				updates.push(`category = $${paramIndex}`);
				params.push(category || null);
				paramIndex++;
			}

			// 更新 publisher
			if (publisher !== undefined) {
				updates.push(`publisher = $${paramIndex}`);
				params.push(publisher || null);
				paramIndex++;
			}

			// 更新 hashtags
			if (hashtags !== undefined) {
				const hashtagsArray = Array.isArray(hashtags) ? hashtags : [];
				updates.push(`hashtags = $${paramIndex}`);
				params.push(JSON.stringify(hashtagsArray));
				paramIndex++;
			}

			if (updates.length === 0) {
				return errorResponse(res, '沒有要更新的欄位');
			}

			updates.push(`updated_at = NOW()`);
			params.push(noticeId);

			// 更新公告
			const result: QueryResult = await pool.query(
				`UPDATE test_schema.notices 
				 SET ${updates.join(', ')}
				 WHERE id = $${paramIndex}
				 RETURNING id, title, content, schedule_at, pin, pin_order, category, publisher, hashtags, creator, created_at, updated_at`,
				params
			);

			successResponse(res, formatNoticeResponse(result.rows[0]));
		} catch (error) {
			console.error('Update notice error:', error);
			errorResponse(res, '更新公告失敗', 500);
		}
	}
);

/**
 * DELETE /admin/noticeBoards/:id - 刪除公告
 */
router.delete('/:id', PERMISSION_MIDDLEWARE.manageNotices, async (req: Request, res: Response) => {
	try {
		const noticeId = req.params.id;

		// 先取得要刪除的公告資訊（用於處理 pinOrder）
		const noticeResult: QueryResult = await pool.query(
			`SELECT pin, pin_order FROM test_schema.notices WHERE id = $1`,
			[noticeId]
		);

		if (noticeResult.rows.length === 0) {
			return errorResponse(res, '公告不存在', 404);
		}

		const notice = noticeResult.rows[0];

		// 刪除公告
		await pool.query(`DELETE FROM test_schema.notices WHERE id = $1`, [noticeId]);

		// 如果是置頂公告，補號
		if (notice.pin && notice.pin_order !== null) {
			await pool.query(
				`UPDATE test_schema.notices 
				 SET pin_order = pin_order - 1 
				 WHERE pin = true AND pin_order > $1`,
				[notice.pin_order]
			);
		}

		successResponse(res, { message: '公告已刪除' });
	} catch (error) {
		console.error('Delete notice error:', error);
		errorResponse(res, '刪除公告失敗', 500);
	}
});

/**
 * GET /notices/public - 前台公開 API：取得已發布的公告列表（不需要權限）
 */
router.get('/public', async (req: Request, res: Response) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 20;
		const search = req.query.search as string;
		const category = req.query.category as string;
		const hashtag = req.query.hashtag as string;

		const offset = (page - 1) * limit;
		const now = new Date();

		// 建立 WHERE 條件（只顯示已發布的公告）
		const conditions: string[] = [
			`schedule_at != $1`, // 不是草稿
			`schedule_at <= $2`, // 已發布（schedule_at <= NOW()）
		];
		const params: any[] = [new Date('2286-01-01'), now];
		let paramIndex = 3;

		// 搜尋條件（標題、內容、hashtag）
		if (search) {
			conditions.push(`(
				title ILIKE $${paramIndex} 
				OR content ILIKE $${paramIndex}
				OR EXISTS (
					SELECT 1 FROM jsonb_array_elements_text(hashtags) AS tag
					WHERE tag ILIKE $${paramIndex}
				)
			)`);
			params.push(`%${search}%`);
			paramIndex++;
		}

		// 分類篩選
		if (category) {
			conditions.push(`category = $${paramIndex}`);
			params.push(category);
			paramIndex++;
		}

		// Hashtag 篩選
		if (hashtag) {
			conditions.push(`EXISTS (
				SELECT 1 FROM jsonb_array_elements_text(hashtags) AS tag
				WHERE tag = $${paramIndex}
			)`);
			params.push(hashtag);
			paramIndex++;
		}

		const whereClause = `WHERE ${conditions.join(' AND ')}`;

		// 查詢總數
		const countResult: QueryResult = await pool.query(
			`SELECT COUNT(*) as total FROM test_schema.notices ${whereClause}`,
			params
		);
		const total = parseInt(countResult.rows[0].total, 10);

		// 查詢列表（按 pin DESC, pin_order ASC, created_at DESC）
		const result: QueryResult = await pool.query(
			`SELECT id, title, content, schedule_at, pin, pin_order, category, publisher, hashtags, created_at, updated_at
			 FROM test_schema.notices
			 ${whereClause}
			 ORDER BY pin DESC, pin_order ASC NULLS LAST, created_at DESC
			 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
			[...params, limit, offset]
		);

		// 格式化回應（不包含 creator 資訊）
		const formattedData = result.rows.map((notice: any) => ({
			id: notice.id,
			title: notice.title,
			content: notice.content,
			scheduleAt: notice.schedule_at ? new Date(notice.schedule_at).getTime() : null,
			pin: notice.pin || false,
			pinOrder: notice.pin_order || null,
			category: notice.category || null,
			publisher: notice.publisher || null,
			hashtags: notice.hashtags || [],
			createdAt: notice.created_at ? new Date(notice.created_at).getTime() : null,
			updatedAt: notice.updated_at ? new Date(notice.updated_at).getTime() : null,
		}));

		successResponse(res, {
			data: formattedData,
			totalNum: total,
			page,
			limit,
		});
	} catch (error) {
		console.error('Get public notices error:', error);
		errorResponse(res, '取得公告列表失敗', 500);
	}
});

/**
 * GET /notices/public/latest - 前台公開 API：取得最新公告（首頁用）
 */
router.get('/public/latest', async (req: Request, res: Response) => {
	try {
		const limit = parseInt(req.query.limit as string) || 3;
		const now = new Date();

		// 只顯示已發布的公告
		const result: QueryResult = await pool.query(
			`SELECT id, title, content, schedule_at, pin, pin_order, category, publisher, hashtags, created_at, updated_at
			 FROM test_schema.notices
			 WHERE schedule_at != $1 AND schedule_at <= $2
			 ORDER BY pin DESC, pin_order ASC NULLS LAST, created_at DESC
			 LIMIT $3`,
			[new Date('2286-01-01'), now, limit]
		);

		// 格式化回應（不包含 creator 資訊，content 截取前 100 字）
		const formattedData = result.rows.map((notice: any) => ({
			id: notice.id,
			title: notice.title,
			content: notice.content.length > 100 
				? notice.content.substring(0, 100) + '...' 
				: notice.content,
			scheduleAt: notice.schedule_at ? new Date(notice.schedule_at).getTime() : null,
			pin: notice.pin || false,
			pinOrder: notice.pin_order || null,
			category: notice.category || null,
			publisher: notice.publisher || null,
			hashtags: notice.hashtags || [],
			createdAt: notice.created_at ? new Date(notice.created_at).getTime() : null,
			updatedAt: notice.updated_at ? new Date(notice.updated_at).getTime() : null,
		}));

		successResponse(res, formattedData);
	} catch (error) {
		console.error('Get latest notices error:', error);
		errorResponse(res, '取得最新公告失敗', 500);
	}
});

export default router;
