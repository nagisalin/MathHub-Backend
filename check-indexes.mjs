import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkIndexes() {
    console.log('🔍 檢查資料庫索引和性能...\n');

    try {
        // 1. 檢查 auth 表的索引
        console.log('1️⃣  auth 表的索引:');
        const authIndexes = await pool.query(`
            SELECT 
                indexname, 
                indexdef
            FROM pg_indexes 
            WHERE schemaname = 'test_schema' 
            AND tablename = 'auth'
            ORDER BY indexname;
        `);
        console.table(authIndexes.rows);

        // 2. 檢查 groups 表的索引
        console.log('\n2️⃣  groups 表的索引:');
        const groupsIndexes = await pool.query(`
            SELECT 
                indexname, 
                indexdef
            FROM pg_indexes 
            WHERE schemaname = 'test_schema' 
            AND tablename = 'groups'
            ORDER BY indexname;
        `);
        console.table(groupsIndexes.rows);

        // 3. 檢查 auth 表的外鍵
        console.log('\n3️⃣  auth 表的外鍵:');
        const authForeignKeys = await pool.query(`
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                a.attname AS column_name,
                confrelid::regclass AS foreign_table_name,
                af.attname AS foreign_column_name
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
            JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
            WHERE contype = 'f'
            AND connamespace = 'test_schema'::regnamespace
            AND conrelid = 'test_schema.auth'::regclass;
        `);
        console.table(authForeignKeys.rows);

        // 4. 檢查 auth 表大小
        console.log('\n4️⃣  auth 表統計:');
        const authStats = await pool.query(`
            SELECT 
                COUNT(*) as total_rows,
                pg_size_pretty(pg_total_relation_size('test_schema.auth')) as table_size,
                pg_size_pretty(pg_indexes_size('test_schema.auth')) as indexes_size
            FROM test_schema.auth;
        `);
        console.table(authStats.rows);

        // 5. 測試查詢效能
        console.log('\n5️⃣  測試 /auth/me 查詢效能:');
        const testUserId = await pool.query('SELECT id FROM test_schema.auth LIMIT 1');
        
        if (testUserId.rows.length > 0) {
            const userId = testUserId.rows[0].id;
            const startTime = Date.now();
            
            await pool.query(`
                EXPLAIN ANALYZE
                SELECT 
                    a.id, a.email, a.name, a.birthday, a.grade, a.is_active,
                    a.is_email_validated, a.is_disabled, a.is_archived, a.created_at, a.updated_at,
                    COALESCE(g.permissions, ARRAY[]::TEXT[]) as permission_list
                FROM test_schema.auth a
                LEFT JOIN test_schema.groups g ON a.group_id = g.id
                WHERE a.id = $1
            `, [userId]);
            
            const endTime = Date.now();
            console.log(`查詢耗時: ${endTime - startTime}ms`);
        }

        // 6. 建議
        console.log('\n📋 優化建議:');
        console.log('如果以下索引不存在，請執行建立腳本:');
        console.log('1. auth.id 應該是 PRIMARY KEY');
        console.log('2. auth.group_id 應該有 INDEX 或 FOREIGN KEY');
        console.log('3. groups.id 應該是 PRIMARY KEY');
        console.log('4. 定期執行 VACUUM ANALYZE');

    } catch (error) {
        console.error('檢查失敗:', error);
    } finally {
        await pool.end();
    }
}

checkIndexes();

