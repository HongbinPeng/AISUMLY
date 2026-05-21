package handler

import (
	"net/http"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// todayDashboard 返回首页“今天学习记录”所需的聚合展示数据。
func (h *Handler) todayDashboard(c *gin.Context) {
	data, err := h.deps.Dashboard.Today(c.Request.Context(), middleware.CurrentUserID(c))
	if err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, err.Error())
		return
	}
	response.OK(c, data)
}
