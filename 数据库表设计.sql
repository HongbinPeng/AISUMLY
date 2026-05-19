-- 学习型截图助手 - 数据库表设计
-- 数据库：MySQL 8.x
-- 字符集：utf8mb4
-- 说明：
-- 1. 会话 conversations 不绑定固定页面 URL；不同网页只要选择同一会话，就共享同一份聊天历史。
-- 2. 页面来源 source_url/source_title 记录在 messages 上，表示“这条消息产生于哪个网页上下文”。
-- 3. 用户消息与 AI 回复统一存储在 messages 表，通过 role 区分 user/assistant/system。
-- 4. 一条消息可以绑定多张图片，图片元数据存 files，消息与图片关系存 message_attachments。
-- 5. 短时记忆由最近 N 轮 messages 动态拼接；长时记忆/会话摘要存 conversation_memories。
-- 6. 每日总结由模型返回 evidence_ids，后端再映射为真实 conversation/message/file 关联。

CREATE DATABASE IF NOT EXISTS aisumly
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE aisumly;

-- ============================================================
-- 1. 用户表
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户 ID',
  email VARCHAR(255) NOT NULL COMMENT '登录邮箱',
  password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希，禁止存明文密码',
  nickname VARCHAR(100) NOT NULL DEFAULT '' COMMENT '用户昵称',
  avatar_url VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '头像 URL，可为空',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '用户状态：1=正常，2=禁用',
  last_login_at DATETIME NULL COMMENT '最后登录时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';

-- ============================================================
-- 2. 会话表
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID',
  title VARCHAR(255) NOT NULL DEFAULT '新会话' COMMENT '会话标题，可由第一条消息或 AI 自动生成',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '会话状态：1=正常，2=归档，3=删除',
  
  message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '该会话下消息数量，冗余字段便于列表展示',
  last_turn_no INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '该会话最后一轮对话编号，用于事务内分配下一轮 turn_no',
  last_sequence_no BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '该会话最后一条消息顺序号，用于事务内分配下一条 sequence_no',
  last_message_preview VARCHAR(500) NOT NULL DEFAULT '' COMMENT '最后一条消息摘要，冗余字段便于列表展示',
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间，用于会话列表排序和按天查询',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  KEY idx_conversations_user_last_active (user_id, last_active_at),
  KEY idx_conversations_user_status_last_active (user_id, status, last_active_at),
  CONSTRAINT fk_conversations_user_id FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会话表；会话是聊天上下文单位，不绑定固定 URL';

-- ============================================================
-- 3. 文件表
-- ============================================================

CREATE TABLE IF NOT EXISTS files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文件 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID',
  storage_provider VARCHAR(50) NOT NULL DEFAULT 'aliyun_oss' COMMENT '存储服务商，例如 aliyun_oss',
  bucket VARCHAR(100) NOT NULL COMMENT 'OSS Bucket 名称',
  object_key VARCHAR(512) NOT NULL COMMENT 'OSS 对象 Key；长度控制在 512 内，便于建立唯一索引',
  public_url VARCHAR(1200) NOT NULL DEFAULT '' COMMENT '图片公开访问 URL；私有 OSS 方案下通常为空，前端通过短期签名 URL 访问',
  original_filename VARCHAR(255) NOT NULL DEFAULT '' COMMENT '原始文件名，粘贴图片可为空',
  mime_type VARCHAR(100) NOT NULL COMMENT '文件 MIME 类型，例如 image/png',
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '文件大小，单位字节',
  sha256 CHAR(64) NOT NULL DEFAULT '' COMMENT '文件 SHA-256 哈希，用于去重、秒传、完整性校验',
  source_type VARCHAR(32) NOT NULL DEFAULT 'paste' COMMENT '来源类型：paste=粘贴，upload=本地上传',
  upload_status TINYINT NOT NULL DEFAULT 1 COMMENT '上传状态：1=待上传，2=已上传，3=上传失败，4=已删除',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_files_object_key (object_key),
  KEY idx_files_user_created (user_id, created_at),
  KEY idx_files_user_sha256_meta (user_id, sha256, size_bytes, mime_type, upload_status),
  CONSTRAINT fk_files_user_id FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文件表；保存 OSS 图片元数据';

