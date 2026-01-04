# 權限系統規範 (Permission System Specification)

> **⚠️ 重要：這是權限系統的唯一真實來源 (Single Source of Truth)**
> 
> 前後端所有權限定義、頁面對應、API 規範都必須嚴格遵循此文件。
> 任何修改都必須先更新此文件，再實作程式碼。

---

## 📋 目錄

1. [權限定義](#權限定義)
2. [頁面權限對應](#頁面權限對應)
3. [API 權限規範](#api-權限規範)
4. [資料庫結構](#資料庫結構)
5. [新增權限流程](#新增權限流程)
6. [帳號管理規範](#帳號管理規範)
7. [群組管理規範](#群組管理規範)
8. [最高管理員保護機制](#最高管理員保護機制)

---

## 🔐 權限定義

### 權限列表（按前端頁面菜單順序）

| 順序 | 權限 ID | 權限名稱 | 分類 | 描述 |
|------|---------|---------|------|------|
| 1 | `allowManageUsers` | 管理帳號 | admin | 可以查看、編輯、停用帳號 |
| 2 | `allowManageComments` | 管理留言 | content | 可以查看、編輯、刪除用戶留言 |
| 3 | `allowManageProblems` | 管理題目 | content | 可以新增、編輯、審核題目 |
| 4 | `allowManageProblemStatus` | 修改題目狀態 | content | 可以修改題目的發布狀態 |
| 5 | `allowManageReports` | 管理檢舉 | content | 可以審核、處理用戶檢舉 |
| 6 | `allowManageNotices` | 管理公告 | admin | 可以新增、編輯、刪除系統公告 |
| 7 | `allowManagePermissions` | 管理權限 | admin | 可以進入後台並編輯群組權限設定 |
| 8 | `allowManageSettings` | 管理系統設定 | admin | 可以修改系統全局設定 |

### 權限分類

- **admin**: 管理相關權限（帳號、公告、權限、設定）
- **content**: 內容管理權限（留言、題目、檢舉）

---

## 📄 頁面權限對應

### 後台頁面路由與權限對應表

| 路由 | 頁面名稱 | 需要權限 | 說明 |
|------|---------|---------|------|
| `/admin` | 後台入口 | **任一後台權限** | 有任一權限即可進入，Sidebar 會根據實際權限顯示菜單 |
| `/admin/dashboard` | 儀表板 | 無需權限 | 任何後台用戶都可以看 |
| `/admin/user` | 帳號管理 | `allowManageUsers` | 管理帳號 |
| `/admin/comments` | 留言管理 | `allowManageComments` | 管理留言 |
| `/admin/problemsAdd` | 審題/新增題目 | `allowManageProblems` | 新增、編輯、審核題目 |
| `/admin/problemsStatus` | 修改題目狀態 | `allowManageProblemStatus` | 修改題目狀態 |
| `/admin/reports` | 檢舉審核 | `allowManageReports` | 管理檢舉 |
| `/admin/notice` | 公告編輯 | `allowManageNotices` | 管理公告 |
| `/admin/permission` | 權限管理 | `allowManagePermissions` | 管理群組權限 |
| `/admin/settings` | 系統設定 | `allowManageSettings` | 管理系統設定 |

### 前端實作規範

**檔案：** `src/constants/permissions.ts`

```typescript
export const ADMIN_PAGE_PERMISSIONS = {
  dashboard: [], // 無需權限
  user: [PERMISSIONS.MANAGE_USERS],
  comments: [PERMISSIONS.MANAGE_COMMENTS],
  problemsAdd: [PERMISSIONS.MANAGE_PROBLEMS],
  problemsStatus: [PERMISSIONS.MANAGE_PROBLEM_STATUS],
  reports: [PERMISSIONS.MANAGE_REPORTS],
  notice: [PERMISSIONS.MANAGE_NOTICES],
  permission: [PERMISSIONS.MANAGE_PERMISSIONS],
  settings: [PERMISSIONS.MANAGE_SETTINGS],
} as const;
```

**判斷邏輯：**
- 陣列為空 `[]`：無需權限，任何後台用戶都可訪問
- 陣列有值：用戶需要有**其中一個**權限即可訪問（OR 邏輯）

---

## 🔌 API 權限規範

### 後端 API 權限對應表

| API Route | Method | 需要權限 | Middleware | 說明 |
|-----------|--------|---------|-----------|------|
| `/groups` | GET | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 取得所有群組 |
| `/groups` | POST | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 建立新群組 |
| `/groups/:id` | GET | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 取得單一群組 |
| `/groups/:id` | PUT | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 更新群組（名稱、描述、權限） |
| `/groups/:id` | DELETE | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 刪除群組 |
| `/groups/permissions/available` | GET | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 取得可用權限列表 |
| `/auth/users` | GET | `allowManageUsers` | `PERMISSION_MIDDLEWARE.manageUsers` | 取得帳號列表（分頁） |
| `/auth/users` | POST | `allowManageUsers` | `PERMISSION_MIDDLEWARE.manageUsers` | 建立新帳號 |
| `/auth/users/:id` | GET | `allowManageUsers` | `PERMISSION_MIDDLEWARE.manageUsers` | 取得單一帳號 |
| `/auth/users/:id` | PATCH | `allowManageUsers` | `PERMISSION_MIDDLEWARE.manageUsers` | 更新帳號資訊 |
| `/auth/users/:id/status` | PATCH | `allowManageUsers` | `PERMISSION_MIDDLEWARE.manageUsers` | 停用/啟用帳號 |
| `/auth/users/:id` | DELETE | `allowManageUsers` | `PERMISSION_MIDDLEWARE.manageUsers` | 刪除帳號（Archive） |
| `/quest/newQuest` | POST | `allowManageProblems` | `PERMISSION_MIDDLEWARE.manageProblems` | 新增題目 |
| `/quest/getList` | POST | 登入即可 | 只驗證 token | 取得題目列表（任何登入用戶） |
| `/quest/getQuest` | POST | 登入即可 | 只驗證 token | 取得題目內容（任何登入用戶） |
| `/quest/answerQuest` | POST | 登入即可 | 只驗證 token | 回答題目（任何登入用戶） |

### 後端實作規範

**檔案：** `server/middleware/permissions.ts`

```typescript
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
};
```

**使用方式：**
```typescript
router.get('/api/endpoint', PERMISSION_MIDDLEWARE.manageUsers, handler);
// 或
router.post('/api/endpoint', requirePermissions(['allowManageUsers', 'allowManageSettings']), handler);
```

---

## 🗄️ 資料庫結構

### 群組表 (groups)

```sql
CREATE TABLE test_schema.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_super_admin BOOLEAN DEFAULT false,
  is_default_group BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**欄位說明：**
- `is_super_admin`: 標記是否為最高管理員群組，只有一個群組可以是 `true`（透過唯一索引保證）
- `is_default_group`: 標記是否為預設群組（一般成員），只有一個群組可以是 `true`（透過唯一索引保證），該群組權限永遠為空陣列

**欄位說明：**
- `permissions`: TEXT[] 陣列，儲存權限 ID 列表，例如：`['allowManageUsers', 'allowManageComments']`

### 用戶表 (auth)

```sql
CREATE TABLE test_schema.auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password BYTEA NOT NULL,
  salt TEXT NOT NULL,
  group_id UUID REFERENCES test_schema.groups(id) ON DELETE SET NULL,
  birthday TIMESTAMP,
  grade TEXT,
  is_email_validated BOOLEAN DEFAULT true,
  is_disabled BOOLEAN DEFAULT false,  -- 停用標記（false=啟用, true=停用）
  is_archived BOOLEAN DEFAULT false,   -- 刪除標記（true=已刪除，不顯示）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**欄位說明：**
- `is_disabled`: 停用標記，`false` = 啟用，`true` = 停用（不可登入，但可重新啟用）
- `is_archived`: 刪除標記，`true` = 已刪除（不顯示在列表，不可恢復）
- `group_id`: 關聯到群組，決定用戶權限

**權限繼承：**
- 用戶透過 `group_id` 關聯到群組
- 用戶的權限 = 所屬群組的 `permissions` 陣列
- 查詢用戶權限：`SELECT g.permissions FROM test_schema.auth a JOIN test_schema.groups g ON a.group_id = g.id WHERE a.id = $1`

**狀態邏輯：**
- 正常帳號：`is_disabled = false`, `is_archived = false`
- 停用帳號：`is_disabled = true`, `is_archived = false`（可重新啟用）
- 已刪除帳號：`is_archived = true`（不顯示，不可恢復）

---

## ➕ 新增權限流程

### 步驟 1：更新此 Spec 文件

在此文件的「權限定義」區塊加入新權限：

```markdown
| 順序 | 權限 ID | 權限名稱 | 分類 | 描述 |
| ... | `allowNewPermission` | 新權限名稱 | admin/content | 功能描述 |
```

### 步驟 2：後端實作

**2.1 更新 `server/routes/group_routes.ts`**

在 `AVAILABLE_PERMISSIONS` 陣列中加入（**注意順序要對應前端菜單**）：

```typescript
{
  id: 'allowNewPermission',
  name: '新權限名稱',
  description: '功能描述',
  category: 'admin' // 或 'content'
}
```

**2.2 更新 `server/middleware/permissions.ts`**

在 `PERMISSION_MIDDLEWARE` 中加入：

```typescript
manageNewPermission: requirePermissions(['allowNewPermission']),
```

**2.3 在對應 API 使用 Middleware**

```typescript
router.get('/new-api', PERMISSION_MIDDLEWARE.manageNewPermission, handler);
```

**2.4 編譯後端**

```bash
cd MathHub-Backend
yarn run compile
```

### 步驟 3：前端實作

**3.1 更新 `src/constants/permissions.ts`**

在 `PERMISSIONS` 中加入：

```typescript
MANAGE_NEW_PERMISSION: "allowNewPermission",
```

在 `ADMIN_PAGE_PERMISSIONS` 中對應頁面：

```typescript
newPage: [PERMISSIONS.MANAGE_NEW_PERMISSION],
```

**3.2 更新路由 `src/routes/index.tsx`**

為新頁面加上權限檢查：

```tsx
<Route 
  path="newPage" 
  element={
    <RouteGuard
      requireAuth={true}
      permissions={ADMIN_PAGE_PERMISSIONS.newPage}
      fallback={<PermissionDenied />}
    >
      <NewPage />
    </RouteGuard>
  } 
/>
```

**3.3 更新 Sidebar `src/pages/AdminPage/AdminPage.tsx`**

在 `createMenuItems` 中加入新菜單項目（**注意順序要對應前端菜單**）：

```typescript
{
  id: ADMIN_PAGES.newPage,
  icon: <Icon size={20} />,
  labelKey: "navigate.admin.newPage",
  onClick: navigation.goToAdminNewPage,
}
```

### 步驟 4：測試檢查清單

- [ ] 後端 `AVAILABLE_PERMISSIONS` 已加入新權限
- [ ] 後端 `PERMISSION_MIDDLEWARE` 已加入
- [ ] 後端 API 使用正確的 middleware
- [ ] 後端 `yarn run compile` 編譯成功
- [ ] 前端 `PERMISSIONS` 常數已定義
- [ ] 前端 `ADMIN_PAGE_PERMISSIONS` 已對應
- [ ] 前端 Route 加上 `RouteGuard`
- [ ] 前端 Sidebar 菜單已加入
- [ ] 測試無權限用戶無法訪問
- [ ] 測試有權限用戶可以訪問
- [ ] 權限管理頁面顯示新權限（順序正確）

---

## 📝 命名規範

### 權限 ID 命名

- 格式：`allow` + `動詞` + `名詞`（駝峰式）
- 範例：`allowManageUsers`、`allowManageProblemStatus`
- 統一使用英文，前端常數對應

### 權限名稱（顯示用）

- 使用繁體中文
- 統一用詞：
  - ✅ **帳號**（非「用戶」）
  - ✅ **題目**（非「問題」）
  - ✅ **留言**（非「評論」）

---

## 🔄 權限檢查流程

### 前端檢查（UX 層）

```
用戶訪問 /admin/user
  ↓
RouteGuard 檢查 permissionList
  ↓ (有權限)
渲染頁面
  ↓
Sidebar 根據權限過濾菜單
```

### 後端檢查（安全層）

```
前端打 API (GET /api/users)
  ↓
Middleware 驗證 Cookie (auth_token)
  ↓
查詢 DB 取得用戶權限
  ↓ (有權限)
執行 API 邏輯
  ↓ (無權限)
返回 403 Forbidden
```

**重要：** 前端檢查只是 UX 優化，後端檢查才是安全核心！

---

## ⚠️ 注意事項

1. **權限順序必須對應前端菜單順序**
   - 後端 `AVAILABLE_PERMISSIONS` 的順序 = 前端頁面菜單順序
   - 權限管理頁面會按照此順序顯示

2. **統一用詞**
   - 帳號（非用戶）
   - 題目（非問題）
   - 留言（非評論）

3. **權限 ID 不可重複**
   - 每個權限 ID 必須唯一
   - 修改權限 ID 會影響現有群組設定

4. **資料庫遷移**
   - 新增權限不需要資料庫遷移
   - 刪除權限需要手動清理群組的 `permissions` 陣列

5. **向後相容**
   - 新增權限不會影響現有功能
   - 刪除權限前需確認沒有群組使用該權限

---

## 📚 相關檔案

### 後端
- `server/routes/group_routes.ts` - 權限定義（AVAILABLE_PERMISSIONS）
- `server/middleware/permissions.ts` - 權限檢查 Middleware

### 前端
- `src/constants/permissions.ts` - 權限常數和頁面對應
- `src/routes/index.tsx` - 路由權限檢查
- `src/pages/AdminPage/AdminPage.tsx` - Sidebar 菜單過濾

---

---

## 👤 帳號管理規範

### 最高管理員保護機制

**識別方式：**
- 使用 `groups.is_super_admin` 欄位標記（`BOOLEAN`）
- 只有一個群組可以是 `is_super_admin = true`（透過唯一索引保證）
- 該群組的帳號即為最高管理員
- 不依賴環境變數或文字比對，完全由資料庫欄位管理

**保護規則：**
1. **不顯示在列表**：`GET /auth/users` 自動過濾 `is_super_admin = true` 群組的帳號
2. **不顯示在群組列表**：`GET /groups` 自動過濾 `is_super_admin = true` 的群組
3. **不可編輯**：`PATCH /auth/users/:id` 檢查並拒絕編輯最高管理員
4. **不可停用**：`PATCH /auth/users/:id/status` 檢查並拒絕停用最高管理員
5. **不可刪除**：`DELETE /auth/users/:id` 檢查並拒絕刪除最高管理員
6. **不可刪除群組**：`DELETE /groups/:id` 檢查並拒絕刪除 `is_super_admin = true` 的群組
7. **必須保留權限**：更新最高管理員群組時，必須保留 `allowManagePermissions` 權限
8. **默認所有權限**：最高管理員群組應包含所有權限（後端邏輯層面）

**實作方式：**
```typescript
// 檢查帳號是否為最高管理員
async function isSuperAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT g.is_super_admin 
     FROM test_schema.auth a 
     JOIN test_schema.groups g ON a.group_id = g.id 
     WHERE a.id = $1`,
    [userId]
  );
  return result.rows[0]?.is_super_admin === true;
}

// 檢查群組是否為最高管理員群組
async function isSuperAdminGroup(groupId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT is_super_admin FROM test_schema.groups WHERE id = $1`,
    [groupId]
  );
  return result.rows[0]?.is_super_admin === true;
}
```

### 預設群組（一般成員）保護機制

**識別方式：**
- 使用 `groups.is_default_group` 欄位標記（`BOOLEAN`）
- 只有一個群組可以是 `is_default_group = true`（透過唯一索引保證）
- 該群組為新註冊帳號的預設群組
- 與最高管理員完全相反：無任何權限，永遠為最低層級

**保護規則：**
1. **不顯示在群組列表**：`GET /groups` 自動過濾 `is_default_group = true` 的群組
2. **不可刪除群組**：`DELETE /groups/:id` 檢查並拒絕刪除 `is_default_group = true` 的群組
3. **權限永遠為空**：更新預設群組時，強制 `permissions` 為空陣列，拒絕任何權限設定
4. **預設分配**：新註冊帳號自動分配到此群組（`POST /auth/register`）
5. **手動建立帳號預設**：管理員手動建立帳號時，如果未指定 `group_id`，預設分配到此群組（`POST /auth/users`）

### 帳號狀態管理

**停用（Disable）：**
- 設定 `is_disabled = true`
- 停用後帳號無法登入
- 可以重新啟用（設定 `is_disabled = false`）
- 停用不影響資料顯示

**刪除（Archive）：**
- 設定 `is_archived = true`
- 刪除後帳號不顯示在列表
- **不可恢復**（前端視角為永久刪除）
- 資料保留在資料庫（用於審計）

**重複 Email 註冊處理：**
- 如果已存在 `is_archived = true` 的帳號，註冊時：
  - 選項 A：拒絕註冊，提示「此 Email 已被使用」
  - 選項 B：建立新帳號，舊帳號保持 archived 狀態
- **建議採用選項 A**，避免資料混亂

### 帳號管理 API 規範

#### GET /auth/users - 取得帳號列表

**Query Parameters:**
- `page`: number (分頁，從 1 開始)
- `limit`: number (每頁數量，預設 20)
- `search?`: string (搜尋 email 或 name)
- `group_id?`: string (篩選群組)
- `is_disabled?`: boolean (篩選停用狀態)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "email": "user@example.com",
        "name": "使用者名稱",
        "group_id": "uuid",
        "group_name": "一般成員",
        "birthday": 1234567890,
        "grade": "高中一年級",
        "is_email_validated": true,
        "is_disabled": false,
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

**注意事項：**
- 自動過濾 `is_archived = true` 的帳號
- 自動過濾最高管理員群組的帳號
- 需要 `allowManageUsers` 權限

#### POST /auth/users - 建立新帳號

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "使用者名稱",
  "password": "Password123!",
  "group_id": "uuid",
  "birthday": 1234567890,
  "grade": "高中一年級",
  "is_email_validated": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "使用者名稱",
    "group_id": "uuid",
    "group_name": "一般成員",
    "is_disabled": false,
    "is_archived": false,
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

**注意事項：**
- 需要 `allowManageUsers` 權限
- 自動設定 `is_disabled = false`, `is_archived = false`
- 如果未指定 `group_id`，預設為「一般成員」群組
- 檢查 Email 唯一性（包括 archived 帳號）

#### PATCH /auth/users/:id - 更新帳號

**Request Body:**
```json
{
  "name": "新名稱",
  "email": "new@example.com",
  "group_id": "uuid",
  "birthday": 1234567890,
  "grade": "高中二年級",
  "is_email_validated": true
}
```

**注意事項：**
- 需要 `allowManageUsers` 權限
- 不可更新最高管理員
- 不可更新 `is_archived`（需用刪除 API）
- 不可更新 `password`（需用改密碼 API，未來實作）
- 不可更新 `is_disabled`（需用狀態 API）

#### PATCH /auth/users/:id/status - 停用/啟用帳號

**Request Body:**
```json
{
  "is_disabled": true
}
```

**注意事項：**
- 需要 `allowManageUsers` 權限
- 不可停用最高管理員
- 停用後該帳號無法登入
- 可以重新啟用

#### DELETE /auth/users/:id - 刪除帳號

**Response:**
```json
{
  "success": true,
  "message": "帳號已刪除"
}
```

**注意事項：**
- 需要 `allowManageUsers` 權限
- 不可刪除最高管理員
- 實際是設定 `is_archived = true`（軟刪除）
- 刪除後不顯示在列表
- 不可恢復（前端視角）

---

## 👥 群組管理規範

### 群組 CRUD API

#### POST /groups - 建立新群組

**Request Body:**
```json
{
  "name": "新群組名稱",
  "description": "群組描述（選填）"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "新群組名稱",
    "description": "群組描述",
    "permissions": [],
    "member_count": 0,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
}
```

**注意事項：**
- 需要 `allowManagePermissions` 權限
- 新群組預設 `permissions = []`（無權限）
- 群組名稱必須唯一

#### PUT /groups/:id - 更新群組

**Request Body:**
```json
{
  "name": "新群組名稱（選填）",
  "description": "新描述（選填）",
  "permissions": ["allowManageUsers", "allowManageComments"]
}
```

**注意事項：**
- 需要 `allowManagePermissions` 權限
- 可以更新名稱、描述、權限
- 如果更新的是「最高管理員」群組，必須保留 `allowManagePermissions` 權限

#### DELETE /groups/:id - 刪除群組

**注意事項：**
- 需要 `allowManagePermissions` 權限
- 不可刪除「最高管理員」群組
- 刪除群組後，該群組的用戶 `group_id` 會設為 `NULL`（因為 FOREIGN KEY ON DELETE SET NULL）
- 刪除前應檢查是否有成員（可選，建議前端提示）

---

## 🛡️ 最高管理員保護機制

### 保護規則總結

**帳號管理保護：**
- 最高管理員群組的帳號不顯示在列表
- 最高管理員不可編輯、停用、刪除

**權限管理保護：**
- 「最高管理員」群組必須保留 `allowManagePermissions` 權限
- 不可刪除「最高管理員」群組
- 其他群組可以自由調整權限（自己搞壞是他們的事）

**實作檢查點：**
1. `GET /auth/users` - 過濾最高管理員群組
2. `PATCH /auth/users/:id` - 檢查是否為最高管理員
3. `PATCH /auth/users/:id/status` - 檢查是否為最高管理員
4. `DELETE /auth/users/:id` - 檢查是否為最高管理員
5. `PUT /groups/:id` - 檢查是否為最高管理員群組，強制保留權限
6. `DELETE /groups/:id` - 檢查是否為最高管理員群組

**安全層級：**
- 前端檢查：UX 優化，隱藏按鈕
- 後端檢查：安全核心，必須實作
- 資料庫層：FOREIGN KEY 約束

---

**最後更新：** 2025-01-XX  
**維護者：** 開發團隊  
**版本：** 2.0.0

