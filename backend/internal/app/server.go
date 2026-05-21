package app

import (
	"context"
	"net/http"
	"strings"
	"time"

	"aisumly/backend/internal/api/handler"
	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/config"
	einochat "aisumly/backend/internal/einoapp/chat"
	database "aisumly/backend/internal/infra/mysql"
	storage "aisumly/backend/internal/infra/oss"
	redisx "aisumly/backend/internal/infra/redis"
	"aisumly/backend/internal/service"

	"github.com/gin-contrib/cors"
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
	authSvc := service.NewAuthService(db, rdb, cfg.JWT)
	conversationSvc := service.NewConversationService(db, store)
	chatModel, err := einochat.NewOpenAICompatibleChatModel(context.Background(), cfg.AI)
	if err != nil {
		return nil, err
	}
	chatSvc := service.NewChatService(db, rdb, store, chatModel, cfg)
	fileSvc := service.NewFileService(db, store)
	messageSvc := service.NewMessageService(db)
	summarySvc := service.NewSummaryService(db, rdb, chatModel)
	reviewAgentSvc := service.NewReviewAgentService(db, rdb, store, chatModel)
	dashboardSvc := service.NewDashboardService(db)

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
	r.Use(cors.New(newCORSConfig(cfg.CORS)))

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

// newCORSConfig 根据环境变量构建跨域策略，支持浏览器扩展和前端页面直接访问后端。
func newCORSConfig(cfg config.CORSConfig) cors.Config {
	allowAll := containsOrigin(cfg.AllowOrigins, "*")
	c := cors.Config{
		AllowMethods:           cfg.AllowMethods,
		AllowHeaders:           cfg.AllowHeaders,
		ExposeHeaders:          cfg.ExposeHeaders,
		AllowCredentials:       cfg.AllowCredentials,
		AllowBrowserExtensions: true,
		MaxAge:                 12 * time.Hour,
	}
	if allowAll {
		c.AllowAllOrigins = true
		c.AllowCredentials = false
		return c
	}
	c.AllowOrigins = cfg.AllowOrigins
	c.AllowOriginFunc = func(origin string) bool {
		if strings.HasPrefix(origin, "chrome-extension://") {
			return containsOrigin(cfg.AllowOrigins, origin)
		}
		return false
	}
	return c
}

// containsOrigin 判断 Origin 白名单中是否包含指定来源。
func containsOrigin(origins []string, target string) bool {
	for _, origin := range origins {
		if origin == target {
			return true
		}
	}
	return false
}
