// dsh-skill-manager — Client half (React 设置页)
//
// 作为标准 cordis bundle 的客户端模块加载：
//   factory(require) 返回 { apply, inject }，框架以 cordis 插件形式调用 apply(ctx)。
//
// 功能：
//   - 在设置页左侧导航栏注入【技能】入口
//   - 点击后显示技能管理面板（独立页面区域）
//   - 支持全局 / 各工作区的 tab 切换
//   - 支持技能的导入（选择文件夹）、编辑、删除、禁用/启用
//   - 支持搜索过滤
//   - 点击技能名打开完整 SKILL.md 编辑器

window.__ModuleLoader__.load({
  id: 'dsh-skill-manager',
  factory: (require) => {
    const React = require('react')

    // ===== 工具函数 =====
    function normalizePath(p) {
      return typeof p === 'string' ? p.replace(/\\/g, '/').toLowerCase() : p
    }

    function truncate(str, maxLen) {
      if (!str) return ''
      if (str.length <= maxLen) return str
      return str.slice(0, maxLen - 3) + '...'
    }

    // Tab 样式
    function tabStyle(active, disabled, isGlobalTab) {
      return {
        padding: '4px 14px',
        borderRadius: '999px',
        border: active ? '1px solid var(--dsw-alias-border-l1)' : '1px solid transparent',
        background: active ? '#ECECEC' : 'transparent',
        color: disabled ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-label-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        fontWeight: active ? 500 : 400,
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap'
      }
    }

    // ===== 技能卡片组件（无图标版 + 禁用状态） =====
    function SkillCard({ skill, onEdit, onDelete, onToggle }) {
      const [hovered, setHovered] = React.useState(false)
      const disabled = !!skill.disabled

      return React.createElement('div', {
        style: {
          flex: '0 0 calc(50% - 6px)',
          maxWidth: 'calc(50% - 6px)',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '2px 16px 2px 12px',
          background: disabled ? '#F5F5F5' : 'white',
          border: '0.5px solid ' + (disabled ? '#E0E0E0' : 'var(--dsw-alias-border-l2)'),
          borderRadius: '10px',
          marginBottom: '4px',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box',
          overflow: 'hidden',
          opacity: disabled ? 0.7 : 1
        },
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false)
      }, [
        // 第一行：名称（左）+ 操作按钮（右）
        React.createElement('div', {
          key: 'row1',
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
        }, [
          // 技能名 + 禁用标签
          React.createElement('div', {
            key: 'name-wrap',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: 1,
              minWidth: 0
            }
          }, [
            React.createElement('div', {
              key: 'name',
              style: {
                fontSize: '14px',
                fontWeight: 500,
                color: disabled ? '#9E9E9E' : '#1a1a1a',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                textDecoration: hovered ? 'underline' : 'none',
                transition: 'text-decoration 0.15s'
              },
              onClick: () => onEdit(skill),
              title: skill.name + '\n点击编辑'
            }, skill.name),
            disabled && React.createElement('span', {
              key: 'badge',
              style: {
                flexShrink: 0,
                fontSize: '10px',
                fontWeight: 500,
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#E0E0E0',
                color: '#757575',
                whiteSpace: 'nowrap'
              }
            }, '已禁用')
          ]),

          // 右上角：启用/禁用切换按钮（常驻显示）
          React.createElement('button', {
            key: 'toggle',
            type: 'button',
            onClick: (e) => { e.stopPropagation(); onToggle(skill) },
            title: disabled ? '启用' : '禁用',
            style: {
              flexShrink: 0,
              marginLeft: 'auto',
              marginRight: '-10px',
              marginTop: '8px',
              height: '20px',
              padding: '0 14px',
              borderRadius: '10px',
              border: 'none',
              background: disabled ? '#E8F5E9' : '#EEEEEE',
              color: disabled ? '#2E7D32' : '#616161',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap'
            }
          }, disabled ? '启用' : '禁用')
        ]),

        // 第二行：描述（名称下方）
        (skill.description || skill.id) && React.createElement('div', {
          key: 'desc',
          style: {
            fontSize: '12px',
            color: disabled ? '#BDBDBD' : 'var(--dsw-alias-label-tertiary)',
            marginTop: '3px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.4',
            paddingRight: '60px'
          }
        },
          skill.description
            ? truncate(skill.description, 80)
            : ('技能目录：' + skill.id)
        ),

        // 底部：删除按钮（右下角，hover 时显示，禁用时常驻）
        React.createElement('div', {
          key: 'actions-row',
          style: {
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '6px',
            marginBottom: '8px',
            marginRight: '-10px',
            opacity: hovered ? 1 : (disabled ? 1 : 0),
            transition: 'opacity 0.15s'
          }
        }, [
          React.createElement('button', {
            key: 'delete',
            type: 'button',
            onClick: (e) => { e.stopPropagation(); onDelete(skill) },
            title: '删除',
            style: {
              height: '20px',
              width: '50px',
              padding: '0',
              borderRadius: '10px',
              border: 'none',
              background: '#FFEBEE',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#C62828',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }
          }, '\u2715')
        ])
      ])
    }

    // ===== 编辑技能弹窗（完整 SKILL.md 内容编辑） =====
    function EditSkillModal({ skill, scope, wsPath, onSave, onClose }) {
      const [content, setContent] = React.useState('')
      const [loading, setLoading] = React.useState(true)
      const [saving, setSaving] = React.useState(false)

      // 加载完整 SKILL.md 内容
      React.useEffect(() => {
        if (!skill) return
        setLoading(true)
        const qs = '?scope=' + encodeURIComponent(scope === 'global' ? 'global' : 'project') +
          '&id=' + encodeURIComponent(skill.id) +
          ((scope !== 'global' && wsPath) ? '&ws=' + encodeURIComponent(wsPath) : '')
        fetch('/skill/api/detail' + qs)
          .then((r) => r.json())
          .then((data) => {
            if (data.success && data.detail && data.detail.content) {
              setContent(data.detail.content)
            } else {
              setContent('(加载失败)')
            }
          })
          .catch(() => setContent('(网络错误)'))
          .finally(() => setLoading(false))
      }, [skill?.id, scope, wsPath])

      const handleSave = async () => {
        if (!content.trim()) return
        setSaving(true)
        try {
          await onSave({ content: content })
        } finally {
          setSaving(false)
        }
      }

      return React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000
        },
        onClick: (e) => { if (e.target === e.currentTarget) onClose() }
      }, [
        React.createElement('div', {
          key: 'modal',
          style: {
            width: '720px', maxWidth: '94vw',
            height: '78vh', maxHeight: '78vh',
            background: 'white', borderRadius: '14px',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            padding: '0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          },
          onClick: (e) => e.stopPropagation()
        }, [
          // 标题栏
          React.createElement('div', {
            key: 'header',
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '0.5px solid var(--dsw-alias-border-l2)', flexShrink: 0
            }
          }, [
            React.createElement('span', {
              key: 'title',
              style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
            }, skill ? ('编辑技能：' + skill.name) : '编辑技能'),
            React.createElement('button', {
              key: 'close', type: 'button', onClick: onClose,
              style: {
                width: '26px', height: '26px', borderRadius: '50%', border: 'none',
                background: '#F5F5F5', cursor: 'pointer', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'
              }
            }, '\u2715')
          ]),
          // 内容区：SKILL.md 全文编辑
          loading
            ? React.createElement('div', {
                key: 'loading',
                style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px' }
              }, '加载中...')
            : React.createElement('textarea', {
                key: 'editor',
                value: content,
                onChange: (e) => setContent(e.target.value),
                style: {
                  flex: 1, width: '100%', padding: '16px 20px',
                  border: 'none', outline: 'none', resize: 'none',
                  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
                  fontSize: '13px', lineHeight: '1.7',
                  color: 'var(--dsw-alias-label-primary)', background: '#FAFAFA',
                  boxSizing: 'border-box'
                },
                placeholder: 'SKILL.md 内容...'
              }),
          // 底部按钮栏
          React.createElement('div', {
            key: 'btns',
            style: {
              display: 'flex', justifyContent: 'flex-end', gap: '10px',
              padding: '12px 20px', borderTop: '0.5px solid var(--dsw-alias-border-l2)', flexShrink: 0
            }
          }, [
            React.createElement('button', {
              key: 'cancel', type: 'button', onClick: onClose,
              style: {
                padding: '8px 20px', borderRadius: '8px',
                border: '0.5px solid var(--dsw-alias-border-l2)', background: 'white',
                cursor: 'pointer', fontSize: '13px', color: 'var(--dsw-alias-label-secondary)'
              }
            }, '取消'),
            React.createElement('button', {
              key: 'save', type: 'button', onClick: handleSave,
              disabled: saving || !content.trim(),
              style: {
                padding: '8px 24px', borderRadius: '8px', border: 'none',
                background: (!content.trim()) ? '#A5D6A7' : '#4CAF50', color: 'white',
                cursor: (!content.trim()) ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 500, opacity: saving ? 0.7 : 1
              }
            }, saving ? '保存中...' : '保存')
          ])
        ])
      ])
    }

    // ===== 删除确认弹窗 =====
    function DeleteConfirm({ skill, onConfirm, onCancel }) {
      return React.createElement('div', {
        style: {
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001
        },
        onClick: (e) => { if (e.target === e.currentTarget) onCancel() }
      }, [
        React.createElement('div', {
          key: 'dialog',
          style: {
            width: '360px', background: 'white', borderRadius: '12px',
            padding: '24px', border: '0.5px solid var(--dsw-alias-border-l2)'
          }
        }, [
          React.createElement('div', {
            key: 'title',
            style: { fontSize: '15px', fontWeight: 500, marginBottom: '10px' }
          }, '确认删除'),
          React.createElement('div', {
            key: 'msg',
            style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '20px', lineHeight: '1.6' }
          }, '确定要删除技能「' + (skill ? skill.name : '') + '」吗？整个文件夹将被删除，此操作不可撤销。'),
          React.createElement('div', {
            key: 'btns',
            style: { display: 'flex', justifyContent: 'flex-end', gap: '10px' }
          }, [
            React.createElement('button', {
              key: 'cancel', type: 'button', onClick: onCancel,
              style: { padding: '7px 18px', borderRadius: '8px', border: '0.5px solid var(--dsw-alias-border-l2)', background: 'white', cursor: 'pointer', fontSize: '13px' }
            }, '取消'),
            React.createElement('button', {
              key: 'confirm', type: 'button', onClick: onConfirm,
              style: { padding: '7px 18px', borderRadius: '8px', border: 'none', background: '#EF5350', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }
            }, '删除')
          ])
        ])
      ])
    }

    // ===== 主页面组件 =====
    function SkillManagerPage({ useWorkspaces }) {
      const [activeTab, setActiveTab] = React.useState('global')
      const [skills, setSkills] = React.useState([])
      const [loading, setLoading] = React.useState(true)
      const [searchQuery, setSearchQuery] = React.useState('')
      const [workspaces, setWorkspaces] = React.useState([])

      // 弹窗状态
      const [editingSkill, setEditingSkill] = React.useState(null)
      const [deletingSkill, setDeletingSkill] = React.useState(null)
      const [importing, setImporting] = React.useState(false)
      const [toggling, setToggling] = React.useState(false)

      // 隐藏的文件夹选择器 ref
      const folderInputRef = React.useRef(null)

      const wsState = useWorkspaces()
      const wsItems = (wsState && wsState.items) || []

      // 加载工作区列表
      React.useEffect(() => {
        fetch('/skill/api/workspaces')
          .then((r) => r.json())
          .then((data) => {
            if (data.success && Array.isArray(data.workspaces)) setWorkspaces(data.workspaces)
          })
          .catch(() => {})
      }, [])

      // 默认选中当前工作区
      const [hasTouchedTab, setHasTouchedTab] = React.useState(false)
      React.useEffect(() => {
        if (!hasTouchedTab && activeTab === 'global' && wsItems.length > 0 && workspaces.length > 0) {
          const match = workspaces.find((w) => normalizePath(w.path) === normalizePath(wsItems[0].path))
          if (match) setActiveTab(match.path)
        }
      }, [workspaces, wsItems, hasTouchedTab, activeTab])

      // 加载技能列表
      const loadSkills = React.useCallback(() => {
        setLoading(true)
        const isGlobal = activeTab === 'global'
        const qs = (!isGlobal && activeTab)
          ? `?scope=project&ws=${encodeURIComponent(activeTab)}`
          : '?scope=global'
        fetch('/skill/api/list' + qs)
          .then((r) => r.json())
          .then((data) => {
            if (data.success) setSkills(Array.isArray(data.skills) ? data.skills : [])
            else setSkills([])
          })
          .catch(() => setSkills([]))
          .finally(() => setLoading(false))
      }, [activeTab])

      React.useEffect(() => { loadSkills() }, [loadSkills])

      const isGlobal = activeTab === 'global'

      // 过滤
      const filtered = searchQuery.trim()
        ? skills.filter((s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : skills

      // 导入操作：使用 File System Access API 获取真实目录句柄，递归读取整个目录树后发送给服务端创建
      const handleImportClick = async () => {
        if (!('showDirectoryPicker' in window)) {
          // 降级：使用隐藏的 file input（webkitdirectory）
          if (folderInputRef.current) folderInputRef.current.click()
          return
        }
        setImporting(true)
        try {
          const dirHandle = await window.showDirectoryPicker()
          let hasSkillMd = false
          const files = [] // { path, content }
          // 递归读取目录下所有文件
          const walk = async (handle, relPath) => {
            for await (const [name, entry] of handle.entries()) {
              const cur = relPath ? relPath + '/' + name : name
              if (entry.kind === 'file') {
                if (name === 'SKILL.md') hasSkillMd = true
                try {
                  const f = await entry.getFile()
                  const text = await f.text()
                  files.push({ path: cur, content: text })
                } catch { /* 二进制或读取失败跳过 */ }
              } else if (entry.kind === 'directory') {
                // 跳过隐藏目录（如 .git）
                if (name.startsWith('.')) continue
                await walk(entry, cur)
              }
            }
          }
          await walk(dirHandle, '')
          if (!hasSkillMd) {
            alert('所选文件夹不包含 SKILL.md')
            return
          }
          const r = await fetch('/skill/api/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              scope: isGlobal ? 'global' : 'project',
              ws: (!isGlobal && activeTab) ? activeTab : undefined,
              sourcePath: dirHandle.name,
              files
            })
          })
          const result = await r.json()
          if (result.success) {
            loadSkills()
          } else {
            alert(result.error || '导入失败')
          }
        } catch (err) {
          if (err.name === 'AbortError') return
          alert('导入错误：' + err.message)
        } finally {
          setImporting(false)
        }
      }

      // 降级：webkitdirectory 文件选择回调（旧浏览器）
      const handleFolderSelected = async (e) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        const folderName = files[0].webkitRelativePath.split('/')[0]
        setImporting(true)
        try {
          const r = await fetch('/skill/api/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              scope: isGlobal ? 'global' : 'project',
              ws: (!isGlobal && activeTab) ? activeTab : undefined,
              sourcePath: folderName
            })
          })
          const result = await r.json()
          if (result.success) {
            loadSkills()
          } else {
            alert(result.error || '导入失败')
          }
        } catch (err) {
          alert('网络错误：' + err.message)
        } finally {
          setImporting(false)
          if (folderInputRef.current) folderInputRef.current.value = ''
        }
      }

      // 编辑操作（发送完整 SKILL.md 内容）
      const handleUpdate = async (data) => {
        if (!editingSkill) return
        const body = { scope: isGlobal ? 'global' : 'project', id: editingSkill.id, ...data }
        if (!isGlobal && activeTab) body.ws = activeTab
        const r = await fetch('/skill/api/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
        const result = await r.json()
        if (result.success) {
          setEditingSkill(null)
          loadSkills()
        }
      }

      // 删除操作
      const handleDelete = async () => {
        if (!deletingSkill) return
        const body = { scope: isGlobal ? 'global' : 'project', id: deletingSkill.id }
        if (!isGlobal && activeTab) body.ws = activeTab
        const r = await fetch('/skill/api/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
        const result = await r.json()
        if (result.success) {
          setDeletingSkill(null)
          loadSkills()
        }
      }

      // 启用/禁用切换
      const handleToggle = async (skill) => {
        if (!skill || toggling) return
        setToggling(true)
        try {
          const body = { scope: isGlobal ? 'global' : 'project', id: skill.id }
          if (!isGlobal && activeTab) body.ws = activeTab
          const r = await fetch('/skill/api/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
          })
          const result = await r.json()
          if (result.success) loadSkills()
          else alert(result.error || '操作失败')
        } catch (err) {
          alert('网络错误：' + err.message)
        } finally {
          setToggling(false)
        }
      }

      return React.createElement('div', {
        style: { padding: '0', height: '100%', display: 'flex', flexDirection: 'column' }
      }, [
        // 隐藏的文件夹选择器
        React.createElement('input', {
          key: 'hidden-folder-input',
          ref: folderInputRef,
          type: 'file',
          webkitdirectory: '',
          directory: '',
          style: { display: 'none' },
          onChange: handleFolderSelected
        }),

        // Row 1: 标题
        React.createElement('div', {
          key: 'header',
          style: { padding: '16px 20px 0' }
        }, [
          React.createElement('h2', {
            key: 'title',
            style: { fontSize: '16px', fontWeight: 500, margin: 0, color: 'var(--dsw-alias-label-primary)' }
          }, '技能管理')
        ]),

        // Row 2: 搜索框
        React.createElement('div', {
          key: 'search-row',
          style: { padding: '10px 20px 0' }
        }, [
          React.createElement('input', {
            key: 'search',
            type: 'text',
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            placeholder: '搜索技能...',
            style: {
              width: '280px', height: '34px', padding: '0 14px 0 34px',
              borderRadius: '17px', border: '0.5px solid var(--dsw-alias-border-l2)',
              fontSize: '12px', outline: 'none',
              background: "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23BBB%22 stroke-width=%222%22><circle cx=%2211%22 cy=%2211%22 r=%228%22/><line x1=%2216%22 y1=%2216%22 x2=%2222%22 y2=%2222%22/></svg>') no-repeat 12px center",
              boxSizing: 'border-box'
            }
          })
        ]),

        // Row 3: Tab 栏
        React.createElement('div', {
          key: 'tabs',
          style: {
            padding: '12px 20px 0',
            display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center'
          }
        }, [
          React.createElement('button', {
            key: 'tab-global', type: 'button',
            onClick: () => { setHasTouchedTab(true); setActiveTab('global') },
            style: tabStyle(isGlobal, false, true)
          }, '全局'),
          workspaces.length > 0
            ? workspaces.map((w) =>
                React.createElement('button', {
                  key: 'tab-ws-' + w.path, type: 'button',
                  onClick: () => { setHasTouchedTab(true); setActiveTab(w.path) },
                  style: tabStyle(activeTab === w.path, false, false)
                }, w.title || w.path.split(/[\\/]/).pop())
              )
            : null
        ].filter(Boolean)),

        // 分隔线
        React.createElement('div', {
          key: 'sep',
          style: { height: '0.5px', background: 'var(--dsw-alias-border-l2)', margin: '12px 20px 0' }
        }),

        // 内容区：技能列表
        React.createElement('div', {
          key: 'list-area',
          style: { flex: 1, overflowY: 'auto', padding: '12px 20px' }
        }, [
          loading
            ? React.createElement('div', {
                key: 'loading',
                style: { textAlign: 'center', padding: '40px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px' }
              }, '加载中...')
            : filtered.length === 0
              ? React.createElement('div', {
                  key: 'empty',
                  style: { textAlign: 'center', padding: '48px 0', color: 'var(--dsw-alias-label-tertiary)' }
                }, [
                    React.createElement('div', { key: 'icon', style: { fontSize: '36px', marginBottom: '10px', opacity: 0.4 } }, '\uD83D\uDCC1'),
                    React.createElement('div', { key: 'text', style: { fontSize: '13px' } },
                      searchQuery.trim() ? '没有匹配的技能' : '暂无技能，点击下方按钮导入'
                    )
                  ])
              : React.createElement('div', {
                  key: 'grid',
                  style: { display: 'flex', flexWrap: 'wrap', gap: '12px' }
                }, filtered.map((skill) =>
                  React.createElement(SkillCard, {
                    key: skill.id,
                    skill,
                    onEdit: (s) => setEditingSkill(s),
                    onDelete: (s) => setDeletingSkill(s),
                    onToggle: (s) => handleToggle(s)
                  })
                )),

          // 导入按钮
          !loading && React.createElement('button', {
            key: 'add-btn',
            type: 'button',
            onClick: handleImportClick,
            disabled: importing,
            style: {
              width: '100%', height: '48px', marginTop: '12px', borderRadius: '10px',
              border: '1.2px dashed #4CAF50',
              background: '#F0F9F0',
              cursor: importing ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 500,
              color: '#2E7D32',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', opacity: importing ? 0.6 : 1
            },
            onMouseEnter: (e) => { e.currentTarget.style.background = '#4CAF50'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderStyle = 'solid'; },
            onMouseLeave: (e) => { e.currentTarget.style.background = '#F0F9F0'; e.currentTarget.style.color = '#2E7D32'; e.currentTarget.style.borderStyle = 'dashed'; }
          }, [
            React.createElement('span', { key: 'plus', style: { fontSize: '16px' } }, '+'),
            importing ? '导入中...' : '导入技能'
          ]),

          // 底部信息
          !loading && React.createElement('div', {
            key: 'footer',
            style: {
              display: 'flex', justifyContent: 'space-between',
              marginTop: '12px', fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)'
            }
          }, [
            React.createElement('span', { key: 'count' },
              '共 ' + skills.length + ' 个' + (isGlobal ? '全局' : '项目') + '技能'
            ),
            React.createElement('span', { key: 'hint' }, '点击技能名编辑')
          ])
        ]),

        // 弹窗层
        editingSkill && React.createElement(EditSkillModal, {
          key: 'edit-el',
          skill: editingSkill,
          scope: isGlobal ? 'global' : 'project',
          wsPath: activeTab,
          onSave: handleUpdate,
          onClose: () => setEditingSkill(null)
        }),
        deletingSkill && React.createElement(DeleteConfirm, {
          key: 'del-el',
          skill: deletingSkill,
          onConfirm: handleDelete,
          onCancel: () => setDeletingSkill(null)
        })
      ])
    }

    // ===== 注册到 DSH 设置系统 =====
    function apply(ctx) {
      const workspaces = ctx.get ? ctx.get('workspaces') : null
      const useWorkspaces = workspaces && workspaces.useWorkspaces
        ? workspaces.useWorkspaces
        : () => ({ items: [] })

      ctx.slots.inject('settings.section', () => {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'skill-manager',
          order: 70,
          label: () => '技能',
          inject: () => ({ useWorkspaces })
        }, (props) => React.createElement(SkillManagerPage, props))
      })
    }

    return { apply, inject: ['slots', 'workspaces'] }
  }
})
