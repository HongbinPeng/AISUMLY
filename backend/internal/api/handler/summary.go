package handler

import (
	"net/http"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// generateDailySummary 触发指定日期的每日学习总结生成。
func (h *Handler) generateDailySummary(c *gin.Context) {
	summary, err := h.deps.Summaries.GenerateDaily(c.Request.Context(), middleware.CurrentUserID(c), c.Param("date"), false)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 50030, err.Error())
		return
	}
	response.OK(c, summary)
}

// regenerateDailySummary 强制重新生成指定日期的每日学习总结。
func (h *Handler) regenerateDailySummary(c *gin.Context) {
	summary, err := h.deps.Summaries.GenerateDaily(c.Request.Context(), middleware.CurrentUserID(c), c.Param("date"), true)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 50030, err.Error())
		return
	}
	response.OK(c, summary)
}

// getDailySummary 查询指定日期的每日学习总结及关联证据。
func (h *Handler) getDailySummary(c *gin.Context) {
	result, err := h.deps.Summaries.GetDaily(c.Request.Context(), middleware.CurrentUserID(c), c.Param("date"))
	if err != nil {
		response.Error(c, http.StatusNotFound, 40004, err.Error())
		return
	}
	response.OK(c, result)
}
