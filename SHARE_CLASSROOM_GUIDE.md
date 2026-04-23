# 课堂分享功能使用指南

## 概述

本指南说明如何实现 OpenMAIC 课堂的分享功能。

## 已完成的集成

分享功能已经完整集成到项目中！

### 📁 文件清单

| 文件路径 | 说明 | 状态 |
|---------|------|------|
| `lib/utils/oss.ts` | 腾讯云 COS 上传工具 | ⚠️ 你的文件 (需配合使用) |
| `lib/storage/providers/cos.ts` | COS 存储提供者 | ✅ 已创建 |
| `lib/storage/index.ts` | 存储提供者管理器 | ✅ 已更新 |
| `lib/utils/server-sync.ts` | 课堂同步工具 | ✅ 已更新 |
| `components/share/ShareClassroomButton.tsx` | 分享按钮组件 | ✅ 已创建 |
| `app/page.tsx` | 主页集成分享按钮 | ✅ 已集成 |
| `data/classrooms/` | 服务端 JSON 存储目录 | ✅ 已创建 |

---

## 🚀 快速开始

### 1. 启动项目

```bash
pnpm dev
```

### 2. 使用分享功能

1. **创建课堂**：在首页创建一个课堂
2. **找到课堂卡片**：在首页的"最近课堂"区域
3. **悬停卡片**：鼠标移到课堂卡片上
4. **点击分享按钮**：点击蓝色的分享图标
5. **获得链接**：分享成功后链接自动复制到剪贴板
6. **分享链接**：把链接发给其他人，他们就能访问了！

---

## 📊 功能说明

### 当前版本（v1.0 - 基础版）

- ✅ 一键分享本地课堂到服务器
- ✅ 生成公开访问链接
- ✅ 自动复制链接到剪贴板
- ✅ 成功后显示"复制链接"和"打开"按钮
- ✅ 课堂数据保存到 `data/classrooms/{id}.json`

### 媒体文件说明

当前版本中，媒体文件（图片、音频）存储在 IndexedDB 中：
- 如果接收者在同一浏览器中访问，媒体可以正常显示
- 如果在其他浏览器/设备访问，媒体可能无法显示

**集成 COS 媒体上传**（可选）：
需要时可以启用 `cos.ts` 和完善 `server-sync.ts` 中的媒体上传逻辑。

---

## 🔗 分享链接格式

```
https://your-domain.com/classroom/{课堂ID}
```

例如：
- 本地开发：`http://localhost:3000/classroom/abc123xyz`
- 生产环境：`https://open.maic.chat/classroom/abc123xyz`

---

## 📂 服务器端存储

### 目录结构

```
项目根目录/
└── data/
    └── classrooms/
        ├── abc123xyz.json
        ├── def456uvw.json
        └── ...
```

### JSON 文件格式

```json
{
  "id": "abc123xyz",
  "stage": {
    "id": "abc123xyz",
    "name": "课堂名称",
    "description": "课堂描述",
    "language": "zh-CN",
    "style": "interactive",
    "createdAt": 1234567890,
    "updatedAt": 1234567890,
    "agentIds": ["agent-1", "agent-2"]
  },
  "scenes": [ ... ],
  "createdAt": "2024-04-10T10:30:00.000Z"
}
```

---

## 🎯 用户操作流程

```
1. 用户创建课堂
   ↓
2. 用户在首页看到课堂卡片
   ↓
3. 用户悬停在卡片上，显示操作按钮
   ↓
4. 用户点击分享按钮（蓝色图标）
   ↓
5. 系统上传课堂到服务器
   ↓
6. 显示成功提示，链接自动复制
   ↓
7. 按钮变为绿色"复制"和蓝色"打开"
   ↓
8. 用户把链接发给其他人
   ↓
9. 其他人通过链接访问课堂
```

---

## 🔧 API 端点

### POST /api/classroom

保存课堂到服务器。

**请求体：**
```json
{
  "stage": { ... },
  "scenes": [ ... ]
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "abc123xyz",
    "url": "https://your-domain.com/classroom/abc123xyz"
  }
}
```

### GET /api/classroom?id={id}

从服务器读取课堂。

---

## 📝 注意事项

### 1. data 目录权限

确保 `data/classrooms` 目录有写权限。

### 2. Docker 部署

如果使用 Docker，需要挂载 volume：

```yaml
volumes:
  - ./data:/app/data
```

### 3. .gitignore

建议在 `.gitignore` 中添加：

```
data/
!data/.gitkeep
```

### 4. 公开访问

分享的课堂是公开的，任何有链接的人都可以访问。不要在课堂中包含敏感信息。

---

## 🔮 后续优化建议

### v1.1 - 媒体文件 COS 上传

- 上传图片、音频到腾讯云 COS
- 替换场景中的媒体引用为 COS URL
- 显示媒体上传进度

### v1.2 - 增强功能

- 访问统计
- 分享密码保护
- 链接有效期
- 一键撤销分享
- 已分享课堂列表

---

## 🐛 故障排除

### 问题：分享按钮不显示

**检查：**
1. 确认鼠标悬停在课堂卡片上
2. 确认有 `group` 类在父元素
3. 浏览器控制台 (F12) 是否有错误

### 问题：分享失败

**检查：**
1. `data/classrooms` 目录是否存在且有写权限
2. 服务器控制台日志
3. 浏览器控制台错误信息

### 问题：分享的课堂无法访问

**检查：**
1. JSON 文件是否在 `data/classrooms/` 目录中
2. 课堂 ID 是否正确
3. 服务器是否正常运行

---

## 📚 技术细节

### 组件结构

```
ShareClassroomButton
├── 状态管理
│   ├── isSharing (是否正在分享)
│   ├── sharedUrl (分享后的链接)
│   └── copied (是否已复制)
├── 处理函数
│   ├── handleShare (执行分享)
│   ├── handleCopyUrl (复制链接)
│   └── handleOpenUrl (打开链接)
└── UI 渲染
    ├── 分享按钮 (蓝色)
    ├── 上传中 (旋转图标)
    └── 成功后 (复制 + 打开按钮)
```

### 数据流程

```
用户点击分享
    ↓
syncClassroomToServer(classroomId)
    ↓
从 IndexedDB 读取 loadStageData()
    ↓
POST /api/classroom
    ↓
persistClassroom() 保存到 data/classrooms/{id}.json
    ↓
返回 { id, url }
    ↓
更新按钮状态，显示复制+打开
    ↓
自动复制链接到剪贴板
```

---

## ✅ 完成！

分享功能已经完全集成并可以使用了！创建一个课堂，悬停在卡片上，点击分享按钮试试看吧！
