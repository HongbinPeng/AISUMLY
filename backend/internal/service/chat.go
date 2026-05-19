package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"aisumly/backend/internal/config"
	"aisumly/backend/internal/domain/model"
	einochat "aisumly/backend/internal/einoapp/chat"
	storage "aisumly/backend/internal/infra/oss"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	MessageStatusSuccess   int8 = 1
	MessageStatusStreaming int8 = 2
	MessageStatusFailed    int8 = 3
	ConversationNormal     int8 = 1
)

type ChatService struct {
	db      *gorm.DB
	rdb     *redis.Client
	storage storage.Storage
	model   einochat.ChatModel
	cfg     config.Config
}

type StreamRequest struct {
	UserID               uint64
	ClientRequestID      string
	ConversationID       uint64
	ClientConversationID string
	CreateConversation   bool
	Content              string
	SourceURL            string
	SourceTitle          string
	ContextRecentTurns   int
	FileIDs              []uint64
}

type StreamEvent struct {
	Event string
	Data  interface{}
}

type CreatedMessage struct {
	ConversationID uint64             `json:"conversation_id"`
	MessageID      uint64             `json:"message_id"`
	TurnNo         uint               `json:"turn_no"`
	SequenceNo     uint64             `json:"sequence_no"`
	Attachments    []model.Attachment `json:"attachments,omitempty"`
}

// NewChatService 创建聊天服务，负责消息落库、上下文加载、并发控制和流式 AI 调用。
func NewChatService(db *gorm.DB, rdb *redis.Client, st storage.Storage, chatModel einochat.ChatModel, cfg config.Config) *ChatService {
	return &ChatService{db: db, rdb: rdb, storage: st, model: chatModel, cfg: cfg}
}

/*
Stream 是聊天入口的"快速失败"层：参数校验 + 限流 + 幂等 + 启动后台 goroutine。

为什么拆成 Stream 和 runStream 两个方法：

 1. Stream 负责"快路径"——所有能在 HTTP 请求线程里同步返回的校验和前置检查，
    都在这里做完。不通过校验直接 return error，不占用 goroutine 资源。

 2. runStream 负责"慢路径"——事务落库、Redis 锁、AI 调用、流式推送，这些步骤
    会长时间阻塞，放到后台 goroutine 里跑，避免阻塞 Gin handler 的 HTTP 连接。

 3. 两者通过 events channel 解耦：Stream 创建 channel 并启动 goroutine 后立刻返回，
    handler 拿到 channel 后开始设置 SSE 头并读取事件，此时 AI 还在后台生成内容。

如果合并成一个方法，要么 handler 要等整个事务+AI 调用完成才返回（失去了流式意义），
要么把校验逻辑塞进 goroutine 里（校验失败时 HTTP 连接已建立，不好返回 4xx 错误）。
*/
func (s *ChatService) Stream(ctx context.Context, req StreamRequest) (<-chan StreamEvent, error) {
	// === 校验段：不依赖任何外部资源，失败立即返回 ===
	req.FileIDs = uniqueUint64s(req.FileIDs)
	if strings.TrimSpace(req.Content) == "" && len(req.FileIDs) == 0 {
		return nil, errors.New("请输入文本或上传至少一张图片")
	}
	if req.ClientRequestID == "" {
		return nil, errors.New("缺少请求唯一标识")
	}
	if req.ContextRecentTurns <= 0 {
		req.ContextRecentTurns = 5
	}
	if len(req.FileIDs) > 5 {
		return nil, errors.New("单次最多只能携带 5 张图片")
	}

	// === 限流段：用户级 AI 并发控制 ===
	// 用 Redis 计数器限制同一用户同时发起的 AI 请求数，防止恶意用户耗尽 AI 配额。
	// Expire 和 Incr 非原子操作（有极小概率 Expire 失败导致 key 永不过期），但在并发限流场景下可接受。
	inflightKey := fmt.Sprintf("user:ai:inflight:%d", req.UserID)
	count, err := s.rdb.Incr(ctx, inflightKey).Result()
	if err != nil {
		return nil, err
	}
	_ = s.rdb.Expire(ctx, inflightKey, 5*time.Minute).Err()
	if count > s.cfg.Security.MaxUserInflightAI {
		_ = s.rdb.Decr(ctx, inflightKey).Err()
		return nil, errors.New("当前 AI 请求较多，请稍后再试")
	}

	// === 幂等段：防止网络抖动导致的重复请求 ===
	// 同一个 client_request_id 在 TTL 内只允许处理一次。
	// SetNX 返回 false 说明 key 已存在（正在处理中或已成功），直接拒绝。
	idemKey := fmt.Sprintf("chat:req:%d:%s", req.UserID, req.ClientRequestID)
	ok, err := s.rdb.SetNX(ctx, idemKey, `{"status":"processing"}`, s.cfg.Security.IdempotencyTTL).Result()
	if err != nil {
		// Redis 故障 → 回滚限流计数，不让请求进入
		_ = s.rdb.Decr(ctx, inflightKey).Err()
		return nil, err
	}
	if !ok {
		// 重复请求 → 回滚限流计数 + 返回 409
		_ = s.rdb.Decr(ctx, inflightKey).Err()
		return nil, errors.New("重复请求，请勿重复点击发送")
	}

	// === 启动异步段：校验全部通过，开始后台执行 ===
	// 创建有缓冲 channel（容量 16），让后台 goroutine 能预写事件而不阻塞等待 handler 消费。
	// handler 拿到 channel 后立即返回到 HTTP 层设置 SSE 头，此时 runStream 还在后台跑。
	events := make(chan StreamEvent, 16)
	go func() {
		defer close(events)
		defer s.rdb.Decr(context.Background(), inflightKey)
		s.runStream(ctx, req, idemKey, events)
	}()
	return events, nil
}

