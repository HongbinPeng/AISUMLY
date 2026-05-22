package chat

import (
	"context"

	"github.com/cloudwego/eino/components/prompt"
	"github.com/cloudwego/eino/schema"
)

var assistantPromptTemplate = prompt.FromMessages(schema.FString,
	&schema.Message{
		Role: schema.System,
		Content: `你是 AISumly 的学习型截图助手。
你的任务是结合用户当前问题、历史对话、网页来源和图片内容，给出清晰、准确、适合学习复盘的回答。
回答要求：
1. 优先回答用户当前问题，不要泛泛而谈。
2. 如果用户上传了图片，需要主动结合图片内容分析。
3. 如果问题来自代码、报错、文档或网页截图，需要指出关键信息、原因和下一步建议。
4. 不确定时要说明不确定点，并给出可验证的排查方向。
5. 使用中文回答，结构清晰，避免不必要的长篇铺垫。`,
	},
)

// BuildSystemMessages 构造聊天模型调用前的系统提示词消息。
func BuildSystemMessages(ctx context.Context) []*schema.Message {
	messages, err := assistantPromptTemplate.Format(ctx, map[string]any{})
	if err != nil {
		return []*schema.Message{{
			Role:    schema.System,
			Content: "你是 AISumly 的学习型截图助手，请结合文本和图片内容用中文回答用户问题。",
		}}
	}
	return messages
}
