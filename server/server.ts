import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

import questRoutes from './routes/quest_routes.js';
import authRoutes from './routes/auth_routes.js';
import groupRoutes from './routes/group_routes.js';
import userRoutes from './routes/user_routes.js';

dotenv.config();

const app: Express = express();

// CORS 設定：使用 credentials 時必須指定具體的 origin
const allowedOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(',')
	: ['http://localhost:3000', 'http://localhost:5173'];

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true, // 允許攜帶 Cookie
	})
);

app.use(express.json());
app.use(cookieParser());

// 模組化路由函式
app.use('/quest', questRoutes);
app.use('/auth', authRoutes);
app.use('/auth/users', userRoutes); // 帳號管理 API
app.use('/groups', groupRoutes);

app.get('/', (req: Request, res: Response) => {
	res.send('MathHub API is running...');
});

const PORT: string = process.env.PORT || '5000';
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
