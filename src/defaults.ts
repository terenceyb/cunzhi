import type {
  Anniversary,
  ContactChannel,
  FieldDefinition,
  Group,
  Person,
  Settings,
  SmartView,
  Tag,
  TimelineEvent,
  Todo,
} from './types'
import { nowISO, uid } from './lib/utils'

export const APP_VERSION = '2.0.0'
export const FORMAT_VERSION = 1

/** 联系方式的默认下级通道：电话类可拨号，网络通联类只能复制 */
export const DEFAULT_CONTACT_CHANNELS: ContactChannel[] = [
  { id: 'mobile', label: '手机', kind: 'tel', visible: true, hint: '13800138000', isBuiltIn: true },
  { id: 'landline', label: '固定电话', kind: 'tel', visible: true, hint: '010-88886666', isBuiltIn: true },
  { id: 'wechat', label: '微信', kind: 'im', visible: true, hint: '微信号', isBuiltIn: true },
  { id: 'qq', label: 'QQ', kind: 'im', visible: true, hint: 'QQ 号', isBuiltIn: true },
  { id: 'dingtalk', label: '钉钉', kind: 'im', visible: true, hint: '钉钉号 / 手机号', isBuiltIn: true },
  { id: 'feishu', label: '飞书', kind: 'im', visible: true, hint: '飞书账号', isBuiltIn: true },
  { id: 'whatsapp', label: 'WhatsApp', kind: 'im', visible: true, hint: '+86 13800138000', isBuiltIn: true },
  { id: 'telegram', label: 'Telegram', kind: 'im', visible: true, hint: '@username', isBuiltIn: true },
  { id: 'other', label: '其他', kind: 'im', visible: false, hint: '其他联系方式', isBuiltIn: true },
]

export const GROUP_COLORS = [
  '#E4574C',
  '#2F6FEB',
  '#0F9D8F',
  '#B4530A',
  '#7C4DFF',
  '#C2185B',
  '#2E7D32',
  '#5B6573',
]

const isoAt = (daysAgo: number, hour = 10): string => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

const dateAt = (daysFromNow: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const T = nowISO()

const mk = (
  key: string,
  label: string,
  type: FieldDefinition['type'],
  sortOrder: number,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  key,
  label,
  type,
  required: false,
  visible: true,
  sortOrder,
  isBuiltIn: true,
  isLocked: false,
  group: type === 'phone' || type === 'address' || type === 'email' ? 'contact' : 'basic',
  config: {},
  createdAt: T,
  updatedAt: T,
  ...extra,
})

export const maritalOptions = () =>
  ['未婚', '已婚', '离异', '丧偶', '其他'].map((label, i) => ({
    id: `opt_marital_${i}`,
    label,
    color: ['#5B6573', '#0F9D8F', '#B4530A', '#7C4DFF', '#5B6573'][i],
  }))

export const hobbyOptions = () =>
  ['阅读', '旅行', '运动', '音乐', '电影', '美食', '摄影', '游戏', '健身', '收藏'].map((label, i) => ({
    id: `opt_hobby_${i}`,
    label,
    color: ['#2F6FEB', '#0F9D8F', '#2E7D32', '#7C4DFF', '#E4574C', '#B4530A', '#5B6573', '#C2185B', '#0F9D8F', '#2F6FEB'][i],
  }))

