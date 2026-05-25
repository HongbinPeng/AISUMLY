package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"aisumly/backend/internal/domain/model"
	einochat "aisumly/backend/internal/einoapp/chat"
	einoreview "aisumly/backend/internal/einoapp/review"
	storage "aisumly/backend/internal/infra/oss"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/schema"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	reviewMessageStatusSuccess   int8 = 1
	reviewMessageStatusStreaming int8 = 2
	reviewMessageStatusFailed    int8 = 3
	reviewContextLimit                = 60
	reviewContextTTL                  = 7 * 24 * time.Hour
	reviewStreamLockTTL               = 5 * time.Minute
	reviewDefaultLimit                = 30
	reviewMaxLimit                    = 50
)

type ReviewAgentService struct {
	db      *gorm.DB
	rdb     *redis.Client
	storage storage.Storage
	model   einochat.ChatModel
}

type ReviewAgentRequest struct {
	UserID  uint64
	Message string
}

type ReviewStreamEvent struct {
	Event string
	Data  interface{}
}

type reviewContextItem struct {
	MessageID   uint64 `json:"message_id"`
	TurnNo      uint   `json:"turn_no"`
	Role        string `json:"role"`
	MessageType string `json:"message_type"`
	Content     string `json:"content"`
	CreatedAt   string `json:"created_at"`
}

type ReviewAgentMessageItem struct {
	ID            uint64 `json:"id"`
	TurnNo        uint   `json:"turn_no"`
	Role          string `json:"role"`
	MessageType   string `json:"message_type"`
	Content       string `json:"content"`
	ContentFormat string `json:"content_format"`
	CreatedAt     string `json:"created_at"`
}

type reviewIntent struct {
	NeedQueryMessages bool              `json:"need_query_messages"`
	NeedClarification bool              `json:"need_clarification"`
	Clarification     string            `json:"clarification_question"`
	Query             *reviewMessageDSL `json:"query"`
}

type reviewMessageDSL struct {
	StartTime string             `json:"start_time"`
	EndTime   string             `json:"end_time"`
	Filters   reviewQueryFilters `json:"filters"`
	Limit     int                `json:"limit"`
}

type reviewQueryFilters struct {
	IsFavorite    *bool `json:"is_favorite"`
	IsUnderstood  *bool `json:"is_understood"`
	IsReviewLater *bool `json:"is_review_later"`
}

type ReviewMessageCard struct {
	AssistantMessageID  uint64  `json:"assistant_message_id"`
	UserMessageID       uint64  `json:"user_message_id"`
	ConversationID      uint64  `json:"conversation_id"`
	ConversationTitle   string  `json:"conversation_title"`
	TurnNo              uint    `json:"turn_no"`
	Question            string  `json:"question"`
	AnswerPreview       string  `json:"answer_preview"`
	AnswerForLLM        string  `json:"-"`
	FirstFileID         *uint64 `json:"first_file_id"`
	FirstFilePreviewURL string  `json:"first_file_preview_url"`
	HasFile             bool    `json:"has_file"`
	SourceTitle         string  `json:"source_title"`
	CreatedAt           string  `json:"created_at"`
	IsFavorite          bool    `json:"is_favorite"`
	IsUnderstood        bool    `json:"is_understood"`
	IsReviewLater       bool    `json:"is_review_later"`
}

type reviewCardEvent struct {
	DisplayType string              `json:"display_type"`
	Total       int                 `json:"total"`
	Items       []ReviewMessageCard `json:"items"`
}

// NewReviewAgentService 创建学习复盘助手服务。
func NewReviewAgentService(db *gorm.DB, rdb *redis.Client, st storage.Storage, chatModel einochat.ChatModel) *ReviewAgentService {
	return &ReviewAgentService{db: db, rdb: rdb, storage: st, model: chatModel}
}