// runStream 执行一次完整聊天流程：创建消息、加载上下文、调用模型流、保存回答。
//
// 整体分三段：
//  1. 事务段（MySQL + Redis 锁）——保证会话、消息、附件原子写入，同时拿到会话锁。
//     锁放在事务内是因为需要基于刚创建/查到的 conversation.ID 生成 lockKey。
//  2. 事件推送段——事务提交后才向客户端推送，避免客户端收到"创建成功"但数据实际未落库。
//  3. 流式调用段——加载上下文 → 调 AI 模型 → 逐 chunk 推送 + 最终落库。
func (s *ChatService) runStream(ctx context.Context, req StreamRequest, idemKey string, events chan<- StreamEvent) {
	var lockKey string
	var conversation model.Conversation
	var userMsg model.Message
	var assistantMsg model.Message
	var attachments []model.Attachment

	// === 第一段：事务段 ===
	// 在一个事务内完成：创建/查找会话 → 加 Redis 会话锁 → 校验附件 → 写 user/assistant message → 更新会话统计。
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 没有传入 conversation_id 则自动创建新会话（首次对话场景）。
		if req.ConversationID == 0 {
			conversation = model.Conversation{UserID: req.UserID, Title: "新会话", Status: ConversationNormal, LastActiveAt: time.Now()}
			if err := tx.Create(&conversation).Error; err != nil {
				return err
			}
		} else {
			// 使用 SELECT ... FOR UPDATE 锁定会话行，防止同一会话并发写入导致 turn_no/sequence_no 冲突。
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND user_id = ? AND deleted_at IS NULL", req.ConversationID, req.UserID).
				First(&conversation).Error; err != nil {
				return err
			}
		}
		lockKey = fmt.Sprintf("conversation:streaming:%d", conversation.ID)
		// 给当前会话加 Redis 分布式锁，防止同一会话同时发起多个流式请求。
		ok, err := s.rdb.SetNX(ctx, lockKey, req.ClientRequestID, s.cfg.Security.ConversationLock).Result()
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("当前会话正在生成回答，请稍后再试")
		}

		uploaded, err := s.validateFiles(ctx, tx, req.UserID, req.FileIDs)
		if err != nil {
			return err
		}
		content := strings.TrimSpace(req.Content)
		// 只有图片没有文本时，用默认提示词替代，让 AI 主动分析图片。
		if content == "" && len(uploaded) > 0 {
			content = "请解释这些图片中的内容，并结合上下文回答。"
		}

		nextTurn := conversation.LastTurnNo + 1
		userSeq := conversation.LastSequenceNo + 1
		assistantSeq := conversation.LastSequenceNo + 2
		now := time.Now()

		userMsg = model.Message{
			UserID: req.UserID, ConversationID: conversation.ID, TurnNo: nextTurn, Role: "user",
			Content: content, ContentFormat: "markdown", SequenceNo: userSeq, Status: MessageStatusSuccess,
			SourceURL: req.SourceURL, SourceTitle: req.SourceTitle,
		}
		if err := tx.Create(&userMsg).Error; err != nil {
			return err
		}
		for i, f := range uploaded {
			att := model.MessageAttachment{UserID: req.UserID, MessageID: userMsg.ID, FileID: f.ID, AttachmentType: "image", SortOrder: uint(i)}
			if err := tx.Create(&att).Error; err != nil {
				return err
			}
			attachments = append(attachments, model.Attachment{
				ID: att.ID, FileID: f.ID, AttachmentType: "image", SortOrder: uint(i),
				PreviewURL: s.previewURL(ctx, f.ObjectKey), MimeType: f.MimeType, SizeBytes: f.SizeBytes,
			})
		}
		// 先写一个占位 assistant message（status=streaming），这样即使 AI 调用崩溃，客户端也能通过 SSE error 事件关联到对应的消息 ID。
		assistantMsg = model.Message{
			UserID: req.UserID, ConversationID: conversation.ID, TurnNo: nextTurn, Role: "assistant",
			ContentFormat: "markdown", SequenceNo: assistantSeq, Status: MessageStatusStreaming, ModelName: s.model.ModelName(),
		}
		if err := tx.Create(&assistantMsg).Error; err != nil {
			return err
		}

		// 更新会话统计：message_count +2（user 和 assistant 各一条）。
		preview := content
		if len([]rune(preview)) > 120 {
			preview = string([]rune(preview)[:120])
		}
		updates := map[string]interface{}{
			"message_count":        conversation.MessageCount + 2,
			"last_turn_no":         nextTurn,
			"last_sequence_no":     assistantSeq,
			"last_message_preview": preview,
			"last_active_at":       now,
		}
		return tx.Model(&conversation).Updates(updates).Error
	})
	// 事务失败：释放锁、发 error 事件、更新幂等状态。
	if err != nil {
		if lockKey != "" {
			_ = s.rdb.Del(context.Background(), lockKey).Err()
		}
		events <- StreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
		_ = s.rdb.Set(context.Background(), idemKey, `{"status":"failed"}`, s.cfg.Security.IdempotencyTTL).Err()
		return
	}
	// 正常退出时释放会话锁（defer 保证即使下面 panic 也会执行）。
	defer s.rdb.Del(context.Background(), lockKey)

	// === 第二段：事件推送段 ===
	// 事务已提交，数据已持久化，可以安全地通知客户端。
	if req.ConversationID == 0 {
		events <- StreamEvent{Event: "conversation_created", Data: map[string]interface{}{"conversation_id": conversation.ID, "client_conversation_id": req.ClientConversationID, "title": conversation.Title}}
	}
	events <- StreamEvent{Event: "user_message_created", Data: CreatedMessage{ConversationID: conversation.ID, MessageID: userMsg.ID, TurnNo: userMsg.TurnNo, SequenceNo: userMsg.SequenceNo, Attachments: attachments}}
	events <- StreamEvent{Event: "assistant_message_created", Data: CreatedMessage{ConversationID: conversation.ID, MessageID: assistantMsg.ID, TurnNo: assistantMsg.TurnNo, SequenceNo: assistantMsg.SequenceNo}}

	// === 第三段：流式调用段 ===
	// 把用户消息写入 Redis 最近上下文，供下一轮对话使用。
	s.pushRecent(context.Background(), userMsg, attachments)
	// 从 Redis 或 MySQL 加载历史上下文（纯文本 + 图片 file_ids）。
	ctxMessages := s.loadContext(ctx, req.UserID, conversation.ID, req.ContextRecentTurns)
	reader, err := s.model.Stream(ctx, ctxMessages)
	if err != nil {
		_ = s.db.WithContext(context.Background()).Model(&model.Message{}).Where("id = ?", assistantMsg.ID).
			Updates(map[string]interface{}{"status": MessageStatusFailed, "error_message": err.Error()}).Error
		events <- StreamEvent{Event: "error", Data: map[string]interface{}{"code": 50020, "message": "AI 调用失败", "message_id": assistantMsg.ID}}
		_ = s.rdb.Set(context.Background(), idemKey, `{"status":"failed"}`, s.cfg.Security.IdempotencyTTL).Err()
		return
	}
	defer reader.Close()

	// 逐 chunk 读取模型输出，跳过空 chunk（如 reasoning 阶段的空内容）。
	var answer strings.Builder
	for {
		chunk, err := reader.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			_ = s.db.WithContext(context.Background()).Model(&model.Message{}).Where("id = ?", assistantMsg.ID).
				Updates(map[string]interface{}{"status": MessageStatusFailed, "error_message": err.Error()}).Error
			events <- StreamEvent{Event: "error", Data: map[string]interface{}{"code": 50020, "message": "AI 调用失败", "message_id": assistantMsg.ID}}
			_ = s.rdb.Set(context.Background(), idemKey, `{"status":"failed"}`, s.cfg.Security.IdempotencyTTL).Err()
			return
		}
		text := streamChunkText(chunk)
		if text == "" {
			continue
		}
		answer.WriteString(text)
		events <- StreamEvent{Event: "delta", Data: map[string]string{"content": text}}
	}

	// AI 流式输出完成，更新 assistant message 为成功状态并写入完整内容。
	assistantMsg.Content = answer.String()
	assistantMsg.Status = MessageStatusSuccess
	if err := s.db.WithContext(context.Background()).Model(&model.Message{}).Where("id = ?", assistantMsg.ID).
		Updates(map[string]interface{}{"status": MessageStatusSuccess, "content": assistantMsg.Content}).Error; err != nil {
		events <- StreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error(), "message_id": assistantMsg.ID}}
		_ = s.rdb.Set(context.Background(), idemKey, `{"status":"failed"}`, s.cfg.Security.IdempotencyTTL).Err()
		return
	}
	// 把 AI 回复写入 Redis 最近上下文，保证下一轮对话能获取到。
	s.pushRecent(context.Background(), assistantMsg, nil)
	// 更新幂等状态为 success，记录本次请求涉及的 conversation/user/assistant message ID。
	_ = s.rdb.Set(context.Background(), idemKey, fmt.Sprintf(`{"status":"success","conversation_id":%d,"user_message_id":%d,"assistant_message_id":%d}`, conversation.ID, userMsg.ID, assistantMsg.ID), s.cfg.Security.IdempotencyTTL).Err()
	events <- StreamEvent{Event: "completed", Data: map[string]interface{}{"message_id": assistantMsg.ID, "conversation_id": conversation.ID, "finish_reason": "stop"}}
}

