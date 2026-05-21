package service

import (
	"context"
	"sort"
	"strings"
	"time"

	"aisumly/backend/internal/domain/model"

	"gorm.io/gorm"
)

type DashboardService struct {
	db *gorm.DB
}

type TodayDashboard struct {
	Date                  string                         `json:"date"`
	QuestionCount         int64                          `json:"question_count"`
	ScreenshotCount       int64                          `json:"screenshot_count"`
	MultiImageQuestionCnt int64                          `json:"multi_image_question_count"`
	ConversationCount     int64                          `json:"conversation_count"`
	ActiveConversationCnt int64                          `json:"active_conversation_count"`
	UnderstoodCount       int64                          `json:"understood_count"`
	UnderstoodRate        float64                        `json:"understood_rate"`
	ReviewLaterCount      int64                          `json:"review_later_count"`
	RecentConversations   []DashboardConversation        `json:"recent_conversations"`
	UnresolvedQuestions   []DashboardUnresolvedQuestion  `json:"unresolved_questions"`
	TopTopics             []DashboardTopic               `json:"top_topics"`
	ReviewAssistant       DashboardReviewAssistantPrompt `json:"review_assistant"`
}

type DashboardConversation struct {
	ID                 uint64 `json:"id"`
	Title              string `json:"title"`
	MessageCount       uint   `json:"message_count"`
	LastMessagePreview string `json:"last_message_preview"`
	LastActiveAt       string `json:"last_active_at"`
	StatusLabel        string `json:"status_label"`
}

type DashboardUnresolvedQuestion struct {
	AssistantMessageID uint64 `json:"assistant_message_id"`
	ConversationID     uint64 `json:"conversation_id"`
	ConversationTitle  string `json:"conversation_title"`
	Question           string `json:"question"`
	IsReviewLater      bool   `json:"is_review_later"`
	CreatedAt          string `json:"created_at"`
}

