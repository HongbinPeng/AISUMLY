package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"aisumly/backend/internal/domain/model"
	einochat "aisumly/backend/internal/einoapp/chat"

	"github.com/cloudwego/eino/schema"
)

type recentContextItem struct {
	MessageID   uint64   `json:"message_id"`
	TurnNo      uint     `json:"turn_no"`
	Role        string   `json:"role"`
	Content     string   `json:"content"`
	FileIDs     []uint64 `json:"file_ids"`
	SourceTitle string   `json:"source_title"`
	CreatedAt   string   `json:"created_at"`
}

type fileContextRef struct {
	ID        uint64
	ObjectKey string
	MimeType  string
}

// recentKey 返回某个用户某个会话的 Redis 最近上下文 Key。
func (s *ChatService) recentKey(userID, conversationID uint64) string {
	return fmt.Sprintf("conversation:recent:%d:%d", userID, conversationID)
}

// pushRecent 把消息写入 Redis 最近上下文滑动窗口。
func (s *ChatService) pushRecent(ctx context.Context, msg model.Message, attachments []model.Attachment) {
	payload := recentContextItem{
		MessageID:   msg.ID,
		TurnNo:      msg.TurnNo,
		Role:        msg.Role,
		Content:     msg.Content,
		FileIDs:     fileIDs(attachments),
		SourceTitle: msg.SourceTitle,
		CreatedAt:   msg.CreatedAt.Format(time.RFC3339),
	}
	b, _ := json.Marshal(payload)
	key := s.recentKey(msg.UserID, msg.ConversationID)
	pipe := s.rdb.Pipeline()
	pipe.RPush(ctx, key, string(b))
	pipe.LTrim(ctx, key, -40, -1)
	pipe.Expire(ctx, key, s.cfg.Security.RecentContextTTL)
	_, _ = pipe.Exec(ctx)
}

// loadContext 优先从 Redis 读取最近上下文，缓存未命中时从 MySQL 回源。
func (s *ChatService) loadContext(ctx context.Context, userID, conversationID uint64, recentTurns int) []*schema.Message {
	systemMessages := einochat.BuildSystemMessages(ctx)
	key := s.recentKey(userID, conversationID)
	values, err := s.rdb.LRange(ctx, key, 0, -1).Result()
	if err == nil && len(values) > 0 {
		return append(systemMessages, s.recentValuesToSchema(ctx, userID, values)...)
	}
	limit := recentTurns * 2
	var messages []model.Message
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND conversation_id = ? AND deleted_at IS NULL", userID, conversationID).
		Order("sequence_no DESC").Limit(limit).Find(&messages).Error; err != nil {
		return systemMessages
	}
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	refsByMessageID := s.loadMessageFileRefs(ctx, userID, messages)
	out := make([]*schema.Message, 0, len(systemMessages)+len(messages))
	out = append(out, systemMessages...)
	for _, m := range messages {
		out = append(out, s.toSchemaMessage(ctx, m.Role, m.Content, refsByMessageID[m.ID]))
	}
	return out
}

// recentValuesToSchema 把 Redis 中的轻量消息 JSON 转换为 Eino schema.Message，并为图片重新签发短期访问 URL。
func (s *ChatService) recentValuesToSchema(ctx context.Context, userID uint64, values []string) []*schema.Message {
	items := make([]recentContextItem, 0, len(values))
	var allFileIDs []uint64
	for _, v := range values {
		var item recentContextItem
		if json.Unmarshal([]byte(v), &item) == nil {
			items = append(items, item)
			allFileIDs = append(allFileIDs, item.FileIDs...)
		}
	}
	fileByID := s.loadFileRefs(ctx, userID, uniqueUint64s(allFileIDs))
	out := make([]*schema.Message, 0, len(items))
	for _, item := range items {
		refs := make([]fileContextRef, 0, len(item.FileIDs))
		for _, id := range item.FileIDs {
			if ref, ok := fileByID[id]; ok {
				refs = append(refs, ref)
			}
		}
		out = append(out, s.toSchemaMessage(ctx, item.Role, item.Content, refs))
	}
	return out
}

