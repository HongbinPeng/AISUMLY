package tools

// Registry 是后续注册 Eino 工具的统一入口。
//
// 工具层只做入参适配、调用可复用的 service/query 能力、转换输出结果。
// 不要在工具层复制业务逻辑。
type Registry struct{}

func NewRegistry() *Registry {
	return &Registry{}
}