// isSupportedImage 判断 MIME 类型是否属于 MVP 支持的图片格式。
func isSupportedImage(mimeType string) bool {
	switch mimeType {
	case "image/png", "image/jpeg", "image/jpg", "image/webp":
		return true
	default:
		return false
	}
}

// validateFiles 校验 file_ids 都属于当前用户且已上传完成，并按请求顺序返回文件列表。
func (s *ChatService) validateFiles(ctx context.Context, tx *gorm.DB, userID uint64, fileIDs []uint64) ([]model.File, error) {
	if len(fileIDs) == 0 {
		return nil, nil
	}
	var files []model.File
	if err := tx.WithContext(ctx).Where("user_id = ? AND id IN ? AND upload_status = ? AND deleted_at IS NULL", userID, fileIDs, FileStatusUploaded).Find(&files).Error; err != nil {
		return nil, err
	}
	if len(files) != len(fileIDs) {
		return nil, errors.New("部分图片不存在或尚未上传完成")
	}
	fileByID := make(map[uint64]model.File, len(files))
	for _, f := range files {
		fileByID[f.ID] = f
	}
	ordered := make([]model.File, 0, len(fileIDs))
	for _, id := range fileIDs {
		ordered = append(ordered, fileByID[id])
	}
	return ordered, nil
}

// previewURL 为消息附件生成短期图片预览地址，失败时返回空字符串。
func (s *ChatService) previewURL(ctx context.Context, objectKey string) string {
	u, err := s.storage.SignedGetURL(ctx, objectKey, 15*time.Minute)
	if err != nil {
		return ""
	}
	return u.URL
}
