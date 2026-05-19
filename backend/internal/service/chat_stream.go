package service

import (
	"strings"

	"github.com/cloudwego/eino/schema"
)

// streamChunkText 提取模型流式 chunk 中的文本内容，兼容纯文本和多模态输出分片。
func streamChunkText(chunk *schema.Message) string {
	if chunk == nil {
		return ""
	}
	if chunk.Content != "" {
		return chunk.Content
	}
	if len(chunk.AssistantGenMultiContent) == 0 {
		return ""
	}
	var b strings.Builder
	for _, part := range chunk.AssistantGenMultiContent {
		if part.Type == schema.ChatMessagePartTypeText && part.Text != "" {
			b.WriteString(part.Text)
		}
		if part.Type == schema.ChatMessagePartTypeReasoning && part.Reasoning != nil && part.Reasoning.Text != "" {
			b.WriteString(part.Reasoning.Text)
		}
	}
	return b.String()
}
