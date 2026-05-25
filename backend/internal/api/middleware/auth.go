package middleware

import (
	"net/http"
	"strings"

	"aisumly/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const UserIDKey = "user_id"

type claims struct {
	UserID uint64 `json:"user_id"`
	jwt.RegisteredClaims
}

func Auth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			response.Error(c, http.StatusUnauthorized, 40001, "请先登录")
			c.Abort()
			return
		}
		tokenText := strings.TrimPrefix(header, "Bearer ")
		token, err := jwt.ParseWithClaims(tokenText, &claims{}, func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, jwt.ErrTokenSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			response.Error(c, http.StatusUnauthorized, 40001, "登录状态无效，请重新登录")
			c.Abort()
			return
		}
		claims, ok := token.Claims.(*claims)
		if !ok || claims.UserID == 0 {
			response.Error(c, http.StatusUnauthorized, 40001, "登录信息无效，请重新登录")
			c.Abort()
			return
		}
		c.Set(UserIDKey, claims.UserID)
		c.Next()
	}
}

func CurrentUserID(c *gin.Context) uint64 {
	v, ok := c.Get(UserIDKey)
	if !ok {
		return 0
	}
	id, _ := v.(uint64)
	return id
}