// Stream 执行一次学习复盘助手对话，并以事件流返回澄清、查询卡片和模型回答。
func (s *ReviewAgentService) Stream(ctx context.Context, req ReviewAgentRequest) (<-chan ReviewStreamEvent, error) {
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		return nil, errors.New("请输入复盘问题")
	}
	lockKey := s.reviewStreamLockKey(req.UserID)
	ok, err := s.rdb.SetNX(ctx, lockKey, "1", reviewStreamLockTTL).Result()
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("学习复盘助手正在生成回答，请稍后再试")
	}
	events := make(chan ReviewStreamEvent, 16)
	go func() {
		defer close(events)
		defer s.rdb.Del(context.Background(), lockKey)
		s.run(ctx, req, events)
	}()
	return events, nil
}

// Messages 读取学习复盘助手最近 N 轮可展示消息。优先使用 Redis 最近上下文x，未命中再回表。
func (s *ReviewAgentService) Messages(ctx context.Context, userID uint64, turns int) ([]ReviewAgentMessageItem, error) {
	if turns <= 0 {
		turns = 20
	}
	if turns > 50 {
		turns = 50
	}

	if items := s.reviewMessagesFromRedis(ctx, userID, turns); len(items) > 0 {
		return items, nil
	}
	return s.reviewMessagesFromDB(ctx, userID, turns)
}

func (s *ReviewAgentService) reviewMessagesFromRedis(ctx context.Context, userID uint64, turns int) []ReviewAgentMessageItem {
	values, err := s.rdb.LRange(ctx, s.reviewContextKey(userID), 0, -1).Result()
	if err != nil || len(values) == 0 {
		return nil
	}
	contextItems := decodeReviewContext(values)
	if len(contextItems) == 0 {
		return nil
	}

	selected := takeLatestReviewTurns(contextItems, turns)
	out := make([]ReviewAgentMessageItem, 0, len(selected))
	for _, item := range selected {
		if !isReviewDisplayRole(item.Role) || strings.TrimSpace(item.Content) == "" {
			continue
		}
		out = append(out, ReviewAgentMessageItem{
			ID:            item.MessageID,
			TurnNo:        item.TurnNo,
			Role:          item.Role,
			MessageType:   item.MessageType,
			Content:       item.Content,
			ContentFormat: "markdown",
			CreatedAt:     item.CreatedAt,
		})
	}
	return out
}

func (s *ReviewAgentService) reviewMessagesFromDB(ctx context.Context, userID uint64, turns int) ([]ReviewAgentMessageItem, error) {
	var rows []model.ReviewAgentMessage
	limit := turns * 4
	if limit < 40 {
		limit = 40
	}
	if limit > 200 {
		limit = 200
	}
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND role <> ? AND deleted_at IS NULL", userID, "tool").
		Order("sequence_no DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []ReviewAgentMessageItem{}, nil
	}

	selected := make([]model.ReviewAgentMessage, 0, len(rows))
	seenTurns := make(map[uint]struct{}, turns)
	for _, row := range rows {
		if strings.TrimSpace(row.Content) == "" || !isReviewDisplayRole(row.Role) {
			continue
		}
		if _, ok := seenTurns[row.TurnNo]; !ok {
			if len(seenTurns) >= turns {
				continue
			}
			seenTurns[row.TurnNo] = struct{}{}
		}
		selected = append(selected, row)
	}
	for i, j := 0, len(selected)-1; i < j; i, j = i+1, j-1 {
		selected[i], selected[j] = selected[j], selected[i]
	}

	out := make([]ReviewAgentMessageItem, 0, len(selected))
	for _, row := range selected {
		out = append(out, ReviewAgentMessageItem{
			ID:            row.ID,
			TurnNo:        row.TurnNo,
			Role:          row.Role,
			MessageType:   row.MessageType,
			Content:       row.Content,
			ContentFormat: row.ContentFormat,
			CreatedAt:     row.CreatedAt.Format(time.RFC3339),
		})
	}
	return out, nil
}

