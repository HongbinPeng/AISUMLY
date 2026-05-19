package handler

import (
	"net/http"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"
	"aisumly/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type updateMessageRequest struct {
	IsFavorite    *bool   `json:"is_favorite"`
	IsUnderstood  *bool   `json:"is_understood"`
	IsReviewLater *bool   `json:"is_review_later"`
	UserNote      *string `json:"user_note"`
}

// updateMessage 更新消息的收藏、理解状态、待复习状态和用户备注。
func (h *Handler) updateMessage(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, "消息 ID 不正确")
		return
	}
	var req updateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	msg, err := h.deps.Messages.UpdateState(c.Request.Context(), middleware.CurrentUserID(c), id, service.UpdateMessageStateInput{
		IsFavorite:    req.IsFavorite,
		IsUnderstood:  req.IsUnderstood,
		IsReviewLater: req.IsReviewLater,
		UserNote:      req.UserNote,
	})
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	response.OK(c, msg)
}
