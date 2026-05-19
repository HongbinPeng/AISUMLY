package chat

import (
	einomodel "github.com/cloudwego/eino/components/model"
)

// ChatModel 是项目内部统一使用的 Eino 聊天模型接口。
// 业务层只依赖这个接口，不直接依赖具体三方模型实现，便于后续替换模型供应商或加入编排层。
type ChatModel interface {
	einomodel.BaseChatModel
	ModelName() string
}
