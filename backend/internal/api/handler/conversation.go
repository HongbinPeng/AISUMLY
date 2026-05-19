package handler

import (
	"net/http"
	"strconv"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// listConversations 返回当前用户的会话列表。
func (h *Handler) listConversations(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	items, err := h.deps.Conversations.List(c.Request.Context(), middleware.CurrentUserID(c), limit)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, err.Error())
		return
	}
	response.OK(c, gin.H{"items": items, "next_cursor": ""})
}

// conversationMessages 返回指定会话的消息历史。
func (h *Handler) conversationMessages(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, "会话 ID 不正确")
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	before, _ := strconv.ParseUint(c.DefaultQuery("before_sequence_no", "0"), 10, 64)
	conv, messages, err := h.deps.Conversations.Messages(c.Request.Context(), middleware.CurrentUserID(c), id, limit, before)
	if err != nil {
		response.Error(c, http.StatusNotFound, 40004, err.Error())
		return
	}
	response.OK(c, gin.H{"conversation": conv, "messages": messages, "has_more": len(messages) == limit})
}

type updateConversationRequest struct {
	Title string `json:"title" binding:"required"`
}

// updateConversation 更新会话标题。
func (h *Handler) updateConversation(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, "会话 ID 不正确")
		return
	}
	var req updateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	conv, err := h.deps.Conversations.UpdateTitle(c.Request.Context(), middleware.CurrentUserID(c), id, req.Title)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	response.OK(c, conv)
}
