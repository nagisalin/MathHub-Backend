import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function optimizeDatabase() {
    console.log('🔧 開始優化資料庫...\n');

    try {
        // 1. 確保 auth.id 是 PRIMARY KEY
        console.log('1️⃣  檢查 auth.id PRIMARY KEY...');
        try {
            await pool.query(`
                ALTER TABLE test_schema.auth 
                ADD CONSTRAINT auth_pkey PRIMARY KEY (id);
            `);
            console.log('✅ auth.id PRIMARY KEY 已建立');
        } catch (error) {
            if (error.code === '42P07' || error.message.includes('already exists')) {
                console.log('✓ auth.id PRIMARY KEY 已存在');
            } else {
                console.error('❌ 建立失敗:', error.message);
            }
        }

        // 2. 確保 groups.id 是 PRIMARY KEY
        console.log('\n2️⃣  檢查 groups.id PRIMARY KEY...');
        try {
            await pool.query(`
                ALTER TABLE test_schema.groups 
                ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
            `);
            console.log('✅ groups.id PRIMARY KEY 已建立');
        } catch (error) {
            if (error.code === '42P07' || error.message.includes('already exists')) {
                console.log('✓ groups.id PRIMARY KEY 已存在');
            } else {
                console.error('❌ 建立失敗:', error.message);
            }
        }

        // 3. 為 auth.group_id 建立 INDEX
        console.log('\n3️⃣  檢查 auth.group_id INDEX...');
        try {
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_auth_group_id 
                ON test_schema.auth(group_id);
            `);
            console.log('✅ auth.group_id INDEX 已建立');
        } catch (error) {
            console.error('❌ 建立失敗:', error.message);
        }

        // 4. 建立 FOREIGN KEY (如果 PRIMARY KEY 都存在的話)
        console.log('\n4️⃣  檢查 auth.group_id FOREIGN KEY...');
        try {
            await pool.query(`
                ALTER TABLE test_schema.auth 
                ADD CONSTRAINT fk_auth_group 
                FOREIGN KEY (group_id) 
                REFERENCES test_schema.groups(id) 
                ON DELETE SET NULL;
            `);
            console.log('✅ auth.group_id FOREIGN KEY 已建立');
        } catch (error) {
            if (error.code === '42P07' || error.message.includes('already exists')) {
                console.log('✓ auth.group_id FOREIGN KEY 已存在');
            } else {
                console.error('❌ 建立失敗:', error.message);
            }
        }

        // 5. 為 auth.email 建立 UNIQUE INDEX (加速登入查詢)
        console.log('\n5️⃣  檢查 auth.email UNIQUE INDEX...');
        try {
            await pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_email 
                ON test_schema.auth(email);
            `);
            console.log('✅ auth.email UNIQUE INDEX 已建立');
        } catch (error) {
            console.error('❌ 建立失敗:', error.message);
        }

        // 6. 執行 VACUUM ANALYZE
        console.log('\n6️⃣  執行 VACUUM ANALYZE...');
        try {
            await pool.query('VACUUM ANALYZE test_schema.auth;');
            await pool.query('VACUUM ANALYZE test_schema.groups;');
            console.log('✅ VACUUM ANALYZE 完成');
        } catch (error) {
            console.error('❌ VACUUM 失敗:', error.message);
        }

        console.log('\n✨ 資料庫優化完成！');
        console.log('\n建議重新測試 /auth/me 查詢速度');

    } catch (error) {
        console.error('優化失敗:', error);
    } finally {
        await pool.end();
    }
}

optimizeDatabase();