func (s *ReviewAgentService) run(ctx context.Context, req ReviewAgentRequest, events chan<- ReviewStreamEvent) {
	userMsg, err := s.createReviewMessage(ctx, req.UserID, "user", "normal", req.Message, "markdown", reviewMessageStatusSuccess, "")
	if err != nil {
		events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
		return
	}
	s.pushReviewContext(context.Background(), userMsg)

	contextItems := s.loadReviewContext(ctx, req.UserID)
	contextMessages := reviewContextToSchemaMessages(contextItems)

	intent, err := s.parseIntent(ctx, contextMessages, req.Message)
	if err != nil {
		intent = reviewIntent{
			NeedQueryMessages: true,
			NeedClarification: true,
			Clarification:     "我还不确定你想查询哪个时间范围的学习记录。你想看今天、昨天、最近 7 天、本周，还是全部？",
		}
	}
	if intent.NeedQueryMessages && intent.NeedClarification {
		question := strings.TrimSpace(intent.Clarification)
		if question == "" {
			question = "你想查询哪个时间范围的消息？今天、昨天、最近 7 天、本周，还是全部？"
		}
		assistantMsg, err := s.createReviewMessage(ctx, req.UserID, "assistant", "clarification", question, "markdown", reviewMessageStatusSuccess, "")
		if err != nil {
			events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
			return
		}
		s.pushReviewContext(context.Background(), assistantMsg)
		events <- ReviewStreamEvent{Event: "clarification", Data: map[string]string{"question": question}}
		events <- ReviewStreamEvent{Event: "done", Data: map[string]string{"status": "waiting_user"}}
		return
	}

	var llmContext string
	if intent.NeedQueryMessages && intent.Query != nil {
		cards, err := s.queryReviewCards(ctx, req.UserID, *intent.Query)
		if err != nil {
			events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
			return
		}
		events <- ReviewStreamEvent{Event: "tool_result", Data: reviewCardEvent{DisplayType: "message_cards", Total: len(cards), Items: cards}}
		llmContext = buildReviewLLMContext(cards)
		if llmContext == "" {
			llmContext = "本次查询没有找到符合条件的学习记录。"
		}
		toolMsg, err := s.createReviewMessage(ctx, req.UserID, "tool", "query_result", llmContext, "plain", reviewMessageStatusSuccess, "")
		if err != nil {
			events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
			return
		}
		s.pushReviewContext(context.Background(), toolMsg)
		contextItems = s.loadReviewContext(ctx, req.UserID)
		contextMessages = reviewContextToSchemaMessages(contextItems)
	}

	assistantMsg, err := s.createReviewMessage(ctx, req.UserID, "assistant", "normal", "", "markdown", reviewMessageStatusStreaming, "")
	if err != nil {
		events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
		return
	}
	answer, err := s.streamAnswer(ctx, contextMessages, req.Message, events)
	if err != nil {
		_ = s.db.WithContext(context.Background()).Model(&model.ReviewAgentMessage{}).Where("id = ?", assistantMsg.ID).
			Updates(map[string]interface{}{"status": reviewMessageStatusFailed, "error_message": err.Error()}).Error
		events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50020, "message": "AI 调用失败"}}
		return
	}
	assistantMsg.Content = answer
	assistantMsg.Status = reviewMessageStatusSuccess
	if err := s.db.WithContext(context.Background()).Model(&model.ReviewAgentMessage{}).Where("id = ?", assistantMsg.ID).
		Updates(map[string]interface{}{"status": reviewMessageStatusSuccess, "content": answer}).Error; err != nil {
		events <- ReviewStreamEvent{Event: "error", Data: map[string]interface{}{"code": 50000, "message": err.Error()}}
		return
	}
	s.pushReviewContext(context.Background(), assistantMsg)
	events <- ReviewStreamEvent{Event: "done", Data: map[string]interface{}{"status": "completed", "message_id": assistantMsg.ID}}
}