// toSchemaMessage 根据数据库 role 字段构造 Eino schema.Message；用户消息会携带图片多模态输入。
func (s *ChatService) toSchemaMessage(ctx context.Context, role, content string, files []fileContextRef) *schema.Message {
	switch role {
	case "assistant":
		return &schema.Message{Role: schema.Assistant, Content: content}
	case "system":
		return &schema.Message{Role: schema.System, Content: content}
	default:
		if len(files) == 0 {
			// 纯文本：只用 Content 字段
			return &schema.Message{Role: schema.User, Content: content}
		}
		// 有图片：必须用 UserInputMultiContent，不再设置 Content（OpenAI API 不允许两者同时存在）
		parts := make([]schema.MessageInputPart, 0, len(files)+1)
		if strings.TrimSpace(content) != "" {
			parts = append(parts, schema.MessageInputPart{Type: schema.ChatMessagePartTypeText, Text: content})
		}
		for _, file := range files {
			signed, err := s.storage.SignedGetURL(ctx, file.ObjectKey, 15*time.Minute)
			if err != nil || signed == nil || signed.URL == "" {
				continue
			}
			u := signed.URL
			parts = append(parts, schema.MessageInputPart{
				Type: schema.ChatMessagePartTypeImageURL,
				Image: &schema.MessageInputImage{
					MessagePartCommon: schema.MessagePartCommon{URL: &u, MIMEType: file.MimeType},
					Detail:            schema.ImageURLDetailAuto,
				},
			})
		}
		return &schema.Message{Role: schema.User, UserInputMultiContent: parts}
	}
}

// loadMessageFileRefs 批量读取消息附件对应的 OSS 对象信息，供历史上下文多模态组装使用。
func (s *ChatService) loadMessageFileRefs(ctx context.Context, userID uint64, messages []model.Message) map[uint64][]fileContextRef {
	messageIDs := make([]uint64, 0, len(messages))
	for _, msg := range messages {
		if msg.Role == "user" {
			messageIDs = append(messageIDs, msg.ID)
		}
	}
	if len(messageIDs) == 0 {
		return nil
	}
	var rows []struct {
		MessageID uint64
		FileID    uint64
		ObjectKey string
		MimeType  string
	}
	if err := s.db.WithContext(ctx).
		Table("message_attachments AS a").
		Select("a.message_id, f.id AS file_id, f.object_key, f.mime_type").
		Joins("JOIN files AS f ON f.id = a.file_id").
		Where("a.user_id = ? AND a.message_id IN ? AND f.upload_status = ? AND f.deleted_at IS NULL", userID, messageIDs, FileStatusUploaded).
		Order("a.message_id ASC, a.sort_order ASC").
		Scan(&rows).Error; err != nil {
		return nil
	}
	out := make(map[uint64][]fileContextRef)
	for _, row := range rows {
		out[row.MessageID] = append(out[row.MessageID], fileContextRef{ID: row.FileID, ObjectKey: row.ObjectKey, MimeType: row.MimeType})
	}
	return out
}

// loadFileRefs 批量读取文件 ID 对应的 OSS 对象信息，供 Redis 最近上下文回放使用。
func (s *ChatService) loadFileRefs(ctx context.Context, userID uint64, fileIDs []uint64) map[uint64]fileContextRef {
	if len(fileIDs) == 0 {
		return nil
	}
	var files []model.File
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND id IN ? AND upload_status = ? AND deleted_at IS NULL", userID, fileIDs, FileStatusUploaded).
		Find(&files).Error; err != nil {
		return nil
	}
	out := make(map[uint64]fileContextRef, len(files))
	for _, file := range files {
		out[file.ID] = fileContextRef{ID: file.ID, ObjectKey: file.ObjectKey, MimeType: file.MimeType}
	}
	return out
}

// fileIDs 提取附件中的文件 ID，写入 Redis 最近上下文时使用。
func fileIDs(attachments []model.Attachment) []uint64 {
	ids := make([]uint64, 0, len(attachments))
	for _, a := range attachments {
		ids = append(ids, a.FileID)
	}
	return ids
}
