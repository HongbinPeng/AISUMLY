package service

import (
	"context"
	"errors"

	"aisumly/backend/internal/domain/model"
	"aisumly/backend/internal/repository"
)

type MessageService struct {
	repo *repository.MessageRepository
}

type UpdateMessageStateInput struct {
	IsFavorite    *bool
	IsUnderstood  *bool
	IsReviewLater *bool
	UserNote      *string
}

func NewMessageService(repo *repository.MessageRepository) *MessageService {
	return &MessageService{repo: repo}
}

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
	if err := s.repo.UpdateLearningState(ctx, userID, messageID, updates); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, userID, messageID)
}