func (s *ReviewAgentService) parseIntent(ctx context.Context, history []*schema.Message, userInput string) (reviewIntent, error) {
	systemPrompt := strings.ReplaceAll(einoreview.IntentParserSystemPrompt, "{current_time}", time.Now().Format("2006-01-02 15:04:05"))
	systemPrompt = strings.ReplaceAll(systemPrompt, "{timezone}", "Asia/Shanghai")
	messages := []*schema.Message{{Role: schema.System, Content: systemPrompt}}
	messages = append(messages, history...)
	messages = append(messages, &schema.Message{Role: schema.User, Content: userInput})
	// log.Printf("发送给意图分析模型的消息: %v", messages)
	resp, err := s.model.Generate(ctx, messages, openai.WithExtraFields(
		map[string]any{
			"enable_thinking": false,
			"response_format": map[string]any{
				"type": "json_object",
			},
		},
	))
	// log.Printf("resp: %v", resp)
	if err != nil {
		return reviewIntent{}, err
	}
	raw := strings.TrimSpace(resp.Content)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	var intent reviewIntent
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &intent); err != nil {
		return reviewIntent{}, err
	}
	if err := normalizeIntent(&intent); err != nil {
		return reviewIntent{}, err
	}
	return intent, nil
}

func (s *ReviewAgentService) streamAnswer(ctx context.Context, history []*schema.Message, userInput string, events chan<- ReviewStreamEvent) (string, error) {
	messages := []*schema.Message{{Role: schema.System, Content: einoreview.AnswerGeneratorSystemPrompt}}
	messages = append(messages, history...)
	if len(messages) == 0 || messages[len(messages)-1].Role != schema.User || messages[len(messages)-1].Content != userInput {
		messages = append(messages, &schema.Message{Role: schema.User, Content: userInput})
	}
	// log.Printf("发送给模型的消息: %v", messages)
	reader, err := s.model.Stream(ctx, messages, openai.WithExtraFields(
		map[string]any{
			"enable_thinking": false,
		},
	))
	if err != nil {
		return "", err
	}
	defer reader.Close()
	var answer strings.Builder
	for {
		chunk, err := reader.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", err
		}
		text := streamChunkText(chunk)
		if text == "" {
			continue
		}
		answer.WriteString(text)
		events <- ReviewStreamEvent{Event: "delta", Data: map[string]string{"content": text}}
	}
	return answer.String(), nil
}

func normalizeIntent(intent *reviewIntent) error {
	if !intent.NeedQueryMessages {
		intent.NeedClarification = false
		intent.Clarification = ""
		intent.Query = nil
		return nil
	}
	if intent.NeedClarification {
		intent.Query = nil
		return nil
	}
	if intent.Query == nil {
		return errors.New("缺少查询条件")
	}
	if intent.Query.Limit <= 0 {
		intent.Query.Limit = reviewDefaultLimit
	}
	if intent.Query.Limit > reviewMaxLimit {
		intent.Query.Limit = reviewMaxLimit
	}
	if intent.Query.StartTime != "" {
		if _, err := time.ParseInLocation("2006-01-02 15:04:05", intent.Query.StartTime, time.Local); err != nil {
			return err
		}
	}
	if intent.Query.EndTime != "" {
		if _, err := time.ParseInLocation("2006-01-02 15:04:05", intent.Query.EndTime, time.Local); err != nil {
			return err
		}
	}
	return nil
}

