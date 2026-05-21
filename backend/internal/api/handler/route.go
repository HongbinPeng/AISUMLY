package handler

import "github.com/gin-gonic/gin"

// RegisterPublic 注册不需要登录态的公开接口。
func (h *Handler) RegisterPublic(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	auth.POST("/register", h.register)
	auth.POST("/login", h.login)
	auth.POST("/refresh", h.refresh)
}

// RegisterProtected 注册需要 JWT 登录态的受保护接口。
func (h *Handler) RegisterProtected(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	auth.GET("/me", h.me)
	auth.POST("/logout", h.logout)

	dashboard := r.Group("/dashboard")
	dashboard.GET("/today", h.todayDashboard)

	conversations := r.Group("/conversations")
	conversations.GET("", h.listConversations)
	conversations.GET("/:id/messages", h.conversationMessages)
	conversations.PATCH("/:id", h.updateConversation)
	conversations.DELETE("/:id", h.deleteConversation)

	files := r.Group("/files")
	files.POST("/images/upload-urls", h.createImageUploadURLs)
	files.POST("/images/confirm", h.confirmImages)
	files.GET("/:id/preview-url", h.filePreviewURL)

	chat := r.Group("/chat")
	chat.POST("/stream", h.chatStream)

	messages := r.Group("/messages")
	messages.PATCH("/:id", h.updateMessage)

	summaries := r.Group("/summaries")
	summaries.POST("/daily/:date/generate", h.generateDailySummary)
	summaries.GET("/daily/:date", h.getDailySummary)
	summaries.POST("/daily/:date/regenerate", h.regenerateDailySummary)

	reviewAgent := r.Group("/review-agent")
	reviewAgent.GET("/messages", h.reviewAgentMessages)
	reviewAgent.POST("/chat", h.reviewAgentChat)
}
