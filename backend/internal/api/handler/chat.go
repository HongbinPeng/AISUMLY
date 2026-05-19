package handler

import (
	"net/http"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"
	"aisumly/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type chatStreamRequest struct {
	ClientRequestID      string   `json:"client_request_id" binding:"required"`
	ConversationID       uint64   `json:"conversation_id"`
	ClientConversationID string   `json:"client_conversation_id"`
	CreateConversation   bool     `json:"create_conversation"`
	Content              string   `json:"content"`
	FileIDs              []uint64 `json:"file_ids"`
	SourceURL            string   `json:"source_url"`
	SourceTitle          string   `json:"source_title"`
	ContextRecentTurns   int      `json:"context_recent_turns"`
}

// chatStream 接收扩展端聊天请求，并以 SSE 方式流式返回 AI 回复。
func (h *Handler) chatStream(c *gin.Context) {
	userID := middleware.CurrentUserID(c)
	var req chatStreamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}

	events, err := h.deps.Chat.Stream(c.Request.Context(), service.StreamRequest{
		UserID:               userID,
		ClientRequestID:      req.ClientRequestID,
		ConversationID:       req.ConversationID,
		ClientConversationID: req.ClientConversationID,
		CreateConversation:   req.CreateConversation,
		Content:              req.Content,
		SourceURL:            req.SourceURL,
		SourceTitle:          req.SourceTitle,
		ContextRecentTurns:   req.ContextRecentTurns,
		FileIDs:              req.FileIDs,
	})
	if err != nil {
		code := 50000
		status := http.StatusBadRequest
		switch err.Error() {
		case "重复请求，请勿重复点击发送":
			code = 40901
			status = http.StatusConflict
		case "当前 AI 请求较多，请稍后再试":
			code = 42902
			status = http.StatusTooManyRequests
		}
		response.Error(c, status, code, err.Error())
		return
	}

	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		response.Error(c, http.StatusInternalServerError, 50000, "当前环境不支持流式响应")
		return
	}

	for event := range events {
		writeSSE(c, event.Event, event.Data)
		flusher.Flush()
	}
}
