package handler

import (
	"net/http"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type registerRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Nickname string `json:"nickname"`
}

// register 处理用户注册请求，注册成功后直接返回访问令牌和刷新令牌。
func (h *Handler) register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	tokens, err := h.deps.Auth.Register(c.Request.Context(), req.Email, req.Password, req.Nickname)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	response.OK(c, tokens)
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// login 处理用户登录请求，校验账号密码后签发令牌。
func (h *Handler) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	tokens, err := h.deps.Auth.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, 40001, err.Error())
		return
	}
	response.OK(c, tokens)
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// refresh 使用刷新令牌换取新的访问令牌和刷新令牌。
func (h *Handler) refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	tokens, err := h.deps.Auth.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, 40001, err.Error())
		return
	}
	response.OK(c, tokens)
}

// me 返回当前登录用户的基础资料。
func (h *Handler) me(c *gin.Context) {
	user, err := h.deps.Auth.Me(c.Request.Context(), middleware.CurrentUserID(c))
	if err != nil {
		response.Error(c, http.StatusUnauthorized, 40001, err.Error())
		return
	}
	response.OK(c, user)
}

// logout 删除当前刷新令牌，完成退出登录。
func (h *Handler) logout(c *gin.Context) {
	var req refreshRequest
	_ = c.ShouldBindJSON(&req)
	if err := h.deps.Auth.Logout(c.Request.Context(), req.RefreshToken); err != nil {
		response.Error(c, http.StatusInternalServerError, 50000, err.Error())
		return
	}
	response.OK(c, nil)
}
