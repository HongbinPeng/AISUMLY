package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"aisumly/backend/internal/domain/model"
	einochat "aisumly/backend/internal/einoapp/chat"

	"github.com/redis/go-redis/v9"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	SummaryStatusGenerating int8 = 2
	SummaryStatusSuccess    int8 = 3
	SummaryStatusFailed     int8 = 4
)

type SummaryService struct {
	db    *gorm.DB
	rdb   *redis.Client
	model einochat.ChatModel
}

type DailySummaryResult struct {
	Summary model.DailySummary       `json:"summary"`
	Items   []model.DailySummaryItem `json:"items"`
}

// NewSummaryService 创建每日总结服务，MVP 阶段先提供同步生成能力。
func NewSummaryService(db *gorm.DB, rdb *redis.Client, chatModel einochat.ChatModel) *SummaryService {
	return &SummaryService{db: db, rdb: rdb, model: chatModel}
}

// GenerateDaily 生成或重新生成某一天的学习总结。
func (s *SummaryService) GenerateDaily(ctx context.Context, userID uint64, dateText string, regenerate bool) (*model.DailySummary, error) {
	date, err := parseDate(dateText)
	if err != nil {
		return nil, err
	}
	lockKey := fmt.Sprintf("summary:lock:%d:%s", userID, dateText)
	ok, err := s.rdb.SetNX(ctx, lockKey, "1", 10*time.Minute).Result()
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("当天总结正在生成中，请稍后再试")
	}
	defer s.rdb.Del(context.Background(), lockKey)

	var summary model.DailySummary
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND summary_date = ?", userID, date).
			First(&summary).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			summary = model.DailySummary{UserID: userID, SummaryDate: date, Title: "今日学习总结", Status: SummaryStatusGenerating}
			if err := tx.Create(&summary).Error; err != nil {
				return err
			}
		}
		if regenerate {
			if err := tx.Where("summary_id = ? AND user_id = ?", summary.ID, userID).Delete(&model.DailySummaryItem{}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&summary).Updates(map[string]interface{}{"status": SummaryStatusGenerating, "error_message": ""}).Error
	})
	if err != nil {
		return nil, err
	}

	if err := s.generateDailySync(ctx, userID, date, &summary); err != nil {
		_ = s.db.WithContext(context.Background()).Model(&model.DailySummary{}).Where("id = ?", summary.ID).
			Updates(map[string]interface{}{"status": SummaryStatusFailed, "error_message": err.Error()}).Error
		return &summary, err
	}
	if err := s.db.WithContext(ctx).Where("id = ?", summary.ID).First(&summary).Error; err != nil {
		return nil, err
	}
	return &summary, nil
}

// GetDaily 查询某一天的学习总结及其条目。
func (s *SummaryService) GetDaily(ctx context.Context, userID uint64, dateText string) (*DailySummaryResult, error) {
	date, err := parseDate(dateText)
	if err != nil {
		return nil, err
	}
	var summary model.DailySummary
	if err := s.db.WithContext(ctx).Where("user_id = ? AND summary_date = ?", userID, date).First(&summary).Error; err != nil {
		return nil, err
	}
	var items []model.DailySummaryItem
	if err := s.db.WithContext(ctx).Where("summary_id = ? AND user_id = ?", summary.ID, userID).Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	return &DailySummaryResult{Summary: summary, Items: items}, nil
}

// generateDailySync 执行 MVP 同步总结逻辑，后续可替换为 Eino Workflow 和异步 Worker。
func (s *SummaryService) generateDailySync(ctx context.Context, userID uint64, date time.Time, summary *model.DailySummary) error {
	start := date
	end := date.Add(24 * time.Hour)
	var messages []model.Message
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL AND role IN ?", userID, start, end, []string{"user", "assistant"}).
		Order("conversation_id ASC, turn_no ASC, sequence_no ASC").
		Find(&messages).Error; err != nil {
		return err
	}
	overview := "今天还没有可总结的学习记录。"
	if len(messages) > 0 {
		overview = fmt.Sprintf("今天共沉淀了 %d 条学习问答消息，建议回看相关会话并整理重点问题。", len(messages))
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(summary).Updates(map[string]interface{}{
		"title":        "今日学习总结",
		"overview":     overview,
		"status":       SummaryStatusSuccess,
		"model_name":   s.model.ModelName(),
		"generated_at": now,
	}).Error; err != nil {
		return err
	}
	if len(messages) == 0 {
		return nil
	}
	conversationIDs := uniqueConversationIDs(messages)
	messageIDs := messageIDs(messages)
	conversationJSON, _ := json.Marshal(conversationIDs)
	messageJSON, _ := json.Marshal(messageIDs)
	evidenceJSON, _ := json.Marshal([]string{"ev_001"})
	item := model.DailySummaryItem{
		SummaryID: summary.ID, UserID: userID, ItemType: "topic", Title: "今日学习记录",
		Content:     fmt.Sprintf("今天产生了 %d 条问答消息，可从关联会话继续复盘。", len(messages)),
		EvidenceIDs: datatypes.JSON(evidenceJSON), RelatedConversationIDs: datatypes.JSON(conversationJSON),
		RelatedMessageIDs: datatypes.JSON(messageJSON), RelatedFileIDs: datatypes.JSON([]byte("[]")), SortOrder: 0,
	}
	return s.db.WithContext(ctx).Create(&item).Error
}

// parseDate 按 YYYY-MM-DD 解析用户传入的总结日期。
func parseDate(text string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", text, time.Local)
}

// uniqueConversationIDs 从消息列表中提取去重后的会话 ID。
func uniqueConversationIDs(messages []model.Message) []uint64 {
	seen := map[uint64]bool{}
	var ids []uint64
	for _, m := range messages {
		if !seen[m.ConversationID] {
			seen[m.ConversationID] = true
			ids = append(ids, m.ConversationID)
		}
	}
	return ids
}

// messageIDs 从消息列表中提取消息 ID。
func messageIDs(messages []model.Message) []uint64 {
	ids := make([]uint64, 0, len(messages))
	for _, m := range messages {
		ids = append(ids, m.ID)
	}
	return ids
}
