package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	App      AppConfig
	MySQL    MySQLConfig
	Redis    RedisConfig
	JWT      JWTConfig
	OSS      OSSConfig
	AI       AIConfig
	Security SecurityConfig
}

type AppConfig struct {
	Addr string
	Mode string
}

type MySQLConfig struct {
	DSN string
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type JWTConfig struct {
	Secret             string
	AccessTokenTTL     time.Duration
	RefreshTokenTTL    time.Duration
	RefreshTokenPrefix string
}

type OSSConfig struct {
	Endpoint             string
	AccessKeyID          string
	AccessKeySecret      string
	Bucket               string
	PublicBaseURL        string
	UploadURLTTLSeconds  int
	PreviewURLTTLSeconds int
}

type AIConfig struct {
	Provider string
	Model    string
	APIKey   string
	BaseURL  string
}

type SecurityConfig struct {
	MaxUserInflightAI int64
	ConversationLock  time.Duration
	IdempotencyTTL    time.Duration
	RecentContextTTL  time.Duration
}

func Load() Config {
	loadDotEnv()

	return Config{
		App: AppConfig{
			Addr: getEnv("APP_ADDR", ":8080"),
			Mode: getEnv("GIN_MODE", "debug"),
		},
		MySQL: MySQLConfig{
			DSN: getEnv("MYSQL_DSN", "root:root@tcp(127.0.0.1:3306)/aisumly?charset=utf8mb4&parseTime=True&loc=Local"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "127.0.0.1:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			Secret:             getEnv("JWT_SECRET", "dev-secret-change-me"),
			AccessTokenTTL:     time.Duration(getEnvInt("JWT_ACCESS_TTL_MINUTES", 120)) * time.Minute,
			RefreshTokenTTL:    time.Duration(getEnvInt("JWT_REFRESH_TTL_HOURS", 24*14)) * time.Hour,
			RefreshTokenPrefix: "auth:refresh:",
		},
		OSS: OSSConfig{
			Endpoint:             getEnv("OSS_ENDPOINT", ""),
			AccessKeyID:          getEnv("OSS_ACCESS_KEY_ID", ""),
			AccessKeySecret:      getEnv("OSS_ACCESS_KEY_SECRET", ""),
			Bucket:               getEnv("OSS_BUCKET", ""),
			PublicBaseURL:        getEnv("OSS_PUBLIC_BASE_URL", ""),
			UploadURLTTLSeconds:  getEnvInt("OSS_UPLOAD_URL_TTL_SECONDS", 900),
			PreviewURLTTLSeconds: getEnvInt("OSS_PREVIEW_URL_TTL_SECONDS", 900),
		},
		AI: AIConfig{
			Provider: getEnv("AI_PROVIDER", "local"),
			Model:    getEnv("AI_MODEL", "本地开发助手"),
			APIKey:   getEnv("BAILIAN_API_KEY", getEnv("DASHSCOPE_API_KEY", "")),
			BaseURL:  getEnv("AI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
		},
		Security: SecurityConfig{
			MaxUserInflightAI: int64(getEnvInt("MAX_USER_INFLIGHT_AI", 3)),
			ConversationLock:  time.Duration(getEnvInt("CONVERSATION_LOCK_SECONDS", 180)) * time.Second,
			IdempotencyTTL:    time.Duration(getEnvInt("IDEMPOTENCY_TTL_HOURS", 24)) * time.Hour,
			RecentContextTTL:  time.Duration(getEnvInt("RECENT_CONTEXT_TTL_DAYS", 7)) * 24 * time.Hour,
		},
	}
}

// loadDotEnv 加载本地环境变量文件，方便开发阶段直接使用 backend/.env。
func loadDotEnv() {
	// path := ".env"
	// path := ".env-remote"
	godotenv.Load(".env", "../.env")
}

// getEnv 读取字符串环境变量，未配置时返回默认值。
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getEnvInt 读取整数环境变量，解析失败时返回默认值。
func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

// getEnvBool 读取布尔环境变量，支持 true/false、1/0 等常见写法。
func getEnvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
