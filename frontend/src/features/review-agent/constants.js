export const quickPrompts = [
  {
    title: '今天哪些内容还没弄懂？',
    desc: '查询未标记已理解和待复习的 AI 回复。',
    text: '我今天还有哪些知识点没有弄懂？顺便根据这些薄弱点出几道题给我。',
  },
  {
    title: '根据薄弱点出题',
    desc: '先找出待复习记录，再生成练习题。',
    text: '根据我今天待复习和没理解的内容出 3 道题。',
  },
  {
    title: '我收藏了哪些问答？',
    desc: '展示今天被收藏的高价值回答。',
    text: '我今天收藏了哪些回答？',
  },
  {
    title: '整理今天复习清单',
    desc: '按会话主题汇总建议复习顺序。',
    text: '帮我整理今天待复习的学习清单，并按优先级排序。',
  },
]

export const cardFilters = [
  { key: 'all', label: '全部' },
  { key: 'review', label: '待复习' },
  { key: 'unread', label: '未理解' },
  { key: 'favorite', label: '已收藏' },
  { key: 'image', label: '有截图' },
]
