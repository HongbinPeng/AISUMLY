package handler

import "aisumly/backend/internal/service"

type Dependencies struct {
	Auth          *service.AuthService
	Conversations *service.ConversationService
	Chat          *service.ChatService
	Files         *service.FileService
	Messages      *service.MessageService
	Summaries     *service.SummaryService
	ReviewAgent   *service.ReviewAgentService
	Dashboard     *service.DashboardService
}

type Handler struct {
	deps Dependencies
}

func New(deps Dependencies) *Handler {
	return &Handler{deps: deps}
}
