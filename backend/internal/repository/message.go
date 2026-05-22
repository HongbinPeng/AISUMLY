package repository

import (
	"context"

	"aisumly/backend/internal/domain/model"

	"gorm.io/gorm"
)

type MessageRepository struct {
	db *gorm.DB
}

func NewMessageRepository(db *gorm.DB) *MessageRepository {
	return &MessageRepository{db: db}
}

func (r *MessageRepository) UpdateLearningState(ctx context.Context, userID, messageID uint64, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).
		Model(&model.Message{}).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", messageID, userID).
		Updates(updates).Error
}

func (r *MessageRepository) Get(ctx context.Context, userID, messageID uint64) (*model.Message, error) {
	var msg model.Message
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", messageID, userID).First(&msg).Error; err != nil {
		return nil, err
	}
	return &msg, nil
}
