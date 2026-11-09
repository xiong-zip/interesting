<template>
  <div class="canvas-page">
    <div class="toolbar">
      <el-select v-model="projectId" placeholder="选择项目" style="width: 200px" @change="loadProject">
        <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-button @click="newProject">新建项目</el-button>
      <div class="spacer" />
      <el-button-group v-if="projectId">
        <el-button size="small" @click="addNode('plot')">＋剧情</el-button>
        <el-button size="small" @click="addNode('role')">＋角色</el-button>
        <el-button size="small" @click="addNode('video')">＋素材</el-button>
        <el-button size="small" @click="addNode('hot')">＋热点</el-button>
      </el-button-group>
      <el-button v-if="projectId" size="small" @click="organize">⚡ 一键整理</el-button>
      <el-button v-if="projectId" size="small" @click="kbVisible = true">⌨️ 快捷键</el-button>
      <el-button v-if="projectId" type="primary" size="small" :loading="saving" @click="save">
        保存{{ dirty ? ' *' : '' }}
      </el-button>
      <el-button v-if="projectId" size="small" @click="aiFromCanvas">AI 生成脚本</el-button>
    </div>

    <div class="flow-wrap" v-loading="loading">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-viewport="{ zoom: 1 }"
        :connection-radius="100"
        :disable-keyboard-a11y="true"
        fit-view-on-init
        @nodesChange="onNodesChange"
        @edgesChange="markDirty"
        @connect="onConnect"
        @node-click="onNodeClick"
        @pane-click="clearSelection"
      >
        <Background pattern-color="#3a3a4a" :gap="20" />
        <Controls />
        <MiniMap />
        <template #node-plot="props"><PlotNode v-bind="props" @edit="openEdit" /></template>
        <template #node-role="props"><RoleNode v-bind="props" @edit="openEdit" /></template>
        <template #node-video="props"><VideoNode v-bind="props" /></template>
        <template #node-hot="props"><HotNode v-bind="props" /></template>
      </VueFlow>
    </div>

    <el-empty v-if="!projectId && !loading" description="选择或新建一个项目开始梳理剧情" style="margin-top: 120px" />

    <!-- 节点编辑 -->
    <el-dialog v-model="editVisible" title="编辑节点" width="520px">
      <el-form label-width="60px">
        <el-form-item label="标题"><el-input v-model="editForm.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="editForm.content" type="textarea" :rows="6" /></el-form-item>
      </el-form>
      <template #footer>
        <el-popconfirm title="删除该节点？" @confirm="deleteNode">
          <template #reference><el-button type="danger" plain>删除节点</el-button></template>
        </el-popconfirm>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 素材选择 -->
    <el-dialog v-model="videoPickVisible" title="选择视频素材" width="520px">
      <el-table :data="mediaFiles" height="320" highlight-current-row @current-change="pickVideo">
        <el-table-column prop="filename" label="文件名" />
        <el-table-column prop="note" label="备注" width="160" />
      </el-table>
    </el-dialog>

    <!-- AI 生成 -->
    <el-dialog v-model="aiVisible" title="根据画布生成脚本" width="720px" top="5vh">
      <el-input v-model="aiResult" type="textarea" :rows="14" v-loading="aiGenerating" placeholder="将把画布所有节点内容作为剧情笔记，点击开始生成" />
      <template #footer>
        <el-button type="primary" :loading="aiGenerating" @click="doAiGenerate">开始生成</el-button>
        <el-button :disabled="!aiResult" @click="saveAiScript">保存为脚本</el-button>
      </template>
    </el-dialog>
    <!-- 快捷键设置 -->
    <el-dialog v-model="kbVisible" title="⌨️ 画布快捷键" width="520px">
      <el-alert
        type="info"
        :closable="false"
        title="方向键始终可用于移动；按住 Shift 一次移动 100px（默认 20px）；选中节点时移动节点，未选中时平移画布"
        style="margin-bottom: 12px"
      />
      <el-table :data="kbRows" size="small">
        <el-table-column prop="label" label="动作" />
        <el-table-column label="按键" width="160">
          <template #default="{ row }">
            <el-button size="small" :type="capturingAction === row.action ? 'warning' : 'default'" @click="capturingAction = row.action">
              {{ capturingAction === row.action ? '按下新按键…' : keyLabel(keys[row.action]) }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="" width="80">
          <template #default="{ row }">
            <el-button size="small" text @click="resetKey(row.action)">重置</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="resetAllKeys">恢复默认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'
import PlotNode from '../components/canvas/PlotNode.vue'
import RoleNode from '../components/canvas/RoleNode.vue'
import VideoNode from '../components/canvas/VideoNode.vue'
import HotNode from '../components/canvas/HotNode.vue'

const router = useRouter()
const route = useRoute()
const { fitView, screenToFlowCoordinate, panBy } = useVueFlow()

// 当前视口中心（转换成画布坐标），用于新节点默认落点
function viewCenter() {
  const el = document.querySelector('.vue-flow')
  if (!el) return { x: 100, y: 100 }
  const rect = el.getBoundingClientRect()
  return screenToFlowCoordinate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
}

// 一键整理：按连线关系拓扑分层，横向流程图布局
// 连线决定先后（列），同层节点纵向对齐，未连接的节点归到最右侧一列
function organize() {
  if (!nodes.value.length) return
  const ids = nodes.value.map((n) => n.id)
  const idSet = new Set(ids)
  const incoming = new Map(ids.map((id) => [id, 0]))
  const children = new Map(ids.map((id) => [id, []]))
  for (const e of edges.value) {
    if (idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target) {
      children.get(e.source).push(e.target)
      incoming.set(e.target, incoming.get(e.target) + 1)
    }
  }

  // Kahn 拓扑排序，同时计算最长路径深度（决定所在列）
  const depth = new Map(ids.map((id) => [id, -1]))
  const indeg = new Map(incoming)
  const queue = ids.filter((id) => indeg.get(id) === 0)
  queue.forEach((id) => depth.set(id, 0))
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const c of children.get(id)) {
      depth.set(c, Math.max(depth.get(c), depth.get(id) + 1))
      indeg.set(c, indeg.get(c) - 1)
      if (indeg.get(c) === 0) queue.push(c)
    }
  }

  // 环上节点（depth=-1）与完全孤立的节点 → 最右侧独立列
  const orphanSet = new Set(
    ids.filter((id) => depth.get(id) === -1 || (incoming.get(id) === 0 && children.get(id).length === 0)),
  )
  const columns = new Map()
  let maxD = -1
  for (const id of order) {
    if (orphanSet.has(id)) continue
    const d = depth.get(id)
    maxD = Math.max(maxD, d)
    if (!columns.has(d)) columns.set(d, [])
    columns.get(d).push(id)
  }
  if (orphanSet.size) columns.set(maxD + 1, [...orphanSet])

  const COL_W = 300
  const ROW_H = 180
  const posMap = new Map()
  for (const [d, col] of columns) {
    col.forEach((id, i) => posMap.set(id, { x: d * COL_W, y: i * ROW_H }))
  }
  nodes.value = nodes.value.map((n) =>
    posMap.has(n.id) ? { ...n, position: posMap.get(n.id) } : n,
  )
  markDirty()
  ElMessage.success('已整理布局')
  setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
}
const projects = ref([])
const projectId = ref(Number(localStorage.getItem('lastProject')) || null)
const nodes = ref([])
const edges = ref([])
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
let saveTimer = null

