package handler

import (
	"net/http"
	"strconv"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"
	"aisumly/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type reviewAgentChatRequest struct {
	Message   string `json:"message" binding:"required"`
	RequestID string `json:"request_id"`
}

// reviewAgentMessages 读取学习复盘助手最近对话记录，优先从 Redis 最近上下文读取。
func (h *Handler) reviewAgentMessages(c *gin.Context) {
	turns := 20
	if raw := c.Query("turns"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			turns = n
		}
	}
	items, err := h.deps.ReviewAgent.Messages(c.Request.Context(), middleware.CurrentUserID(c), turns)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, err.Error())
		return
	}
	response.OK(c, gin.H{"items": items})
}

// reviewAgentChat 接收学习复盘助手请求，并以 SSE 方式返回澄清、查询卡片和流式回答。
func (h *Handler) reviewAgentChat(c *gin.Context) {
	userID := middleware.CurrentUserID(c)
	var req reviewAgentChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	events, err := h.deps.ReviewAgent.Stream(c.Request.Context(), service.ReviewAgentRequest{
		UserID:  userID,
		Message: req.Message,
	})
	if err != nil {
		code := 40000
		status := http.StatusBadRequest
		if err.Error() == "学习复盘助手正在生成回答，请稍后再试" {
			code = 40902
			status = http.StatusConflict
		}
		response.Error(c, status, code, err.Error())
		return
	}

	c.Header("Content-Type", "text/event-stream; charset=utf-8") //告诉浏览器这是一个 SSE 流，数据会持续推送而不是一次性返回
	c.Header("Cache-Control", "no-cache")                        //禁止中间代理/浏览器缓存响应，确保数据实时到达
	c.Header("Connection", "keep-alive")                         //	保持 TCP 连接不断开，允许服务器持续推送事件
	c.Header("X-Accel-Buffering", "no")                          //	告诉 Nginx 关闭响应缓冲，否则 Nginx 会把流攒成块再发给客户端，导致前端无法实时收到每条消息
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
