# 權限管理系統說明

## 系統架構

### 權限定義來源
**唯一真實來源：** `server/routes/group_routes.ts` 中的 `AVAILABLE_PERMISSIONS`

這是系統中所有可用權限的 **whitelist**。

```typescript
const AVAILABLE_PERMISSIONS = [
    {
        id: 'allowManagePermissions',    // 權限 ID（唯一標識）
        name: '管理權限',                 // 顯示名稱
        description: '可以進入後台...',  // 功能描述
        category: 'admin'                 // 分類
    },
    // ... 其他權限
];
```

### 權限存儲
- **Database:** `test_schema.groups` 表的 `permissions` 欄位 (TEXT[])
- **格式:** PostgreSQL 字串陣列，例如：`['allowManagePermissions', 'allowManageUsers']`

### 權限檢查流程
```
用戶登入
  ↓
/auth/me 返回 permissionList (從 groups.permissions)
  ↓
前端：RouteGuard / Sidebar 檢查 (UX 層)
  ↓
打 API
  ↓
後端：PERMISSION_MIDDLEWARE 查詢 DB 驗證 (安全層)
  ↓
執行 API 邏輯
```

---

## 如何新增權限

### 1. 後端 - 定義權限

**修改檔案：** `server/routes/group_routes.ts`

```typescript
const AVAILABLE_PERMISSIONS = [
    // ... 現有權限
    {
        id: 'allowManageAnalytics',      // 新權限 ID
        name: '管理數據分析',
        description: '可以查看和匯出系統分析數據',
        category: 'admin'
    },
];
```

### 2. 後端 - (可選) 預定義 Middleware

**修改檔案：** `server/middleware/permissions.ts`

```typescript
export const PERMISSION_MIDDLEWARE: Record<string, RequestHandler> = {
    // ... 現有 middleware
    manageAnalytics: requirePermissions(['allowManageAnalytics']),
};
```

### 3. 後端 - 使用 Middleware 保護 API

**範例：**
```typescript
// 單一權限
router.get('/analytics', PERMISSION_MIDDLEWARE.manageAnalytics, async (req, res) => {
    // ...
});

// 或直接使用工廠函數（多權限）
router.post('/report', requirePermissions(['allowManageAnalytics', 'allowManageReports']), async (req, res) => {
    // ...
});
```

### 4. 前端 - 定義權限常數

**修改檔案：** `src/constants/permissions.ts`

```typescript
export const PERMISSIONS = {
    // ... 現有權限
    MANAGE_ANALYTICS: 'allowManageAnalytics',
} as const;
```

### 5. 前端 - 對應頁面權限

**修改檔案：** `src/constants/permissions.ts`

```typescript
export const ADMIN_PAGE_PERMISSIONS = {
    // ... 現有頁面
    analytics: [PERMISSIONS.MANAGE_ANALYTICS],
} as const;
```

### 6. 前端 - Route 加上權限檢查

**修改檔案：** `src/routes/index.tsx`

```tsx
<Route 
    path="analytics" 
    element={
        <RouteGuard
            requireAuth={true}
            permissions={ADMIN_PAGE_PERMISSIONS.analytics}
            fallback={<PermissionDenied />}
        >
            <AnalyticsPage />
        </RouteGuard>
    } 
/>
```

### 7. AdminPage Sidebar 自動更新
**無需修改！** Sidebar 會根據 `ADMIN_PAGE_PERMISSIONS` 自動過濾菜單。

只需在 `createMenuItems` 加入新菜單項目：
```typescript
{
    id: ADMIN_PAGES.analytics,
    icon: <BarChart3 size={20} />,
    labelKey: "navigate.admin.analytics",
    onClick: navigation.goToAdminAnalytics,
}
```

---

## 目前權限列表

### 管理權限 (category: admin)
- `allowManagePermissions` - 管理權限
- `allowManageUsers` - 管理用戶
- `allowManageNotices` - 管理公告
- `allowManageSettings` - 管理系統設定

### 內容權限 (category: content)
- `allowManageProblems` - 管理題目
- `allowManageComments` - 管理留言
- `allowManageReports` - 管理檢舉

---

## API 權限對應表

| API Route | 需要權限 | Middleware |
|-----------|---------|------------|
| `POST /groups` | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` |
| `GET /groups` | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` |
| `PUT /groups/:id` | `allowManagePermissions` | `PERMISSION_MIDDLEWARE.managePermissions` |
| `POST /quest/newQuest` | `allowManageProblems` | `PERMISSION_MIDDLEWARE.manageProblems` |
| `POST /quest/getList` | 登入即可 | 只驗證 token |
| `POST /quest/getQuest` | 登入即可 | 只驗證 token |
| `POST /quest/answerQuest` | 登入即可 | 只驗證 token |

---

## 測試檢查清單

新增權限後，確認以下項目：

### 後端
- [ ] `AVAILABLE_PERMISSIONS` 已加入新權限
- [ ] API 使用正確的 middleware
- [ ] `yarn run compile` 編譯成功
- [ ] Postman/Thunder Client 測試 API 401/403 狀態

### 前端
- [ ] `PERMISSIONS` 常數已定義
- [ ] `ADMIN_PAGE_PERMISSIONS` 已對應
- [ ] Route 加上 `RouteGuard`
- [ ] Sidebar 菜單自動過濾（無權限時隱藏）
- [ ] 無權限直接訪問 URL 顯示 `PermissionDenied`

### 資料庫
- [ ] 測試群組的 `permissions` 欄位包含新權限
- [ ] 測試用戶所屬群組有正確權限
- [ ] `/auth/me` 返回正確的 `permissionList`

---

## 常見問題

### Q: 為什麼要在前後端都定義權限？
**A:** 
- **前端：** UX 優化，隱藏無權限功能，避免用戶點擊後被拒絕
- **後端：** 安全核心，最終驗證，防止繞過前端直接打 API

### Q: 可以給單一用戶特殊權限嗎？
**A:** 目前系統是基於群組的 (Group-based)，用戶繼承群組權限。
如需個人化權限，可擴展 `auth` 表加入 `user_permissions` 欄位。

### Q: 如何撤銷用戶權限？
**A:** 在權限管理頁面取消該群組的對應權限，或將用戶移到其他群組。

### Q: 權限檢查的性能如何？
**A:** 每次 API 請求都會查詢 DB，建議：
1. 確保 `auth.group_id` 和 `groups.id` 有 index
2. 考慮使用 Redis 快取權限（未來優化）

