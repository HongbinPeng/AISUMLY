package service

import (
	"context"
	"errors"
	"time"

	"aisumly/backend/internal/domain/model"
	storage "aisumly/backend/internal/infra/oss"
	"aisumly/backend/internal/repository"
)

type ConversationService struct {
	repo    *repository.ConversationRepository
	storage storage.Storage
}

func NewConversationService(repo *repository.ConversationRepository, st storage.Storage) *ConversationService {
	return &ConversationService{repo: repo, storage: st}
}

func (s *ConversationService) List(ctx context.Context, userID uint64, limit int) ([]model.Conversation, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	return s.repo.ListActive(ctx, userID, limit)
}

func (s *ConversationService) Messages(ctx context.Context, userID, conversationID uint64, limit int, beforeSequenceNo uint64) (*model.Conversation, []model.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	conv, err := s.repo.Get(ctx, userID, conversationID)
	if err != nil {
		return nil, nil, err
	}
	messages, err := s.repo.ListMessages(ctx, userID, conversationID, limit, beforeSequenceNo)
	if err != nil {
		return nil, nil, err
	}
	if err := s.attachFiles(ctx, userID, messages); err != nil {
		return nil, nil, err
	}
	return conv, messages, nil
}

func (s *ConversationService) UpdateTitle(ctx context.Context, userID, conversationID uint64, title string) (*model.Conversation, error) {
	if title == "" {
		return nil, errors.New("会话标题不能为空")
	}
	return s.repo.UpdateTitle(ctx, userID, conversationID, title)
}

func (s *ConversationService) Delete(ctx context.Context, userID, conversationID uint64) error {
	return s.repo.Delete(ctx, userID, conversationID)
}

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
	rows, err := s.repo.ListAttachmentRows(ctx, userID, ids)
	if err != nil {
		return err
	}
	for _, r := range rows {
		i, ok := idx[r.MessageID]
		if !ok {
			continue
		}
		messages[i].Attachments = append(messages[i].Attachments, model.Attachment{
			ID:             r.ID,
			FileID:         r.FileID,
			AttachmentType: r.AttachmentType,
			SortOrder:      r.SortOrder,
			PreviewURL:     s.previewURL(ctx, r.ObjectKey),
			MimeType:       r.MimeType,
			SizeBytes:      r.SizeBytes,
		})
	}
	return nil
}

func (s *ConversationService) previewURL(ctx context.Context, objectKey string) string {
	u, err := s.storage.SignedGetURL(ctx, objectKey, 15*time.Minute)
	if err != nil {
		return ""
	}
	return u.URL
}
