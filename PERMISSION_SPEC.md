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
| `/groups/:id` | GET | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 取得單一群組 |
| `/groups/:id` | PUT | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 更新群組權限 |
| `/groups/permissions/available` | GET | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` | 取得可用權限列表 |
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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**欄位說明：**
- `permissions`: TEXT[] 陣列，儲存權限 ID 列表，例如：`['allowManageUsers', 'allowManageComments']`

### 用戶表 (auth)

```sql
CREATE TABLE test_schema.auth (
  id UUID PRIMARY KEY,
  -- ... 其他欄位
  group_id UUID REFERENCES test_schema.groups(id) ON DELETE SET NULL
);
```

**權限繼承：**
- 用戶透過 `group_id` 關聯到群組
- 用戶的權限 = 所屬群組的 `permissions` 陣列
- 查詢用戶權限：`SELECT g.permissions FROM test_schema.auth a JOIN test_schema.groups g ON a.group_id = g.id WHERE a.id = $1`

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

**最後更新：** 2025-01-XX  
**維護者：** 開發團隊  
**版本：** 1.0.0

