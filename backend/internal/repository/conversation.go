package repository

import (
	"context"

	"aisumly/backend/internal/domain/model"

	"gorm.io/gorm"
)

type ConversationRepository struct {
	db *gorm.DB
}

type AttachmentRow struct {
	ID             uint64
	MessageID      uint64
	FileID         uint64
	AttachmentType string
	SortOrder      uint
	ObjectKey      string
	MimeType       string
	SizeBytes      uint64
}

func NewConversationRepository(db *gorm.DB) *ConversationRepository {
	return &ConversationRepository{db: db}
}

func (r *ConversationRepository) ListActive(ctx context.Context, userID uint64, limit int) ([]model.Conversation, error) {
	var items []model.Conversation
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND status <> 3 AND deleted_at IS NULL", userID).
		Order("last_active_at DESC, id DESC").
		Limit(limit).
		Find(&items).Error
	return items, err
}

func (r *ConversationRepository) Get(ctx context.Context, userID, conversationID uint64) (*model.Conversation, error) {
	var conv model.Conversation
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ? AND deleted_at IS NULL", conversationID, userID).First(&conv).Error; err != nil {
		return nil, err
	}
	return &conv, nil
}

func (r *ConversationRepository) ListMessages(ctx context.Context, userID, conversationID uint64, limit int, beforeSequenceNo uint64) ([]model.Message, error) {
	q := r.db.WithContext(ctx).Where("user_id = ? AND conversation_id = ? AND deleted_at IS NULL", userID, conversationID)
	if beforeSequenceNo > 0 {
		q = q.Where("sequence_no < ?", beforeSequenceNo)
	}
	var messages []model.Message
	if err := q.Order("sequence_no DESC").Limit(limit).Find(&messages).Error; err != nil {
		return nil, err
	}
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

func (r *ConversationRepository) UpdateTitle(ctx context.Context, userID, conversationID uint64, title string) (*model.Conversation, error) {
	var conv model.Conversation
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
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

func (r *ConversationRepository) Delete(ctx context.Context, userID, conversationID uint64) error {
	return r.db.WithContext(ctx).Where("id = ? AND user_id = ? AND deleted_at IS NULL", conversationID, userID).Delete(&model.Conversation{}).Error
}

func (r *ConversationRepository) ListAttachmentRows(ctx context.Context, userID uint64, messageIDs []uint64) ([]AttachmentRow, error) {
	var rows []AttachmentRow
	err := r.db.WithContext(ctx).Table("message_attachments AS a").
		Select("a.id, a.message_id, a.file_id, a.attachment_type, a.sort_order, f.object_key, f.mime_type, f.size_bytes").
		Joins("JOIN files AS f ON f.id = a.file_id").
		Where("a.user_id = ? AND a.message_id IN ?", userID, messageIDs).
		Order("a.message_id ASC, a.sort_order ASC").
		Scan(&rows).Error
	return rows, err
}
