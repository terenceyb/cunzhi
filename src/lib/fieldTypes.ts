import type { FieldType } from '../types'

export const FIELD_TYPE_META: Record<FieldType, { label: string; desc: string; example: string }> = {
  text: { label: '单行文本', desc: '姓名、公司、职位等短文本', example: '职务' },
  longtext: { label: '多行文本', desc: '保留换行与表情，可折叠展开', example: '合作背景' },
  select: { label: '单选', desc: '胶囊标签，可配色，只能选一个', example: '合作状态' },
  multiselect: { label: '多选', desc: '多个标签，支持包含任一/全部筛选', example: '兴趣领域' },
  date: { label: '日期', desc: 'ISO 存储、多种展示格式、可含时间', example: '首次合作日期' },
  number: { label: '数字', desc: '小数位、百分比或自定义后缀', example: '合作金额' },
  checkbox: { label: '复选框', desc: '是 / 否，可作为名片卡徽章', example: '重点客户' },
  link: { label: '链接', desc: '以网页卡片展示，安全外链', example: '个人主页' },
  attachment: { label: '附件', desc: '图片自动压缩，内嵌数据包', example: '合同扫描件' },
  phone: { label: '电话号码', desc: '多号码，一键拨号/短信', example: '备用电话' },
  email: { label: '邮箱', desc: '多邮箱，格式校验，一键写信', example: '工作邮箱' },
  address: { label: '地址', desc: '省市区 + 详细地址，可复制/地图', example: '办公地址' },
  barcode: { label: '条码', desc: '扫码或手输，保留码制', example: '名片码' },
  personRef: { label: '人脉引用', desc: '关联到其他人脉，形成关系网', example: '共同好友' },
  timeline: { label: '系统时间线', desc: '仅内置，不可创建', example: '互动记录' },
}
