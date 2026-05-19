package handler

import (
	"net/http"

	"aisumly/backend/internal/api/middleware"
	"aisumly/backend/internal/pkg/response"
	"aisumly/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type uploadURLsRequest struct {
	Files []service.CreateUploadURLInput `json:"files" binding:"required"`
}

// createImageUploadURLs 创建图片上传任务，并返回私有 OSS 的短期上传地址。
func (h *Handler) createImageUploadURLs(c *gin.Context) {
	var req uploadURLsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	items, err := h.deps.Files.CreateImageUploadURLs(c.Request.Context(), middleware.CurrentUserID(c), req.Files)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	response.OK(c, gin.H{"items": items})
}

type confirmImagesRequest struct {
	FileIDs []uint64 `json:"file_ids" binding:"required"`
}

// confirmImages 确认前端已经把图片直传到 OSS，并更新文件上传状态。
func (h *Handler) confirmImages(c *gin.Context) {
	var req confirmImagesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, 40000, err.Error())
		return
	}
	items, err := h.deps.Files.ConfirmImages(c.Request.Context(), middleware.CurrentUserID(c), req.FileIDs)
	if err != nil {
		response.Error(c, http.StatusBadRequest, 50010, err.Error())
		return
	}
	response.OK(c, gin.H{"items": items})
}

// filePreviewURL 为私有 OSS 文件签发短期预览地址。
func (h *Handler) filePreviewURL(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Error(c, http.StatusBadRequest, 40000, "文件 ID 不正确")
		return
	}
	u, expiresIn, err := h.deps.Files.PreviewURL(c.Request.Context(), middleware.CurrentUserID(c), id)
	if err != nil {
		response.Error(c, http.StatusNotFound, 40004, err.Error())
		return
	}
	response.OK(c, gin.H{"file_id": id, "preview_url": u, "expires_in": expiresIn})
}
