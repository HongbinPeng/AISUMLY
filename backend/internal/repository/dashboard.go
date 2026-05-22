package repository

import (
	"context"
	"time"

	"aisumly/backend/internal/domain/model"

	"gorm.io/gorm"
)

type DashboardRepository struct {
	db *gorm.DB
}

type ImageStatRow struct {
	MessageID uint64
	Count     int64
}

type UnresolvedAssistantRow struct {
	ID             uint64
	ConversationID uint64
	TurnNo         uint
	IsReviewLater  bool
	CreatedAt      time.Time
}

func NewDashboardRepository(db *gorm.DB) *DashboardRepository {
	return &DashboardRepository{db: db}
}

func (r *DashboardRepository) CountUserMessages(ctx context.Context, userID uint64, start, end time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Message{}).
		Where("user_id = ? AND role = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, "user", start, end).
		Count(&count).Error
	return count, err
}

func (r *DashboardRepository) CountConversationsCreated(ctx context.Context, userID uint64, start, end time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Conversation{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, start, end).
		Count(&count).Error
	return count, err
}

func (r *DashboardRepository) CountActiveConversations(ctx context.Context, userID uint64, start, end time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Conversation{}).
		Where("user_id = ? AND last_active_at >= ? AND last_active_at < ? AND status <> 3 AND deleted_at IS NULL", userID, start, end).
		Count(&count).Error
	return count, err
}

func (r *DashboardRepository) CountAssistantState(ctx context.Context, userID uint64, field string, value bool, start, end time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.Message{}).
		Where("user_id = ? AND role = ? AND "+field+" = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, "assistant", value, start, end).
		Count(&count).Error
	return count, err
}

func (r *DashboardRepository) ImageStats(ctx context.Context, userID uint64, start, end time.Time) ([]ImageStatRow, error) {
	var rows []ImageStatRow
	err := r.db.WithContext(ctx).Table("message_attachments AS a").
		Select("a.message_id, COUNT(*) AS count").
		Joins("JOIN messages AS m ON m.id = a.message_id").
		Where("a.user_id = ? AND a.attachment_type = ? AND m.created_at >= ? AND m.created_at < ? AND m.deleted_at IS NULL", userID, "image", start, end).
		Group("a.message_id").
		Scan(&rows).Error
	return rows, err
}

func (r *DashboardRepository) RecentConversations(ctx context.Context, userID uint64, start, end time.Time, limit int) ([]model.Conversation, error) {
	var rows []model.Conversation
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND last_active_at >= ? AND last_active_at < ? AND status <> 3 AND deleted_at IS NULL", userID, start, end).
		Order("last_active_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *DashboardRepository) UnresolvedAssistants(ctx context.Context, userID uint64, start, end time.Time, limit int) ([]UnresolvedAssistantRow, error) {
	var rows []UnresolvedAssistantRow
	err := r.db.WithContext(ctx).Model(&model.Message{}).
		Select("id, conversation_id, turn_no, is_review_later, created_at").
		Where("user_id = ? AND role = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL AND (is_understood = ? OR is_review_later = ?)", userID, "assistant", start, end, false, true).
		Order("is_review_later DESC, created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

func (r *DashboardRepository) UserQuestionsByTurns(ctx context.Context, userID uint64, convIDs []uint64, turnNos []uint) ([]model.Message, error) {
	var rows []model.Message
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND role = ? AND conversation_id IN ? AND turn_no IN ? AND deleted_at IS NULL", userID, "user", convIDs, turnNos).
		Find(&rows).Error
	return rows, err
}

func (r *DashboardRepository) ConversationTitles(ctx context.Context, userID uint64, convIDs []uint64) ([]model.Conversation, error) {
	var rows []model.Conversation
	err := r.db.WithContext(ctx).Where("user_id = ? AND id IN ?", userID, convIDs).Find(&rows).Error
	return rows, err
}

func (r *DashboardRepository) RecentMessages(ctx context.Context, userID uint64, start, end time.Time, limit int) ([]model.Message, error) {
	var messages []model.Message
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, start, end).
		Order("created_at DESC").
		Limit(limit).
		Find(&messages).Error
	return messages, err
}
