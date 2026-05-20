package service

import (
	"context"
	"errors"
	"time"

	"aisumly/backend/internal/domain/model"
	storage "aisumly/backend/internal/infra/oss"

	"gorm.io/gorm"
)

type ConversationService struct {
	db      *gorm.DB
	storage storage.Storage
}

// NewConversationService 创建会话服务，负责会话列表、消息历史和会话标题更新。
func NewConversationService(db *gorm.DB, st storage.Storage) *ConversationService {
	return &ConversationService{db: db, storage: st}
}

// List 查询当前用户最近活跃的会话列表。
func (s *ConversationService) List(ctx context.Context, userID uint64, limit int) ([]model.Conversation, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	var items []model.Conversation
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND status <> 3 AND deleted_at IS NULL", userID).
		Order("last_active_at DESC, id DESC").
		Limit(limit).
		Find(&items).Error
	return items, err
}

// Messages 查询某个会话的消息历史，并补齐消息附件的短期预览地址。
func (s *ConversationService) Messages(ctx context.Context, userID, conversationID uint64, limit int, beforeSequenceNo uint64) (*model.Conversation, []model.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var conv model.Conversation
	if err := s.db.WithContext(ctx).Where("id = ? AND user_id = ? AND deleted_at IS NULL", conversationID, userID).First(&conv).Error; err != nil {
		return nil, nil, err
	}
	q := s.db.WithContext(ctx).Where("user_id = ? AND conversation_id = ? AND deleted_at IS NULL", userID, conversationID)
	if beforeSequenceNo > 0 {
		q = q.Where("sequence_no < ?", beforeSequenceNo)
	}
	var messages []model.Message
	if err := q.Order("sequence_no DESC").Limit(limit).Find(&messages).Error; err != nil {
		return nil, nil, err
	}
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	if err := s.attachFiles(ctx, userID, messages); err != nil {
		return nil, nil, err
	}
	return &conv, messages, nil
}

// UpdateTitle 修改当前用户某个会话的标题。
func (s *ConversationService) UpdateTitle(ctx context.Context, userID, conversationID uint64, title string) (*model.Conversation, error) {
	if title == "" {
		return nil, errors.New("会话标题不能为空")
	}
	var conv model.Conversation
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND user_id = ? AND deleted_at IS NULL", conversationID, userID).First(&conv).Error; err != nil {
			return err
		}
		if err := tx.Model(&conv).Update("title", title).Error; err != nil {
			return err
		}
		conv.Title = title
		return nil
	})
	return &conv, err
}

// attachFiles 为消息列表批量查询附件，并生成图片短期预览地址。
func (s *ConversationService) attachFiles(ctx context.Context, userID uint64, messages []model.Message) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]uint64, 0, len(messages))
	idx := make(map[uint64]int, len(messages))
	for i := range messages {
		ids = append(ids, messages[i].ID)
		idx[messages[i].ID] = i
	}
	type row struct {
		ID             uint64
		MessageID      uint64
		FileID         uint64
		AttachmentType string
		SortOrder      uint
		ObjectKey      string
		MimeType       string
		SizeBytes      uint64
	}
	var rows []row
	err := s.db.WithContext(ctx).Table("message_attachments AS a").
		Select("a.id, a.message_id, a.file_id, a.attachment_type, a.sort_order, f.object_key, f.mime_type, f.size_bytes").
		Joins("JOIN files AS f ON f.id = a.file_id").
		Where("a.user_id = ? AND a.message_id IN ?", userID, ids).
		Order("a.message_id ASC, a.sort_order ASC").
		Scan(&rows).Error
	if err != nil {
		return err
	}
	for _, r := range rows {
		i, ok := idx[r.MessageID]
		if !ok {
			continue
		}
		messages[i].Attachments = append(messages[i].Attachments, model.Attachment{
			ID: r.ID, FileID: r.FileID, AttachmentType: r.AttachmentType, SortOrder: r.SortOrder,
			PreviewURL: s.previewURL(ctx, r.ObjectKey), MimeType: r.MimeType, SizeBytes: r.SizeBytes,
		})
	}
	return nil
}

// previewURL 根据 OSS object_key 生成图片短期预览地址。
func (s *ConversationService) previewURL(ctx context.Context, objectKey string) string {
	u, err := s.storage.SignedGetURL(ctx, objectKey, 15*time.Minute)
	if err != nil {
		return ""
	}
	return u.URL
}
func (s *ConversationService) Delete(ctx context.Context, userID, conversationID uint64) error {
	return s.db.WithContext(ctx).Where("id = ? AND user_id = ? AND deleted_at IS NULL", conversationID, userID).Delete(&model.Conversation{}).Error
}