function markDirty() {
  dirty.value = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(true), 2000) // 自动保存
}

// 拖拽连线：把新连接写入 edges
function onConnect(params) {
  if (!params?.source || !params.target || params.source === params.target) return
  const exists = edges.value.some((e) => e.source === params.source && e.target === params.target)
  if (!exists) {
    edges.value.push({
      id: `e${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      target: params.target,
      animated: true,
    })
    markDirty()
  }
}

/* ---------------- 快捷键 ---------------- */
// 默认绑定：WASD 移动 / Q 详情 / E 删除；方向键始终作为移动别名
const KB_LABELS = { up: '上移', down: '下移', left: '左移', right: '右移', detail: '节点详情', delete: '删除节点' }
const DEFAULT_KEYS = { up: 'w', down: 's', left: 'a', right: 'd', detail: 'q', delete: 'e' }
const keys = ref({ ...DEFAULT_KEYS, ...JSON.parse(localStorage.getItem('canvas_kb') || '{}') })

const selectedIds = new Set()
const lastClickId = ref(null)
const kbVisible = ref(false)
const capturingAction = ref(null)

function onNodesChange(changes) {
  markDirty()
  for (const c of changes) {
    if (c.type === 'select') {
      if (c.selected) {
        selectedIds.add(c.id)
        lastClickId.value = c.id
      } else {
        selectedIds.delete(c.id)
      }
    }
  }
}
function onNodeClick({ node }) {
  lastClickId.value = node.id
  selectedIds.add(node.id)
}
function clearSelection() {
  selectedIds.clear()
  lastClickId.value = null
}

function moveSelected(dx, dy) {
  if (!selectedIds.size) {
    // 未选中节点：移动键平移画布（"推画布"语义：按右 → 画布整体右移，与移动节点方向一致）
    panBy({ x: dx, y: dy })
    return
  }
  nodes.value = nodes.value.map((n) =>
    selectedIds.has(n.id)
      ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
      : n,
  )
  markDirty()
}

async function confirmDeleteNode(id) {
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return
  const name = node.data?.title || node.data?.filename || id
  await ElMessageBox.confirm(`删除节点「${name}」及其连线？`, '二次确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  nodes.value = nodes.value.filter((n) => n.id !== id)
  edges.value = edges.value.filter((e) => e.source !== id && e.target !== id)
  selectedIds.delete(id)
  if (lastClickId.value === id) lastClickId.value = null
  markDirty()
}

function onKeydown(e) {
  // 快捷键录入模式：下一个按键作为新绑定
  if (capturingAction.value) {
    e.preventDefault()
    assignKey(e)
    return
  }
  // 任意弹窗打开时不响应快捷键
  if (kbVisible.value || editVisible.value || videoPickVisible.value || aiVisible.value) return
  if (document.querySelector('.el-message-box')) return
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return

  const key = e.key.toLowerCase()
  const step = e.shiftKey ? 100 : 20
  if (key === 'arrowup' || key === keys.value.up) {
    e.preventDefault(); moveSelected(0, -step)
  } else if (key === 'arrowdown' || key === keys.value.down) {
    e.preventDefault(); moveSelected(0, step)
  } else if (key === 'arrowleft' || key === keys.value.left) {
    e.preventDefault(); moveSelected(-step, 0)
  } else if (key === 'arrowright' || key === keys.value.right) {
    e.preventDefault(); moveSelected(step, 0)
  } else if (key === keys.value.detail) {
    if (lastClickId.value) openEdit(lastClickId.value)
  } else if (key === keys.value.delete) {
    if (lastClickId.value) confirmDeleteNode(lastClickId.value)
  }
}

function assignKey(e) {
  const action = capturingAction.value
  const key = e.key.toLowerCase()
  if (key === 'escape') {
    capturingAction.value = null
    return
  }
  const valid = /^[a-z0-9]$/.test(key) || key.startsWith('arrow')
  if (!valid) {
    ElMessage.warning('仅支持字母、数字或方向键')
    return
  }
  const conflict = Object.entries(keys.value).find(([a, k]) => a !== action && k === key)
  if (conflict) {
    ElMessage.warning(`「${KB_LABELS[conflict[0]]}」已占用该按键`)
    return
  }
  keys.value[action] = key
  localStorage.setItem('canvas_kb', JSON.stringify(keys.value))
  capturingAction.value = null
  ElMessage.success(`「${KB_LABELS[action]}」已设为 ${keyLabel(key)}`)
}

function keyLabel(key) {
  const map = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', ' ': 'Space' }
  return map[key] || key.toUpperCase()
}
function resetKey(action) {
  keys.value[action] = DEFAULT_KEYS[action]
  localStorage.setItem('canvas_kb', JSON.stringify(keys.value))
  capturingAction.value = null
}
function resetAllKeys() {
  keys.value = { ...DEFAULT_KEYS }
  localStorage.setItem('canvas_kb', JSON.stringify({}))
  capturingAction.value = null
  ElMessage.success('已恢复默认')
}
const kbRows = Object.keys(KB_LABELS).map((action) => ({ action, label: KB_LABELS[action] }))

async function loadProjects() {
  const { data } = await api.get('/projects/list')
  projects.value = data.items
  const exists = (pid) => data.items.some((p) => p.id === pid)
  // 路由参数优先（/canvas/:projectId），其次记住的项目，最后取第一个
  const routePid = Number(route.params.projectId)
  if (routePid && exists(routePid)) {
    projectId.value = routePid
    loadProject()
  } else if (exists(projectId.value)) {
    loadProject()
  } else if (data.items.length) {
    projectId.value = data.items[0].id
    loadProject()
  } else {
    projectId.value = null
    nodes.value = []
    edges.value = []
    localStorage.removeItem('lastProject')
  }
}

// 路由参数变化时切换项目（/canvas/2 → /canvas/4）
watch(
  () => route.params.projectId,
  (pid) => {
    const n = Number(pid)
    if (n && n !== projectId.value) {
      projectId.value = n
      loadProject()
    }
  },
)

async function loadProject() {
  if (!projectId.value) return
  loading.value = true
  try {
    const { data } = await api.get(`/projects/${projectId.value}`)
    const canvas = typeof data.canvas === 'string' ? JSON.parse(data.canvas || '{}') : data.canvas || {}
    // 清理历史数据里可能残留的选中态
    nodes.value = (canvas.nodes || []).map(({ selected, ...rest }) => rest)
    edges.value = canvas.edges || []
    dirty.value = false
    localStorage.setItem('lastProject', String(projectId.value))
  } finally {
    loading.value = false
  }
}

async function newProject() {
  const { value } = await ElMessageBox.prompt('项目名称', '新建项目', { inputPattern: /.+/, inputErrorMessage: '必填' })
  const { data } = await api.post('/projects', { name: value })
  await loadProjects()
  projectId.value = data.id
  await loadProject()
}

async function save(auto = false) {
  if (!projectId.value) return
  saving.value = true
  try {
    // 剥离 selected/dragging 等瞬态属性，避免选中状态被持久化
    const clean = (list) => list.map(({ selected, dragging, resizing, ...rest }) => rest)
    await api.put(`/projects/${projectId.value}`, {
      canvas: { nodes: clean(nodes.value), edges: clean(edges.value) },
    })
    dirty.value = false
    if (!auto) ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

let nodeSeq = Date.now()
function addNode(type) {
  nodeSeq++
  // 落在视口中心，连续添加时左右错开避免叠住连接点
  const c = viewCenter()
  const center = {
    x: c.x - 110 + (nodeSeq % 2) * 250,
    y: c.y - 60 + (nodeSeq % 2) * 30,
  }
  const defaults = {
    plot: { title: '新剧情节点', content: '在这里写下这一段剧情/分镜的构思…' },
    role: { title: '新角色', content: '人物设定：性格、目标、口头禅…' },
  }
  if (type === 'video') return openVideoPick(center)
  if (type === 'hot') return openHotPick(center)
  nodes.value.push({
    id: `n${nodeSeq}`,
    type,
    position: center,
    data: defaults[type],
  })
  markDirty()
}

// 素材选择
const videoPickVisible = ref(false)
const mediaFiles = ref([])
const pendingPos = ref({ x: 100, y: 100 })
function openVideoPick(pos) {
  pendingPos.value = pos
  api.get('/media/list').then(({ data }) => (mediaFiles.value = data.items))
  videoPickVisible.value = true
}
function pickVideo(row) {
  if (!row) return
  nodes.value.push({
    id: `n${++nodeSeq}`,
    type: 'video',
    position: pendingPos.value,
    data: { mediaId: row.id, filename: row.filename, note: row.note || '' },
  })
  videoPickVisible.value = false
  markDirty()
}

// 热点选择
async function openHotPick(pos) {
  const { data } = await api.get('/hot/list')
  const items = (data.items || []).slice(0, 30)
  const { value } = await ElMessageBox({
    title: '选择热点',
    message: `<div style="max-height:320px;overflow:auto">${items.map((i, idx) => `<p style="cursor:pointer;margin:6px 0" data-idx="${idx}">🔥 [${i.platformName}] ${i.title}</p>`).join('')}</div>`,
    dangerouslyUseHTMLString: true,
    showCancelButton: true,
    showConfirmButton: false,
  }).catch(() => null)
  const clicked = document.querySelector('.el-message-box [data-idx]:hover')
  const idx = clicked?.dataset.idx ?? value
  if (idx == null) return
  const item = items[Number(idx)]
  if (!item) return
  nodes.value.push({
    id: `n${++nodeSeq}`,
    type: 'hot',
    position: pos,
    data: { title: item.title, platform: item.platformName, url: item.url },
  })
  markDirty()
}

// 编辑节点
const editVisible = ref(false)
const editForm = ref({ id: '', title: '', content: '' })
function openEdit(id) {
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return
  editForm.value = { id, title: node.data.title || '', content: node.data.content || '' }
  editVisible.value = true
}
function confirmEdit() {
  const node = nodes.value.find((n) => n.id === editForm.value.id)
  if (node) node.data = { ...node.data, ...editForm.value }
  editVisible.value = false
  markDirty()
}
function deleteNode() {
  nodes.value = nodes.value.filter((n) => n.id !== editForm.value.id)
  edges.value = edges.value.filter((e) => e.source !== editForm.value.id && e.target !== editForm.value.id)
  editVisible.value = false
  markDirty()
}

// AI 生成
const aiVisible = ref(false)
const aiGenerating = ref(false)
const aiResult = ref('')
async function aiFromCanvas() {
  await save(true)
  aiResult.value = ''
  aiVisible.value = true
}
async function doAiGenerate() {
  aiGenerating.value = true
  try {
    const notes = nodes.value
      .filter((n) => n.type !== 'video')
      .map((n) => `[${labelOf(n.type)}] ${n.data.title || n.data.filename || ''}：${n.data.content || n.data.note || ''}`)
      .join('\n')
    const videos = nodes.value.filter((n) => n.type === 'video').map((n) => ({ filename: n.data.filename, note: n.data.note }))
    const { data } = await api.post('/ai/script', { notes, videos, topic: currentProjectName() })
    aiResult.value = data.content
    if (data.degraded) ElMessage.warning('未配置 GLM Key，已返回模拟内容')
  } finally {
    aiGenerating.value = false
  }
}
function labelOf(type) {
  return { plot: '剧情', role: '角色', hot: '热点', video: '素材' }[type] || type
}
function currentProjectName() {
  return projects.value.find((p) => p.id === projectId.value)?.name || ''
}
async function saveAiScript() {
  const { data: saved } = await api.post('/scripts', { title: `${currentProjectName()} · 画布生成`, content: aiResult.value, projectId: projectId.value, source: 'ai' })
  // 分镜自动追加到当前画布下方
  const { data: cv } = await api.post(`/scripts/${saved.id}/to-canvas`, { projectId: projectId.value })
  if (cv.added > 0) {
    ElMessage.success(`已保存脚本，${cv.added} 个分镜已追加到画布`)
    await loadProject()
  } else {
    ElMessage.success('已保存到脚本管理')
  }
  aiVisible.value = false
}

onMounted(() => {
  loadProjects()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(saveTimer)
})
</script>

<style scoped>
.canvas-page { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; gap: 10px; align-items: center; padding: 12px 16px; }
.spacer { flex: 1; }
.flow-wrap { flex: 1; position: relative; border: 1px solid var(--el-border-color); border-radius: 8px; margin: 0 16px 16px; overflow: hidden; }
</style>
