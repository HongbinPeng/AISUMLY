package app

import (
	"context"
	"net/http"

	"aisumly/backend/internal/api/handler"
	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/config"
	einochat "aisumly/backend/internal/einoapp/chat"
	database "aisumly/backend/internal/infra/mysql"
	storage "aisumly/backend/internal/infra/oss"
	redisx "aisumly/backend/internal/infra/redis"
	"aisumly/backend/internal/repository"
	"aisumly/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type Server struct {
	cfg    config.Config
	engine *gin.Engine
}

func NewServer(cfg config.Config) (*Server, error) {
	gin.SetMode(cfg.App.Mode)

	db, err := database.NewMySQL(cfg.MySQL)
	if err != nil {
		return nil, err
	}
	rdb := redisx.New(cfg.Redis)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	store := storage.NewOSSStorage(cfg.OSS)
	conversationRepo := repository.NewConversationRepository(db)
	messageRepo := repository.NewMessageRepository(db)
	fileRepo := repository.NewFileRepository(db)
	dashboardRepo := repository.NewDashboardRepository(db)

	authSvc := service.NewAuthService(db, rdb, cfg.JWT)
	conversationSvc := service.NewConversationService(conversationRepo, store)
	chatModel, err := einochat.NewOpenAICompatibleChatModel(context.Background(), cfg.AI)
	if err != nil {
		return nil, err
	}
	chatSvc := service.NewChatService(db, rdb, store, fileRepo, chatModel, cfg)
	fileSvc := service.NewFileService(fileRepo, store)
	messageSvc := service.NewMessageService(messageRepo)
	summarySvc := service.NewSummaryService(db, rdb, chatModel)
	reviewAgentSvc := service.NewReviewAgentService(db, rdb, store, chatModel)
	dashboardSvc := service.NewDashboardService(dashboardRepo)

	h := handler.New(handler.Dependencies{
		Auth:          authSvc,
		Conversations: conversationSvc,
		Chat:          chatSvc,
		Files:         fileSvc,
		Messages:      messageSvc,
		Summaries:     summarySvc,
		ReviewAgent:   reviewAgentSvc,
		Dashboard:     dashboardSvc,
	})

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	h.RegisterPublic(api)
	protected := api.Group("")
	protected.Use(middleware.Auth(cfg.JWT.Secret))
	h.RegisterProtected(protected)

	return &Server{cfg: cfg, engine: r}, nil
}

func (s *Server) Run() error {
	return s.engine.Run(s.cfg.App.Addr)
}