type DashboardTopic struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type DashboardReviewAssistantPrompt struct {
	Badge       string `json:"badge"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
}

func NewDashboardService(db *gorm.DB) *DashboardService {
	return &DashboardService{db: db}
}

func (s *DashboardService) Today(ctx context.Context, userID uint64) (*TodayDashboard, error) {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.Add(24 * time.Hour)

	out := &TodayDashboard{
		Date: start.Format("2006-01-02"),
		ReviewAssistant: DashboardReviewAssistantPrompt{
			Badge:       "可咨询",
			Title:       "咨询学习复盘小助手",
			Description: "把今天的问题、截图和待复习状态交给复盘助手，让它帮你整理薄弱点、生成复习顺序和下一步建议。",
			Prompt:      "帮我复盘今天的学习记录，整理待复习问题、未理解内容和优先复习顺序。",
		},
	}

	if err := s.db.WithContext(ctx).Model(&model.Message{}).
		Where("user_id = ? AND role = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, "user", start, end).
		Count(&out.QuestionCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Conversation{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, start, end).
		Count(&out.ConversationCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Conversation{}).
		Where("user_id = ? AND last_active_at >= ? AND last_active_at < ? AND status <> 3 AND deleted_at IS NULL", userID, start, end).
		Count(&out.ActiveConversationCnt).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Message{}).
		Where("user_id = ? AND role = ? AND is_understood = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, "assistant", true, start, end).
		Count(&out.UnderstoodCount).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Message{}).
		Where("user_id = ? AND role = ? AND is_review_later = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, "assistant", true, start, end).
		Count(&out.ReviewLaterCount).Error; err != nil {
		return nil, err
	}
	if out.QuestionCount > 0 {
		out.UnderstoodRate = float64(out.UnderstoodCount) / float64(out.QuestionCount)
	}
	if err := s.loadImageStats(ctx, userID, start, end, out); err != nil {
		return nil, err
	}
	if err := s.loadRecentConversations(ctx, userID, start, end, out); err != nil {
		return nil, err
	}
	if err := s.loadUnresolvedQuestions(ctx, userID, start, end, out); err != nil {
		return nil, err
	}
	if err := s.loadTopTopics(ctx, userID, start, end, out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *DashboardService) loadImageStats(ctx context.Context, userID uint64, start, end time.Time, out *TodayDashboard) error {
	type row struct {
		MessageID uint64
		Count     int64
	}
	var rows []row
	if err := s.db.WithContext(ctx).Table("message_attachments AS a").
		Select("a.message_id, COUNT(*) AS count").
		Joins("JOIN messages AS m ON m.id = a.message_id").
		Where("a.user_id = ? AND a.attachment_type = ? AND m.created_at >= ? AND m.created_at < ? AND m.deleted_at IS NULL", userID, "image", start, end).
		Group("a.message_id").
		Scan(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		out.ScreenshotCount += row.Count
		if row.Count > 1 {
			out.MultiImageQuestionCnt++
		}
	}
	return nil
}

func (s *DashboardService) loadRecentConversations(ctx context.Context, userID uint64, start, end time.Time, out *TodayDashboard) error {
	var rows []model.Conversation
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND last_active_at >= ? AND last_active_at < ? AND status <> 3 AND deleted_at IS NULL", userID, start, end).
		Order("last_active_at DESC, id DESC").
		Limit(3).
		Find(&rows).Error; err != nil {
		return err
	}
	out.RecentConversations = make([]DashboardConversation, 0, len(rows))
	for _, row := range rows {
		out.RecentConversations = append(out.RecentConversations, DashboardConversation{
			ID:                 row.ID,
			Title:              row.Title,
			MessageCount:       row.MessageCount,
			LastMessagePreview: row.LastMessagePreview,
			LastActiveAt:       row.LastActiveAt.Format(time.RFC3339),
			StatusLabel:        "继续",
		})
	}
	return nil
}

func (s *DashboardService) loadUnresolvedQuestions(ctx context.Context, userID uint64, start, end time.Time, out *TodayDashboard) error {
	type assistantRow struct {
		ID             uint64
		ConversationID uint64
		TurnNo         uint
		IsReviewLater  bool
		CreatedAt      time.Time
	}
	var assistants []assistantRow
	if err := s.db.WithContext(ctx).Model(&model.Message{}).
		Select("id, conversation_id, turn_no, is_review_later, created_at").
		Where("user_id = ? AND role = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL AND (is_understood = ? OR is_review_later = ?)", userID, "assistant", start, end, false, true).
		Order("is_review_later DESC, created_at DESC").
		Limit(5).
		Scan(&assistants).Error; err != nil {
		return err
	}
	if len(assistants) == 0 {
		return nil
	}
	convIDs := make([]uint64, 0, len(assistants))
	turnNos := make([]uint, 0, len(assistants))
	for _, item := range assistants {
		convIDs = append(convIDs, item.ConversationID)
		turnNos = append(turnNos, item.TurnNo)
	}
	userMessages := s.dashboardUserQuestions(ctx, userID, convIDs, turnNos)
	titles := s.dashboardConversationTitles(ctx, userID, convIDs)
	out.UnresolvedQuestions = make([]DashboardUnresolvedQuestion, 0, len(assistants))
	for _, item := range assistants {
		key := reviewPairKey(item.ConversationID, item.TurnNo)
		out.UnresolvedQuestions = append(out.UnresolvedQuestions, DashboardUnresolvedQuestion{
			AssistantMessageID: item.ID,
			ConversationID:     item.ConversationID,
			ConversationTitle:  titles[item.ConversationID],
			Question:           cutRunes(userMessages[key], 80),
			IsReviewLater:      item.IsReviewLater,
			CreatedAt:          item.CreatedAt.Format(time.RFC3339),
		})
	}
	return nil
}

func (s *DashboardService) dashboardUserQuestions(ctx context.Context, userID uint64, convIDs []uint64, turnNos []uint) map[string]string {
	var rows []model.Message
	_ = s.db.WithContext(ctx).
		Where("user_id = ? AND role = ? AND conversation_id IN ? AND turn_no IN ? AND deleted_at IS NULL", userID, "user", uniqueUint64s(convIDs), uniqueUints(turnNos)).
		Find(&rows).Error
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[reviewPairKey(row.ConversationID, row.TurnNo)] = row.Content
	}
	return out
}

func (s *DashboardService) dashboardConversationTitles(ctx context.Context, userID uint64, convIDs []uint64) map[uint64]string {
	var rows []model.Conversation
	_ = s.db.WithContext(ctx).Where("user_id = ? AND id IN ?", userID, uniqueUint64s(convIDs)).Find(&rows).Error
	out := make(map[uint64]string, len(rows))
	for _, row := range rows {
		out[row.ID] = row.Title
	}
	return out
}

func (s *DashboardService) loadTopTopics(ctx context.Context, userID uint64, start, end time.Time, out *TodayDashboard) error {
	var messages []model.Message
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND deleted_at IS NULL", userID, start, end).
		Order("created_at DESC").
		Limit(100).
		Find(&messages).Error; err != nil {
		return err
	}
	counts := map[string]int{}
	for _, msg := range messages {
		for _, topic := range topicCandidates(msg.SourceTitle) {
			counts[topic]++
		}
	}
	if len(counts) == 0 {
		return nil
	}
	topics := make([]DashboardTopic, 0, len(counts))
	for name, count := range counts {
		topics = append(topics, DashboardTopic{Name: name, Count: count})
	}
	sort.Slice(topics, func(i, j int) bool {
		if topics[i].Count == topics[j].Count {
			return topics[i].Name < topics[j].Name
		}
		return topics[i].Count > topics[j].Count
	})
	if len(topics) > 5 {
		topics = topics[:5]
	}
	out.TopTopics = topics
	return nil
}

func topicCandidates(text string) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	separators := []string{"|", "-", "_", "：", ":", "/", "\\", "·", " "}
	parts := []string{text}
	for _, sep := range separators {
		var next []string
		for _, part := range parts {
			next = append(next, strings.Split(part, sep)...)
		}
		parts = next
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		runes := []rune(part)
		if len(runes) < 2 || len(runes) > 20 {
			continue
		}
		if _, ok := seen[part]; ok {
			continue
		}
		seen[part] = struct{}{}
		out = append(out, part)
	}
	return out
}