// queryReviewCards 根据 DSL 查询条件，构建学习复盘卡片列表。
// 流程：查 assistant 消息 → 配对 user 消息 → 查会话标题 → 查附件 → 查文件 → 组装卡片 → 签发预览 URL。
func (s *ReviewAgentService) queryReviewCards(ctx context.Context, userID uint64, dsl reviewMessageDSL) ([]ReviewMessageCard, error) {
	// === 第一步：按 DSL 条件查询 assistant 消息（AI 回答）===
	var assistants []model.Message
	q := s.db.WithContext(ctx).
		Where("user_id = ? AND role = ? AND deleted_at IS NULL", userID, "assistant")

	// 时间范围过滤
	if dsl.StartTime != "" {
		start, _ := time.ParseInLocation("2006-01-02 15:04:05", dsl.StartTime, time.Local)
		q = q.Where("created_at >= ?", start)
	}
	if dsl.EndTime != "" {
		end, _ := time.ParseInLocation("2006-01-02 15:04:05", dsl.EndTime, time.Local)
		q = q.Where("created_at <= ?", end)
	}

	// 状态过滤（收藏 / 已理解 / 待复习）
	if dsl.Filters.IsFavorite != nil {
		q = q.Where("is_favorite = ?", *dsl.Filters.IsFavorite)
	}
	if dsl.Filters.IsUnderstood != nil {
		q = q.Where("is_understood = ?", *dsl.Filters.IsUnderstood)
	}
	if dsl.Filters.IsReviewLater != nil {
		q = q.Where("is_review_later = ?", *dsl.Filters.IsReviewLater)
	}

	// 倒序取 Limit 条（最新的在前）
	if err := q.Order("created_at DESC").Limit(dsl.Limit).Find(&assistants).Error; err != nil {
		return nil, err
	}
	if len(assistants) == 0 {
		return nil, nil
	}

	// === 第二步：批量加载关联数据（避免 N+1 查询）===

	// 2a. 加载配对的 user 消息（一问一答配对）
	userByPair := s.loadPairedUserMessages(ctx, userID, assistants)

	// 2b. 加载会话标题
	convTitles := s.loadConversationTitles(ctx, userID, assistants)

	// 2c. 收集所有 user 消息 ID，批量查首个附件
	userIDs := make([]uint64, 0, len(userByPair))
	for _, msg := range userByPair {
		userIDs = append(userIDs, msg.ID)
	}
	firstAttachment := s.loadFirstAttachments(ctx, userID, userIDs)

	// 2d. 收集所有 file_id，批量查文件元信息
	fileIDs := make([]uint64, 0, len(firstAttachment))
	for _, fileID := range firstAttachment {
		fileIDs = append(fileIDs, fileID)
	}
	files := s.loadReviewFiles(ctx, userID, uniqueUint64s(fileIDs))

	// === 第三步：组装卡片 ===
	cards := make([]ReviewMessageCard, 0, len(assistants))
	for _, assistant := range assistants {
		// 通过 conversation_id + turn_no 找到对应的 user 消息
		userMsg := userByPair[reviewPairKey(assistant.ConversationID, assistant.TurnNo)]

		card := ReviewMessageCard{
			AssistantMessageID: assistant.ID,
			UserMessageID:      userMsg.ID,
			ConversationID:     assistant.ConversationID,
			ConversationTitle:  convTitles[assistant.ConversationID],
			TurnNo:             assistant.TurnNo,
			Question:           userMsg.Content,
			AnswerPreview:      cutRunes(assistant.Content, 200), // 给前端展示的摘要
			AnswerForLLM:       cutRunes(assistant.Content, 200), // 给下一轮 AI 用的上下文
			SourceTitle:        userMsg.SourceTitle,
			CreatedAt:          assistant.CreatedAt.Format(time.RFC3339),
			IsFavorite:         assistant.IsFavorite,
			IsUnderstood:       assistant.IsUnderstood,
			IsReviewLater:      assistant.IsReviewLater,
		}

		// 如果有附件，签发临时预览 URL
		if fileID, ok := firstAttachment[userMsg.ID]; ok {
			card.FirstFileID = &fileID
			card.HasFile = true
			if file, ok := files[fileID]; ok {
				if signed, err := s.storage.SignedGetURL(ctx, file.ObjectKey, 15*time.Minute); err == nil && signed != nil {
					card.FirstFilePreviewURL = signed.URL
				}
			}
		}
		cards = append(cards, card)
	}
	return cards, nil
}

func (s *ReviewAgentService) createReviewMessage(ctx context.Context, userID uint64, role, messageType, content, contentFormat string, status int8, errMsg string) (model.ReviewAgentMessage, error) {
	var out model.ReviewAgentMessage
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var last model.ReviewAgentMessage
		if err := tx.Where("user_id = ? AND deleted_at IS NULL", userID).Order("sequence_no DESC").Limit(1).Find(&last).Error; err != nil {
			return err
		}
		seq := last.SequenceNo + 1
		turn := last.TurnNo
		if role == "user" || turn == 0 {
			turn++
		}
		out = model.ReviewAgentMessage{
			UserID: userID, TurnNo: turn, Role: role, MessageType: messageType,
			Content: content, ContentFormat: contentFormat, SequenceNo: seq,
			Status: status, ErrorMessage: errMsg,
		}
		return tx.Create(&out).Error
	})
	return out, err
}

