import React, { useMemo, useState } from 'react'
import { Check, ListChecks, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { Todo } from '../types'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Empty, Modal } from './ui'
import { cn, dayDiff, formatDate } from '../lib/utils'
import { personName } from '../lib/derive'

type Tab = 'all' | 'open' | 'overdue' | 'done' | 'trash'

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'all', label: '全部', hint: '所有未进回收站的待办' },
  { key: 'open', label: '进行中', hint: '还没完成的' },
  { key: 'overdue', label: '逾期', hint: '已过截止日且未完成' },
  { key: 'done', label: '已完成', hint: '已勾选完成' },
  { key: 'trash', label: '回收站', hint: '删除的待办，可恢复或彻底清除' },
]

/** 待办集中管理：首页卡片点标题进来，分类查看 / 完成 / 删除 / 回收站恢复 */
export function TodoCenter({
  open,
  onClose,
  onNew,
}: {
  open: boolean
  onClose: () => void
  onNew: () => void
}) {
  const todos = useStore((s) => s.todos)
  const persons = useStore((s) => s.persons)
  const toggleTodo = useStore((s) => s.toggleTodo)
  const deleteTodo = useStore((s) => s.deleteTodo)
  const restoreTodo = useStore((s) => s.restoreTodo)
  const purgeTodo = useStore((s) => s.purgeTodo)
  const toast = useUI((s) => s.toast)
  const [tab, setTab] = useState<Tab>('all')

  const alive = useMemo(() => todos.filter((t) => !t.deletedAt), [todos])
  const counts = useMemo(
    () => ({
      all: alive.length,
      open: alive.filter((t) => !t.done).length,
      overdue: alive.filter((t) => !t.done && dayDiff(new Date(t.dueDate)) > 0).length,
      done: alive.filter((t) => t.done).length,
      trash: todos.filter((t) => t.deletedAt).length,
    }),
    [alive, todos],
  )

  const list = useMemo(() => {
    const byDue = (a: Todo, b: Todo) => +new Date(a.dueDate) - +new Date(b.dueDate)
    switch (tab) {
      case 'open':
        return alive.filter((t) => !t.done).sort(byDue)
      case 'overdue':
        return alive.filter((t) => !t.done && dayDiff(new Date(t.dueDate)) > 0).sort(byDue)
      case 'done':
        return alive.filter((t) => t.done).sort((a, b) => +new Date(b.completedAt ?? b.dueDate) - +new Date(a.completedAt ?? a.dueDate))
      case 'trash':
        return todos.filter((t) => t.deletedAt).sort((a, b) => +new Date(b.deletedAt!) - +new Date(a.deletedAt!))
      default:
        return [...alive].sort((a, b) => Number(a.done) - Number(b.done) || byDue(a, b))
    }
  }, [tab, alive, todos])

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="待办中心"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
          <button className="btn primary" onClick={onNew}>
            <Plus size={14} /> 新建待办
          </button>
        </>
      }
    >
      <div className="tc-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={cn('tc-tab', tab === t.key && 'on')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="tc-tab-count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty
          icon={<ListChecks size={20} />}
          title={tab === 'trash' ? '回收站是空的' : '这里还没有待办'}
          desc={TABS.find((t) => t.key === tab)?.hint}
        />
      ) : (
        <div className="tc-list">
          {list.map((t) => {
            const person = t.personId ? persons.find((p) => p.id === t.personId) : null
            const overdue = !t.done && dayDiff(new Date(t.dueDate)) > 0
            return (
              <div key={t.id} className={cn('tc-row', t.done && 'done', t.deletedAt && 'trashed')}>
                <button
                  className={cn('check', t.done && 'on')}
                  aria-label={t.done ? '标记未完成' : '标记完成'}
                  disabled={!!t.deletedAt}
                  onClick={() => toggleTodo(t.id, !!t.personId)}
                >
                  {t.done && <Check size={12} strokeWidth={3} />}
                </button>
                <div className="tc-main">
                  <div className="tc-title">
                    {t.priority === 'important' && <span className="important">● </span>}
                    {t.title}
                  </div>
                  <div className="tc-sub">
                    {person && <span>{personName(person)}</span>}
                    <span className={cn(overdue && 'danger')}>
                      截止 {formatDate(t.dueDate)}
                      {overdue ? ` · 逾期 ${dayDiff(new Date(t.dueDate))} 天` : ''}
                    </span>
                    {t.deletedAt && <span>已删除</span>}
                  </div>
                </div>
                {t.deletedAt ? (
                  <div className="tc-ops">
                    <button className="btn sm" onClick={() => restoreTodo(t.id)}>
                      <RotateCcw size={12} /> 恢复
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={() => {
                        purgeTodo(t.id)
                        toast('已彻底删除', 'success')
                      }}
                    >
                      <Trash2 size={12} /> 彻底删除
                    </button>
                  </div>
                ) : (
                  <div className="tc-ops">
                    <button
                      className="btn icon sm"
                      aria-label="删除到回收站"
                      title="删除到回收站"
                      onClick={() => {
                        deleteTodo(t.id)
                        toast('已移到回收站，可在待办中心恢复', 'success')
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
