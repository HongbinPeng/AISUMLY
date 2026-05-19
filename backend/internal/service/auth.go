package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"aisumly/backend/internal/config"
	"aisumly/backend/internal/domain/model"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	db  *gorm.DB
	rdb *redis.Client
	cfg config.JWTConfig
}

type AuthTokens struct {
	AccessToken  string     `json:"access_token"`
	RefreshToken string     `json:"refresh_token"`
	ExpiresIn    int64      `json:"expires_in"`
	User         model.User `json:"user"`
}

type tokenClaims struct {
	UserID uint64 `json:"user_id"`
	jwt.RegisteredClaims
}

// NewAuthService 创建认证服务，负责注册、登录、刷新令牌和退出登录。
func NewAuthService(db *gorm.DB, rdb *redis.Client, cfg config.JWTConfig) *AuthService {
	return &AuthService{db: db, rdb: rdb, cfg: cfg}
}

// Register 注册新用户，写入用户表后签发访问令牌和刷新令牌。
func (s *AuthService) Register(ctx context.Context, email, password, nickname string) (*AuthTokens, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	if nickname == "" {
		nickname = email
	}
	user := model.User{Email: email, PasswordHash: string(hash), Nickname: nickname, Status: 1}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, err
	}
	return s.issueTokens(ctx, user)
}

// Login 校验邮箱和密码，成功后更新最后登录时间并签发令牌。
func (s *AuthService) Login(ctx context.Context, email, password string) (*AuthTokens, error) {
	var user model.User
	if err := s.db.WithContext(ctx).Where("email = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
		return nil, errors.New("邮箱或密码不正确")
	}
	if user.Status != 1 {
		return nil, errors.New("用户已被禁用")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("邮箱或密码不正确")
	}
	now := time.Now()
	_ = s.db.WithContext(ctx).Model(&user).Update("last_login_at", now).Error
	user.LastLoginAt = &now
	return s.issueTokens(ctx, user)
}

// Me 根据用户 ID 查询当前登录用户信息。
func (s *AuthService) Me(ctx context.Context, userID uint64) (*model.User, error) {
	var user model.User
	if err := s.db.WithContext(ctx).Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// Refresh 使用旧刷新令牌换取新令牌。
// 这里先签发并保存新刷新令牌，再删除旧刷新令牌，避免签发失败导致用户直接掉线。
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*AuthTokens, error) {
	userID, err := s.rdb.Get(ctx, s.cfg.RefreshTokenPrefix+refreshToken).Uint64()
	if err != nil {
		return nil, errors.New("登录已过期，请重新登录")
	}
	var user model.User
	if err := s.db.WithContext(ctx).Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return s.issueTokensReplacing(ctx, user, refreshToken)
}

// Logout 删除刷新令牌，使当前登录态无法继续刷新。
func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	return s.rdb.Del(ctx, s.cfg.RefreshTokenPrefix+refreshToken).Err() //Err仅在网络超时、连接失败等异常情况下返回
}

// issueTokens 签发访问令牌和刷新令牌，并把刷新令牌写入 Redis。
func (s *AuthService) issueTokens(ctx context.Context, user model.User) (*AuthTokens, error) {
	return s.issueTokensReplacing(ctx, user, "")
}

// issueTokensReplacing 在签发新刷新令牌的同时可选择废弃旧刷新令牌。
// 使用 Redis 事务管道，确保“保存新令牌”和“删除旧令牌”作为同一批操作提交。
func (s *AuthService) issueTokensReplacing(ctx context.Context, user model.User, oldRefreshToken string) (*AuthTokens, error) {
	expiresAt := time.Now().Add(s.cfg.AccessTokenTTL)
	claims := tokenClaims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	access, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.Secret))
	if err != nil {
		return nil, err
	}
	refresh, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	pipe := s.rdb.TxPipeline() // 开启事务管道，确保“保存新令牌”和“删除旧令牌”作为同一批操作提交
	pipe.Set(ctx, s.cfg.RefreshTokenPrefix+refresh, user.ID, s.cfg.RefreshTokenTTL)
	if oldRefreshToken != "" {
		pipe.Del(ctx, s.cfg.RefreshTokenPrefix+oldRefreshToken)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, err
	}
	return &AuthTokens{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(s.cfg.AccessTokenTTL.Seconds()),
		User:         user,
	}, nil
}

// randomToken 生成指定字节长度的安全随机令牌，并返回十六进制字符串。
func randomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
