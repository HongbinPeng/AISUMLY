package handler

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
)

// writeSSE 写入单个 SSE 事件，data 会被序列化为 JSON。
func writeSSE(c *gin.Context, event string, data interface{}) {
	b, _ := json.Marshal(data)
	_, _ = fmt.Fprintf(c.Writer, "event: %s\n", event)
	_, _ = fmt.Fprintf(c.Writer, "data: %s\n\n", string(b))
}

// parseUintParam 解析 Gin 路径参数中的无符号整数 ID。
func parseUintParam(c *gin.Context, name string) (uint64, error) {
	return strconv.ParseUint(c.Param(name), 10, 64)
}
