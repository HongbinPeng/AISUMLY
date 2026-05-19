package chat

import (
	"context"
	"errors"
	"time"

	"aisumly/backend/internal/config"

	einoopenai "github.com/cloudwego/eino-ext/components/model/openai"
	einomodel "github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type OpenAICompatibleChatModel struct {
	modelName string
	model     *einoopenai.ChatModel
}

// NewOpenAICompatibleChatModel 创建 OpenAI 兼容 ChatModel，可直接对接阿里云百炼兼容接口。
func NewOpenAICompatibleChatModel(ctx context.Context, cfg config.AIConfig) (*OpenAICompatibleChatModel, error) {
	if cfg.APIKey == "" {
		return nil, errors.New("缺少 AI API Key 配置")
	}
	if cfg.Model == "" {
		return nil, errors.New("缺少 AI_MODEL 配置")
	}
	cm, err := einoopenai.NewChatModel(ctx, &einoopenai.ChatModelConfig{
		BaseURL: cfg.BaseURL,
		APIKey:  cfg.APIKey,
		Model:   cfg.Model,
		Timeout: 5 * time.Minute,
	})
	if err != nil {
		return nil, err
	}
	return &OpenAICompatibleChatModel{modelName: cfg.Model, model: cm}, nil
}

// ModelName 返回当前模型名称，用于消息记录和问题排查。
func (m *OpenAICompatibleChatModel) ModelName() string {
	return m.modelName
}

// Generate 调用 OpenAI 兼容接口生成完整回复。
func (m *OpenAICompatibleChatModel) Generate(ctx context.Context, input []*schema.Message, opts ...einomodel.Option) (*schema.Message, error) {
	return m.model.Generate(ctx, input, opts...)
}

// Stream 调用 OpenAI 兼容接口生成流式回复。
func (m *OpenAICompatibleChatModel) Stream(ctx context.Context, input []*schema.Message, opts ...einomodel.Option) (*schema.StreamReader[*schema.Message], error) {
	return m.model.Stream(ctx, input, opts...)
}