-- ============================================================
-- 4. 消息表
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '消息 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID，所有查询必须带 user_id 做数据隔离',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '所属会话 ID',
  turn_no INT UNSIGNED NOT NULL COMMENT '会话内对话轮次编号，从 1 递增；同一轮用户消息和 AI 回复使用相同 turn_no',
  role VARCHAR(32) NOT NULL COMMENT '消息角色，对应 Eino schema.Message.Role：user/assistant/system',
  content LONGTEXT NULL COMMENT '消息文本内容；用户消息可为空但必须至少有文本或附件之一',
  content_format VARCHAR(32) NOT NULL DEFAULT 'markdown' COMMENT '内容格式：plain/markdown/json',
  sequence_no BIGINT UNSIGNED NOT NULL COMMENT '会话内消息顺序号，按它恢复完整时间线',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '消息状态：1=成功，2=流式生成中，3=失败，4=已取消',
  model_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'AI 模型名称，仅 assistant 消息通常有值',
  token_usage JSON NULL COMMENT 'Token 使用量，例如 prompt_tokens/completion_tokens/total_tokens',
  source_url TEXT NULL COMMENT '产生这条消息时用户所在页面 URL；会话不绑定 URL，消息可以来自不同页面',
  source_title VARCHAR(500) NOT NULL DEFAULT '' COMMENT '产生这条消息时用户所在页面标题',
  error_message TEXT NULL COMMENT '失败原因，仅失败消息使用',
  is_favorite TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否收藏：0=否，1=是',
  is_understood TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已理解：0=否，1=是',
  is_review_later TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否待复习：0=否，1=是',
  user_note TEXT NULL COMMENT '用户对这条消息的个人备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_messages_conversation_sequence (conversation_id, sequence_no),
  KEY idx_messages_user_conversation_created (user_id, conversation_id, created_at),
  KEY idx_messages_user_created (user_id, created_at),
  KEY idx_messages_conversation_turn (conversation_id, turn_no, sequence_no),
  KEY idx_messages_user_role_created (user_id, role, created_at),
  CONSTRAINT fk_messages_user_id FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_messages_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息表；统一保存用户消息、AI 回复、必要的系统消息';

-- ============================================================
-- 5. 消息附件表
-- ============================================================

CREATE TABLE IF NOT EXISTS message_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '消息附件 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID',
  message_id BIGINT UNSIGNED NOT NULL COMMENT '所属消息 ID',
  file_id BIGINT UNSIGNED NOT NULL COMMENT '关联文件 ID',
  attachment_type VARCHAR(32) NOT NULL DEFAULT 'image' COMMENT '附件类型：image/file，MVP 主要是 image',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '同一条消息内附件展示顺序',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_message_file (message_id, file_id),
  KEY idx_attachments_user_message (user_id, message_id),
  KEY idx_attachments_file_id (file_id),
  CONSTRAINT fk_attachments_user_id FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_attachments_message_id FOREIGN KEY (message_id) REFERENCES messages (id),
  CONSTRAINT fk_attachments_file_id FOREIGN KEY (file_id) REFERENCES files (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息附件表；一条用户消息可绑定多张图片';

-- ============================================================
-- 6. 会话记忆表
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_memories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记忆 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID',
  conversation_id BIGINT UNSIGNED NULL COMMENT '所属会话 ID；为空表示用户级长期记忆',
  memory_type VARCHAR(32) NOT NULL DEFAULT 'summary' COMMENT '记忆类型：summary=会话摘要，preference=用户偏好，fact=长期事实',
  content TEXT NOT NULL COMMENT '记忆内容，可用于后续构造 Eino schema.Message 的 system 消息',
  source_message_start_id BIGINT UNSIGNED NULL COMMENT '摘要覆盖的起始消息 ID',
  source_message_end_id BIGINT UNSIGNED NULL COMMENT '摘要覆盖的结束消息 ID',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1=有效，2=失效',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_memories_user_conversation (user_id, conversation_id),
  KEY idx_memories_user_type (user_id, memory_type),
  CONSTRAINT fk_memories_user_id FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_memories_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会话记忆表；长对话摘要和长期记忆，不直接混入普通聊天时间线';

-- ============================================================
-- 7. 每日总结表
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_summaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '每日总结 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID',
  summary_date DATE NOT NULL COMMENT '总结日期',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '总结标题',
  overview TEXT NULL COMMENT '当天学习总览',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1=未生成，2=生成中，3=成功，4=失败，5=已过期',
  model_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '生成总结使用的模型名称',
  error_message TEXT NULL COMMENT '生成失败原因',
  user_note TEXT NULL COMMENT '用户补充笔记',
  generated_at DATETIME NULL COMMENT '生成成功时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_summaries_user_date (user_id, summary_date),
  KEY idx_daily_summaries_user_status (user_id, status),
  CONSTRAINT fk_daily_summaries_user_id FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='每日总结主表';

-- ============================================================
-- 8. 每日总结条目表
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_summary_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '每日总结条目 ID',
  summary_id BIGINT UNSIGNED NOT NULL COMMENT '所属每日总结 ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户 ID',
  item_type VARCHAR(32) NOT NULL COMMENT '条目类型：topic/solved/unclear/suggestion/key_point',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '条目标题',
  content TEXT NOT NULL COMMENT '条目内容',
  evidence_ids JSON NULL COMMENT '生成总结时引用的证据 ID 列表，例如 ["ev_001"]',
  related_conversation_ids JSON NULL COMMENT '关联会话 ID 列表 JSON',
  related_message_ids JSON NULL COMMENT '关联消息 ID 列表 JSON',
  related_file_ids JSON NULL COMMENT '关联文件 ID 列表 JSON',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '展示顺序',
  is_pinned TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否固定：0=否，1=是',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_summary_items_summary_order (summary_id, sort_order),
  KEY idx_summary_items_user_type (user_id, item_type),
  CONSTRAINT fk_summary_items_summary_id FOREIGN KEY (summary_id) REFERENCES daily_summaries (id),
  CONSTRAINT fk_summary_items_user_id FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='每日总结条目表；每条总结可反查原始会话、消息和图片';