export function createDefaultFieldDefinitions(): FieldDefinition[] {
  return [
    mk('avatar', '头像', 'attachment', 0, {
      config: { multiple: false, maxFiles: 1, acceptedMimeTypes: 'image/*' },
    }),
    mk('name', '姓名', 'text', 1, {
      required: true,
      isLocked: true,
      config: { maxLength: 200 },
    }),
    mk('phones', '联系方式', 'phone', 2, {
      required: true,
      isLocked: true,
      group: 'contact',
      config: { multiple: true },
    }),
    mk('addresses', '地址', 'address', 3, { group: 'contact', config: { multiple: true } }),
    mk('birthday', '年龄与生日', 'date', 4, {
      config: { hasTime: false, dateFormat: 'YYYY年M月D日' },
    }),
    mk('company', '公司/单位', 'text', 5, { config: { maxLength: 200 } }),
    mk('maritalStatus', '婚姻状况', 'select', 6, { config: { options: maritalOptions() } }),
    mk('hobbies', '爱好', 'multiselect', 7, { config: { options: hobbyOptions() } }),
    mk('city', '城市', 'text', 8, { config: { maxLength: 60 } }),
    mk('tags', '标签', 'multiselect', 9, { config: { options: [] } }),
    mk('groups', '群组', 'select', 10, { config: { options: [] } }),
    mk('relatedPersons', '关联人', 'personRef', 11, { config: { multiple: true } }),
    mk('timeline', '互动记录', 'timeline', 12, { isLocked: true, group: 'basic' }),
    mk('referrer', '引荐人', 'personRef', 10.5, { isLocked: true, group: 'basic', config: { multiple: false } }),
  ]
}

export function createDefaultGroups(): Group[] {
  const names = ['同事', '客户', '投资人', '朋友', '家人', '其他']
  const keys = ['colleague', 'customer', 'investor', 'friend', 'family', 'other']
  return names.map((name, i) => ({
    id: `grp_${keys[i]}`,
    name,
    color: GROUP_COLORS[i],
    sortOrder: i,
  }))
}

export function createDefaultSmartViews(): SmartView[] {
  const t = nowISO()
  return [
    {
      id: 'view_all',
      name: '全部人脉',
      icon: 'users',
      color: '#2F6FEB',
      filter: { kind: 'group', id: uid('g'), logic: 'and', children: [] },
      reminderEnabled: false,
      isSystem: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'view_recent',
      name: '最近添加',
      icon: 'clock',
      color: '#0F9D8F',
      filter: {
        kind: 'group',
        id: uid('g'),
        logic: 'and',
        children: [
          { kind: 'condition', id: uid('c'), fieldKey: '__createdWithin', operator: 'activeWithin', value: 30 },
        ],
      },
      reminderEnabled: false,
      isSystem: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'view_incomplete',
      name: '待补全信息',
      icon: 'alert',
      color: '#B4530A',
      filter: {
        kind: 'group',
        id: uid('g'),
        logic: 'and',
        children: [
          { kind: 'condition', id: uid('c'), fieldKey: '__completeness', operator: 'lt', value: 60 },
        ],
      },
      reminderEnabled: false,
      isSystem: true,
      createdAt: t,
      updatedAt: t,
    },
  ]
}

export function createDefaultSettings(): Settings {
  return {
    profile: { nickname: '我', bio: '', company: '', city: '', phone: null, email: null, address: null },
    smartViews: createDefaultSmartViews(),
    reminderPolicy: {
      defaultFrequencyDays: 30,
      pushTime: '09:00',
      anniversaryAdvanceDays: 3,
      ignoreDecayEnabled: true,
      sortMode: 'lastInteraction',
    },
    auditLog: [],
    lastBackupAt: null,
    contactChannels: DEFAULT_CONTACT_CHANNELS.map((c) => ({ ...c })),
  }
}

interface DemoPersonOpts {
  createdDaysAgo?: number
  reminderFrequencyDays?: number | null
  tags?: string[]
  birthday?: string
  marital?: string
  hobbies?: string[]
  fields?: Record<string, unknown>
}

export interface DemoBundle {
  groups: Group[]
  persons: Person[]
  todos: Todo[]
  anniversaries: Anniversary[]
  timelineEvents: TimelineEvent[]
  tags: Tag[]
  extraFields: FieldDefinition[]
}

/** 演示数据：让首次打开即可看到完整能力（可一键清空） */
const DEMO_TAG_NAMES = ['投资', '咖啡', '产品', '媒体', '校友', '设计', '摄影', '技术', '客户', '招聘', '创业', '家人']
const demoTags = (): Tag[] =>
  DEMO_TAG_NAMES.map((name, i) => ({ id: `tag_${i}`, name, usageCount: 0 }))
const demoTagId = (name: string): string => {
  const idx = DEMO_TAG_NAMES.indexOf(name)
  return idx >= 0 ? `tag_${idx}` : name
}