func (s *ReviewAgentService) reviewContextKey(userID uint64) string {
	return fmt.Sprintf("review_agent:context:%d", userID)
}

func (s *ReviewAgentService) reviewStreamLockKey(userID uint64) string {
	return fmt.Sprintf("review_agent:streaming:%d", userID)
}

func (s *ReviewAgentService) pushReviewContext(ctx context.Context, msg model.ReviewAgentMessage) {
	item := reviewContextItem{
		MessageID: msg.ID, TurnNo: msg.TurnNo, Role: msg.Role, MessageType: msg.MessageType,
		Content: msg.Content, CreatedAt: msg.CreatedAt.Format(time.RFC3339),
	}
	b, _ := json.Marshal(item)
	key := s.reviewContextKey(msg.UserID)
	pipe := s.rdb.Pipeline()
	pipe.RPush(ctx, key, string(b))
	pipe.LTrim(ctx, key, -reviewContextLimit, -1)
	pipe.Expire(ctx, key, reviewContextTTL)
	_, _ = pipe.Exec(ctx)
}

func (s *ReviewAgentService) loadReviewContext(ctx context.Context, userID uint64) []reviewContextItem {
	values, err := s.rdb.LRange(ctx, s.reviewContextKey(userID), 0, -1).Result()
	if err == nil && len(values) > 0 {
		return decodeReviewContext(values)
	}
	var rows []model.ReviewAgentMessage
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND deleted_at IS NULL", userID).
		Order("sequence_no DESC").Limit(reviewContextLimit).Find(&rows).Error; err != nil {
		return nil
	}
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}
	items := make([]reviewContextItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, reviewContextItem{
			MessageID: row.ID, TurnNo: row.TurnNo, Role: row.Role, MessageType: row.MessageType,
			Content: row.Content, CreatedAt: row.CreatedAt.Format(time.RFC3339),
		})
	}
	for _, item := range items {
		b, _ := json.Marshal(item)
		_ = s.rdb.RPush(ctx, s.reviewContextKey(userID), string(b)).Err()
	}
	_ = s.rdb.LTrim(ctx, s.reviewContextKey(userID), -reviewContextLimit, -1).Err()
	_ = s.rdb.Expire(ctx, s.reviewContextKey(userID), reviewContextTTL).Err()
	return items
}

func decodeReviewContext(values []string) []reviewContextItem {
	items := make([]reviewContextItem, 0, len(values))
	for _, value := range values {
		var item reviewContextItem
		if json.Unmarshal([]byte(value), &item) == nil && strings.TrimSpace(item.Content) != "" {
			items = append(items, item)
		}
	}
	return items
}

func takeLatestReviewTurns(items []reviewContextItem, turns int) []reviewContextItem {
	if turns <= 0 || len(items) == 0 {
		return nil
	}
	seenTurns := make(map[uint]struct{}, turns)
	start := len(items)
	for i := len(items) - 1; i >= 0; i-- {
		item := items[i]
		if !isReviewDisplayRole(item.Role) || strings.TrimSpace(item.Content) == "" {
			continue
		}
		if _, ok := seenTurns[item.TurnNo]; !ok {
			if len(seenTurns) >= turns {
				break
			}
			seenTurns[item.TurnNo] = struct{}{}
		}
		start = i
	}
	return items[start:]
}

func isReviewDisplayRole(role string) bool {
	return role == "user" || role == "assistant"
}

func reviewContextToSchemaMessages(items []reviewContextItem) []*schema.Message {
	out := make([]*schema.Message, 0, len(items))
	for _, item := range items {
		switch item.Role {
		case "assistant":
			out = append(out, &schema.Message{Role: schema.Assistant, Content: item.Content})
		case "tool":
			out = append(out, &schema.Message{Role: schema.Tool, Content: item.Content, ToolCallID: fmt.Sprintf("review_query_%d", item.MessageID)})
		default:
			out = append(out, &schema.Message{Role: schema.User, Content: item.Content})
		}
	}
	return out
}

