package service

import (
	"context"
	"errors"

	"aisumly/backend/internal/domain/model"

	"gorm.io/gorm"
)

type MessageService struct {
	db *gorm.DB
}

type UpdateMessageStateInput struct {
	IsFavorite    *bool
	IsUnderstood  *bool
	IsReviewLater *bool
	UserNote      *string
}

// NewMessageService 创建消息服务，负责消息学习状态和备注更新。
func NewMessageService(db *gorm.DB) *MessageService {
	return &MessageService{db: db}
}

// UpdateState 更新消息的收藏、已理解、待复习和用户备注字段。
func (s *MessageService) UpdateState(ctx context.Context, userID, messageID uint64, input UpdateMessageStateInput) (*model.Message, error) {
	updates := map[string]interface{}{}
	if input.IsFavorite != nil {
		updates["is_favorite"] = *input.IsFavorite
	}
	if input.IsUnderstood != nil {
		updates["is_understood"] = *input.IsUnderstood
	}
	if input.IsReviewLater != nil {
		updates["is_review_later"] = *input.IsReviewLater
	}
	if input.UserNote != nil {
		updates["user_note"] = *input.UserNote
	}
	if len(updates) == 0 {
		return nil, errors.New("没有需要更新的字段")
	}
	if err := s.db.WithContext(ctx).Model(&model.Message{}).Where("id = ? AND user_id = ? AND deleted_at IS NULL", messageID, userID).Updates(updates).Error; err != nil {
		return nil, err
	}
	var msg model.Message
	if err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", messageID, userID).First(&msg).Error; err != nil {
		return nil, err
	}
	return &msg, nil
}