export function buildDemoData(): DemoBundle {
  const p = (
    id: string,
    name: string,
    group: string,
    company: string,
    city: string,
    phones: string[],
    opts: DemoPersonOpts = {},
  ): Person => ({
    id,
    createdAt: isoAt(opts.createdDaysAgo ?? 90),
    updatedAt: nowISO(),
    reminderFrequencyDays: opts.reminderFrequencyDays ?? null,
    ignoredReminders: 0,
    fields: {
      name,
      company,
      city,
      groups: group,
      phones: phones.map((n) => ({ label: 'mobile', number: n })),
      addresses: [],
      maritalStatus: opts.marital ?? '',
      hobbies: opts.hobbies ?? [],
      tags: (opts.tags ?? []).map(demoTagId),
      relatedPersons: [],
      referrer: '',
      ...(opts.birthday ? { birthday: { value: opts.birthday, hasTime: false } } : {}),
      ...(opts.fields ?? {}),
    },
  })

  const persons: Person[] = [
    p('person_wangzhenhua', '王振华', 'grp_investor', '晨山资本', '上海', ['13801380001'], {
      createdDaysAgo: 400,
      reminderFrequencyDays: 30,
      tags: ['投资', '咖啡'],
      birthday: '1978-04-12',
      marital: 'opt_marital_1',
      hobbies: ['opt_hobby_0', 'opt_hobby_5'],
    }),
    p('person_lijing', '李静', 'grp_customer', '星辰科技', '深圳', ['13901390002'], {
      createdDaysAgo: 300,
      reminderFrequencyDays: 14,
      tags: ['产品', '媒体'],
      birthday: '1990-09-08',
      marital: 'opt_marital_1',
      hobbies: ['opt_hobby_1', 'opt_hobby_4'],
    }),
    p('person_zhangsan', '张三', 'grp_colleague', '存知科技', '深圳', ['13701370003'], {
      createdDaysAgo: 260,
      reminderFrequencyDays: 30,
      tags: ['产品', '校友'],
      birthday: '1992-01-20',
      marital: 'opt_marital_0',
      hobbies: ['opt_hobby_3'],
    }),
    p('person_wangwu', '王五', 'grp_friend', '自由摄影师', '杭州', ['13601360004'], {
      createdDaysAgo: 240,
      tags: ['设计', '摄影'],
      birthday: '1988-11-03',
      hobbies: ['opt_hobby_6', 'opt_hobby_1'],
    }),
    p('person_chenmo', '陈墨', 'grp_customer', '云图数据', '北京', ['13501350005'], {
      createdDaysAgo: 210,
      reminderFrequencyDays: 45,
      tags: ['技术', '客户'],
      birthday: '1985-06-25',
      marital: 'opt_marital_1',
      hobbies: ['opt_hobby_2', 'opt_hobby_0'],
    }),
    p('person_zhaomin', '赵敏', 'grp_colleague', '存知科技', '深圳', ['13401340006'], {
      createdDaysAgo: 200,
      tags: ['招聘'],
      birthday: '1993-03-14',
      hobbies: ['opt_hobby_8'],
    }),
    p('person_sunyiming', '孙一鸣', 'grp_investor', '远望创投', '北京', ['13301330007'], {
      createdDaysAgo: 180,
      reminderFrequencyDays: 60,
      tags: ['投资'],
      birthday: '1975-12-01',
    }),
    p('person_zhouke', '周可', 'grp_friend', '拾光咖啡', '深圳', ['13201320008'], {
      createdDaysAgo: 160,
      tags: ['咖啡', '创业'],
      birthday: '1991-07-19',
      hobbies: ['opt_hobby_5', 'opt_hobby_3'],
    }),
    p('person_wufan', '吴凡', 'grp_other', '南风设计', '广州', ['13101310009'], {
      createdDaysAgo: 140,
      tags: ['设计'],
      birthday: '1989-02-11',
      hobbies: ['opt_hobby_6'],
    }),
    p('person_zhengnan', '郑楠', 'grp_family', '—', '深圳', ['13001300010'], {
      createdDaysAgo: 120,
      tags: ['家人'],
      birthday: '1966-05-30',
      marital: 'opt_marital_1',
    }),
    p('person_linche', '林澈', 'grp_customer', '海岸文旅', '厦门', ['18888880011'], {
      createdDaysAgo: 90,
      tags: ['客户'],
      birthday: '1987-08-22',
    }),
    p('person_heyu', '何雨', 'grp_other', '第一财经', '上海', ['18888880012'], {
      createdDaysAgo: 60,
      tags: ['媒体'],
      birthday: '1994-10-05',
    }),
    p('person_xulie', '徐冽', 'grp_customer', '北斗物流', '成都', [], {
      createdDaysAgo: 40,
      tags: [],
    }),
    p('person_tangyi', '唐一', 'grp_other', '未知', '—', [], { createdDaysAgo: 20 }),
  ]

  const byId = (id: string) => persons.find((x) => x.id === id)!
  byId('person_lijing').fields.referrer = 'person_wangzhenhua'
  byId('person_zhangsan').fields.referrer = 'person_lijing'
  byId('person_chenmo').fields.referrer = 'person_wangzhenhua'
  byId('person_linche').fields.referrer = 'person_lijing'
  byId('person_zhouke').fields.referrer = 'person_wangwu'
  byId('person_heyu').fields.referrer = 'person_zhangsan'
  byId('person_sunyiming').fields.referrer = 'person_wangzhenhua'
  byId('person_wangzhenhua').fields.relatedPersons = ['person_sunyiming', 'person_chenmo']
  byId('person_lijing').fields.relatedPersons = ['person_zhangsan', 'person_linche', 'person_heyu']
  byId('person_zhangsan').fields.relatedPersons = ['person_zhaomin', 'person_heyu']
  byId('person_zhaomin').fields.relatedPersons = ['person_zhangsan']
  byId('person_zhouke').fields.relatedPersons = ['person_wangwu', 'person_wufan']
  byId('person_wufan').fields.relatedPersons = ['person_wangwu']
  byId('person_chenmo').fields.relatedPersons = ['person_sunyiming']

  const tags: Tag[] = demoTags().map((t) => ({
    ...t,
    usageCount: persons.filter((p) => ((p.fields.tags as string[]) ?? []).includes(t.id)).length,
  }))

  const extraFields: FieldDefinition[] = [
    {
      ...mk('custom_role', '职务', 'text', 20, { group: 'custom', config: { maxLength: 60 } }),
      isBuiltIn: false,
    },
    {
      ...mk('custom_web', '个人主页', 'link', 21, { group: 'custom' }),
      isBuiltIn: false,
    },
    {
      /* 名片码由本人资料就地生成（vCard 文本），不存链接、不联网 */
      ...mk('custom_card', '名片码', 'barcode', 22, { group: 'custom', config: { source: 'personCard' } }),
      isBuiltIn: false,
    },
  ]

  byId('person_wangzhenhua').fields.custom_role = '合伙人'
  byId('person_wangzhenhua').fields.custom_web = {
    url: 'https://example.com/wangzhenhua',
    displayText: '个人主页',
  }
  byId('person_lijing').fields.custom_role = '市场总监'
  byId('person_zhangsan').fields.custom_role = '产品经理'
  byId('person_chenmo').fields.custom_role = 'CTO'
  byId('person_linche').fields.custom_role = '总经理'
  byId('person_tangyi').fields.maritalStatus = 'opt_marital_removed'

  const timelineEvents: TimelineEvent[] = []
  const ev = (
    personId: string,
    type: TimelineEvent['type'],
    content: string,
    daysAgo: number,
    channel?: string,
  ) => {
    timelineEvents.push({
      id: uid('ev'),
      personId,
      type,
      content,
      occurredAt: isoAt(daysAgo),
      channel,
    })
  }
  ev('person_wangzhenhua', 'note', '聊了他新募的二期基金，关注企业服务方向。', 42)
  ev('person_wangzhenhua', 'reach_out', '电话沟通：约了下月一起看两个项目。', 42, '电话')
  ev('person_lijing', 'note', '她对数据看板的需求很明确，下周发一版原型给她。', 20)
  ev('person_lijing', 'note', '提到团队今年扩招，可能需要招聘支持。', 8)
  ev('person_zhangsan', 'note', '一起过了 Q3 的产品路线图，重点在名片卡交互。', 6)
  ev('person_zhangsan', 'reach_out', '微信沟通：确认周五评审时间。', 3, '微信')
  ev('person_wangwu', 'note', '他在筹备一个关于城市夜景的摄影展，11 月开幕。', 70)
  ev('person_chenmo', 'reach_out', '见面：在云图办公室聊了数据合规的合作点。', 55, '见面')
  ev('person_chenmo', 'note', '他们 Q4 会采购一批外部数据服务。', 55)
  ev('person_zhaomin', 'note', '同步了两个岗位的候选人情况。', 15)
  ev('person_sunyiming', 'note', '他更关注早期项目，建议下次带 BP 过去。', 95)
  ev('person_zhouke', 'note', '店里新到了一批耶加雪菲，下次去试试。', 26)
  ev('person_wufan', 'note', '帮他介绍了两个品牌设计的活。', 110)
  ev('person_zhengnan', 'note', '周末回家吃饭，聊了体检报告的事。', 12)
  ev('person_linche', 'note', '海岸文旅想做会员体系，先出个轻量方案。', 34)
  ev('person_heyu', 'note', '她在写一篇关于个人数据主权的稿子，聊了很久。', 5)
  ev('person_zhangsan', 'todo_completed', '完成待办：把名片卡背面字段整理成文档', 10)
  ev('person_lijing', 'anniversary', '合作周年：认识一周年', 30)
  ev('person_xulie', 'note', '活动上交换了名片，还没细聊。', 38)

  const todos: Todo[] = [
    {
      id: uid('todo'),
      title: '把新版名片卡原型发给李静',
      personId: 'person_lijing',
      dueDate: dateAt(0),
      priority: 'important',
      done: false,
      createdAt: isoAt(2),
    },
    {
      id: uid('todo'),
      title: '约陈墨喝咖啡，聊数据合作',
      personId: 'person_chenmo',
      dueDate: dateAt(2),
      priority: 'normal',
      done: false,
      createdAt: isoAt(1),
    },
    {
      id: uid('todo'),
      title: '整理上周活动收到的名片',
      personId: null,
      dueDate: dateAt(-1),
      priority: 'normal',
      done: false,
      createdAt: isoAt(4),
    },
    {
      id: uid('todo'),
      title: '回复何雨的采访问题',
      personId: 'person_heyu',
      dueDate: dateAt(4),
      priority: 'normal',
      done: false,
      createdAt: isoAt(2),
    },
  ]

  const anniversaries: Anniversary[] = [
    {
      id: uid('ann'),
      personId: 'person_lijing',
      type: 'birthday',
      label: '生日',
      date: dateAt(2).slice(5),
      advanceDays: 3,
    },
    {
      id: uid('ann'),
      personId: 'person_zhengnan',
      type: 'birthday',
      label: '生日',
      date: dateAt(5).slice(5),
      advanceDays: 3,
    },
    {
      id: uid('ann'),
      personId: 'person_chenmo',
      type: 'cooperation',
      label: '合作周年',
      date: dateAt(6).slice(5),
      advanceDays: 3,
    },
  ]

  return { groups: createDefaultGroups(), persons, todos, anniversaries, timelineEvents, tags, extraFields }
}

export const FREQUENCY_OPTIONS: { label: string; days: number | null }[] = [
  { label: '每周', days: 7 },
  { label: '每两周', days: 14 },
  { label: '每月', days: 30 },
  { label: '每季度', days: 90 },
  { label: '每半年', days: 180 },
  { label: '每年', days: 365 },
  { label: '不提醒', days: 0 },
]

export const ANNIVERSARY_TYPES: { value: Anniversary['type']; label: string }[] = [
  { value: 'birthday', label: '生日' },
  { value: 'work', label: '入职纪念日' },
  { value: 'cooperation', label: '合作周年' },
  { value: 'custom', label: '自定义纪念日' },
]