func (s *ReviewAgentService) loadPairedUserMessages(ctx context.Context, userID uint64, assistants []model.Message) map[string]model.Message {
	convIDs := make([]uint64, 0, len(assistants))
	turnNos := make([]uint, 0, len(assistants))
	for _, msg := range assistants {
		convIDs = append(convIDs, msg.ConversationID)
		turnNos = append(turnNos, msg.TurnNo)
	}
	var users []model.Message
	_ = s.db.WithContext(ctx).
		Where("user_id = ? AND role = ? AND conversation_id IN ? AND turn_no IN ? AND deleted_at IS NULL", userID, "user", uniqueUint64s(convIDs), uniqueUints(turnNos)).
		Find(&users).Error
	out := make(map[string]model.Message, len(users))
	for _, msg := range users {
		out[reviewPairKey(msg.ConversationID, msg.TurnNo)] = msg
	}
	return out
}

func (s *ReviewAgentService) loadConversationTitles(ctx context.Context, userID uint64, messages []model.Message) map[uint64]string {
	ids := make([]uint64, 0, len(messages))
	for _, msg := range messages {
		ids = append(ids, msg.ConversationID)
	}
	var conversations []model.Conversation
	_ = s.db.WithContext(ctx).Where("user_id = ? AND id IN ?", userID, uniqueUint64s(ids)).Find(&conversations).Error
	out := make(map[uint64]string, len(conversations))
	for _, c := range conversations {
		out[c.ID] = c.Title
	}
	return out
}

func (s *ReviewAgentService) loadFirstAttachments(ctx context.Context, userID uint64, messageIDs []uint64) map[uint64]uint64 {
	if len(messageIDs) == 0 {
		return nil
	}
	var attachments []model.MessageAttachment
	_ = s.db.WithContext(ctx).
		Where("user_id = ? AND message_id IN ? AND attachment_type = ?", userID, messageIDs, "image").
		Order("message_id ASC, sort_order ASC").Find(&attachments).Error
	out := make(map[uint64]uint64)
	for _, att := range attachments {
		if _, ok := out[att.MessageID]; !ok {
			out[att.MessageID] = att.FileID
		}
	}
	return out
}

func (s *ReviewAgentService) loadReviewFiles(ctx context.Context, userID uint64, fileIDs []uint64) map[uint64]model.File {
	if len(fileIDs) == 0 {
		return nil
	}
	var files []model.File
	_ = s.db.WithContext(ctx).
		Where("user_id = ? AND id IN ? AND upload_status = ? AND deleted_at IS NULL", userID, fileIDs, FileStatusUploaded).
		Find(&files).Error
	out := make(map[uint64]model.File, len(files))
	for _, file := range files {
		out[file.ID] = file
	}
	return out
}

func buildReviewLLMContext(cards []ReviewMessageCard) string {
	if len(cards) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "本次查询到 %d 条记录：\n", len(cards))
	for i, card := range cards {
		fmt.Fprintf(&b, "\n[记录 %d]\n", i+1)
		fmt.Fprintf(&b, "时间：%s\n", card.CreatedAt)
		if card.ConversationTitle != "" {
			fmt.Fprintf(&b, "会话：%s\n", card.ConversationTitle)
		}
		fmt.Fprintf(&b, "状态：已收藏=%t，已理解=%t，待复习=%t\n", card.IsFavorite, card.IsUnderstood, card.IsReviewLater)
		fmt.Fprintf(&b, "用户问题：%s\n", card.Question)
		fmt.Fprintf(&b, "AI回答摘要：%s\n", card.AnswerForLLM)
	}
	return b.String()
}

func reviewPairKey(conversationID uint64, turnNo uint) string {
	return fmt.Sprintf("%d:%d", conversationID, turnNo)
}

func cutRunes(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= n {
		return string(r)
	}
	return string(r[:n])
}

func uniqueUints(values []uint) []uint {
	if len(values) <= 1 {
		return values
	}
	seen := make(map[uint]struct{}, len(values))
	out := make([]uint, 0, len(values))
	for _, v := range values {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
