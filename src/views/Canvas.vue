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
        <el-button size="small" @click="addNode('scene')">＋集成</el-button>
        <el-button size="small" @click="togglePalette">素材面板</el-button>
        <el-button size="small" @click="addNode('audio')">＋音乐</el-button>
        <el-button size="small" @click="addNode('subtitle')">＋字幕</el-button>
        <el-button size="small" @click="addNode('hot')">＋热点</el-button>
      </el-button-group>
      <el-button v-if="projectId" size="small" @click="organize">⚡ 一键整理</el-button>
      <el-button v-if="projectId" size="small" @click="kbVisible = true">⌨️ 快捷键</el-button>
      <el-button v-if="projectId" type="primary" size="small" :loading="saving" @click="save">
        保存{{ dirty ? ' *' : '' }}
      </el-button>
      <el-button v-if="projectId" size="small" :loading="autoPlanning" @click="autoPlan">🤖 自动编排</el-button>
      <el-button v-if="projectId" size="small" @click="aiFromCanvas">AI 生成脚本</el-button>
      <el-button v-if="projectId" size="small" :loading="exporting" @click="exportJianying">导出剪映草稿</el-button>
      <el-button v-if="projectId" size="small" @click="timelinePreviewVisible = true">▶ 预览</el-button>
      <span class="tip">双击素材节点设置入点/变速，点击连线设置转场</span>
    </div>

    <div class="flow-wrap" v-loading="loading" @dragover.prevent @drop="onCanvasDrop">
      <!-- 素材面板：拖到画布创建素材节点，拖进集成节点则加入该节点 -->
      <div v-if="paletteVisible" class="palette">
        <div class="palette-head">
          <span>素材面板</span>
          <el-button text size="small" @click="paletteVisible = false">收起</el-button>
        </div>
        <div class="palette-body">
          <div class="palette-sec">视频</div>
          <div class="palette-grid">
            <div
              v-for="m in paletteItems"
              :key="m.id"
              class="palette-item"
              draggable="true"
              @dragstart="onPaletteDragStart($event, { kind: 'video', mediaId: m.id, filename: m.filename, note: m.note || '' })"
            >
              <img :src="thumbUrl(m.id)" loading="lazy" />
              <span>{{ m.filename }}</span>
            </div>
            <div v-if="!paletteItems.length" class="palette-empty">媒体库没有素材</div>
          </div>
          <div class="palette-sec">音乐</div>
          <div class="palette-grid">
            <div
              v-for="m in paletteMusic"
              :key="m.id"
              class="palette-item music"
              draggable="true"
              @dragstart="onPaletteDragStart($event, { kind: 'audio', musicId: m.id, filename: m.filename, volume: 0.25 })"
            >
              <span class="palette-icon">🎵</span>
              <span>{{ m.filename }}</span>
            </div>
            <div v-if="!paletteMusic.length" class="palette-empty">音乐库为空</div>
          </div>
          <div class="palette-sec">字幕</div>
          <div class="palette-grid">
            <div
              class="palette-item subtitle"
              draggable="true"
              @dragstart="onPaletteDragStart($event, { kind: 'subtitle', text: '', font: '' })"
            >
              <span class="palette-icon">💬</span>
              <span>新字幕卡</span>
            </div>
          </div>
        </div>
      </div>
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-viewport="{ zoom: 1 }"
        :connection-radius="100"
        :disable-keyboard-a11y="true"
        :zoom-on-double-click="false"
        fit-view-on-init
        @nodesChange="onNodesChange"
        @edgesChange="markDirty"
        @connect="onConnect"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClickEvent"
        @node-drag-stop="onNodeDragStop"
        @edge-click="onEdgeClick"
        @pane-click="clearSelection"
      >
        <Background pattern-color="#3a3a4a" :gap="20" />
        <Controls />
        <MiniMap />
        <template #node-plot="props"><PlotNode v-bind="props" @edit="openEdit" /></template>
        <template #node-role="props"><RoleNode v-bind="props" @edit="openEdit" /></template>
        <template #node-video="props"><VideoNode v-bind="props" @inspect="inspectNode" /></template>
        <template #node-scene="props"><SceneNode v-bind="props" @inspect="inspectNode" @drop-media="onDropToScene" /></template>
        <template #node-audio="props"><AudioNode v-bind="props" @inspect="inspectNode" /></template>
        <template #node-subtitle="props"><SubtitleNode v-bind="props" @edit="openEdit" /></template>
        <template #node-hot="props"><HotNode v-bind="props" /></template>
      </VueFlow>
    </div>

    <el-empty v-if="!projectId && !loading" description="选择或新建一个项目开始梳理剧情" style="margin-top: 120px" />

    <!-- 节点编辑 -->
    <el-dialog v-model="editVisible" title="编辑节点" width="520px">
      <el-form label-width="60px">
        <el-form-item label="标题"><el-input v-model="editForm.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="editForm.content" type="textarea" :rows="6" /></el-form-item>
        <el-form-item v-if="editType === 'subtitle'" label="字体">
          <el-select v-model="editForm.font" placeholder="默认（抖音美好体）" clearable style="width: 100%">
            <el-option v-for="f in fonts" :key="f" :label="f" :value="f" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-popconfirm title="删除该节点？" @confirm="deleteNode">
          <template #reference><el-button type="danger" plain>删除节点</el-button></template>
        </el-popconfirm>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 素材选择：带封面的预览网格 -->
    <el-dialog v-model="videoPickVisible" title="选择视频素材" width="860px" append-to-body>
      <div class="pick-grid">
        <div v-for="m in mediaFiles" :key="m.id" class="pick-card" @click="pickVideo(m)">
          <div class="pick-thumb">
            <img :src="thumbUrl(m.id)" loading="lazy" />
            <span v-if="m.duration" class="pick-badge dur">{{ fmtDur(m.duration) }}</span>
            <span v-if="m.orientation" class="pick-badge ratio" :class="m.orientation">{{ ratioText(m) }}</span>
          </div>
          <div class="pick-name" :title="m.filename">{{ m.filename }}</div>
          <div v-if="m.note" class="pick-note">{{ m.note }}</div>
        </div>
        <div v-if="!mediaFiles.length" class="pick-empty">媒体库里还没有素材，先去媒体库扫描</div>
      </div>
    </el-dialog>

    <!-- 音乐选择 -->
    <el-dialog v-model="musicPickVisible" title="选择背景音乐" width="560px" append-to-body>
      <div class="pick-music-list">
        <div v-for="m in musicFiles" :key="m.id" class="pick-music" @click="pickMusic(m)">
          <span class="pick-music-icon">🎵</span>
          <span class="pick-music-name" :title="m.filename">{{ m.filename }}</span>
          <span class="pick-music-ext">{{ (m.ext || '').toUpperCase() }}</span>
        </div>
        <div v-if="!musicFiles.length" class="pick-empty">音乐库里还没有音乐</div>
      </div>
    </el-dialog>

    <!-- 集成节点：独立无限画布 -->
    <el-dialog
      v-model="boardVisible"
      :title="`🧩 集成节点 · ${sceneBoardNodes.length} 个卡片`"
      width="86vw"
      top="4vh"
      destroy-on-close
    >
      <div class="board-toolbar">
        <el-button size="small" @click="openVideoPick(null, 'board')">＋素材</el-button>
        <el-button size="small" @click="openMusicPick(null, 'board')">＋音乐</el-button>
        <el-button size="small" @click="addBoardSubtitle">＋字幕</el-button>
        <span class="board-tip">自由摆放卡片，导出时按从左到右、从上到下的顺序拼接</span>
      </div>
      <el-input
        v-model="sceneNote"
        type="textarea"
        :rows="2"
        resize="none"
        placeholder="剧情说明（可选）：这段场景想表达什么。只作为集成节点的说明，不参与成片"
        style="margin-bottom: 10px"
      />
      <div class="board-wrap">
        <VueFlow
          id="scene-board"
          v-model:nodes="sceneBoardNodes"
          :nodes-connectable="false"
          :edges-updatable="false"
          :zoom-on-double-click="false"
          :min-zoom="0.3"
          :max-zoom="2"
          :default-viewport="{ zoom: 0.9 }"
          fit-view-on-init
        >
          <Background pattern-color="#dbe7ff" :gap="18" />
          <Controls />
          <template #node-scene-item="props">
            <SceneItemNode v-bind="props" @remove="removeBoardItem" />
          </template>
        </VueFlow>
        <div v-if="!sceneBoardNodes.length" class="board-empty">点上方按钮添加素材 / 音乐 / 字幕卡片</div>
      </div>
      <template #footer>
        <el-button @click="boardVisible = false">取消</el-button>
        <el-button type="primary" @click="saveBoard">保存</el-button>
      </template>
    </el-dialog>

    <!-- 时间轴效果预览（不生成草稿） -->
    <el-dialog v-model="timelinePreviewVisible" title="效果预览（时间轴）" width="92vw" top="3vh" destroy-on-close>
      <PreviewPlayer v-if="timelinePreviewVisible" :project-id="projectId" />
    </el-dialog>

    <!-- 视频预览 -->
    <el-dialog v-model="previewVisible" width="820px" top="4vh" :title="previewing?.filename" destroy-on-close>
      <div v-if="previewFailed" class="play-fallback">
        <p>浏览器无法播放该视频编码（通常是 HEVC/H.265），剪映可以正常使用。</p>
        <el-button type="primary" @click="openExternal">用系统播放器打开</el-button>
      </div>
      <video v-else :src="mediaUrl(previewing.mediaId)" controls autoplay style="width: 100%; max-height: 70vh" @error="previewFailed = true" />
      <div v-if="!previewFailed" style="margin-top: 12px; display: flex; gap: 12px; align-items: center">
        <el-button size="small" @click="openExternal">用系统播放器打开</el-button>
        <span style="color: var(--el-text-color-secondary); font-size: 12px">浏览器无法解码 HEVC/H.265 时，请用系统播放器观看</span>
      </div>
    </el-dialog>

    <!-- AI 生成 -->
    <el-dialog v-model="aiVisible" title="根据画布生成脚本" width="720px" top="5vh">
      <el-input v-model="aiResult" type="textarea" :rows="14" v-loading="aiGenerating" placeholder="将把画布上的剧情节点内容作为剧情笔记，点击开始生成（素材、音乐、字幕不参与脚本）" />
      <template #footer>
        <el-button type="primary" :loading="aiGenerating" @click="doAiGenerate">开始生成</el-button>
        <el-button :disabled="!aiResult" @click="saveAiScript">保存为脚本</el-button>
      </template>
    </el-dialog>
    <!-- 镜头 / 转场设置 -->
    <el-drawer v-model="inspectorVisible" :title="inspectorTitle" size="360px" destroy-on-close>
      <el-form v-if="inspectorType === 'video'" label-position="top">
        <el-form-item label="入点（秒）">
          <el-input-number v-model="nodeForm.inPoint" :min="0" :precision="1" :step="0.5" style="width: 100%" />
        </el-form-item>
        <el-form-item label="出点（秒，0 表示到结尾）">
          <el-input-number v-model="nodeForm.outPoint" :min="0" :precision="1" :step="0.5" style="width: 100%" />
        </el-form-item>
        <el-form-item label="速度">
          <el-select v-model="nodeForm.speed" style="width: 100%">
            <el-option v-for="s in speeds" :key="s" :label="`${s}x`" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="音量">
          <el-slider v-model="nodeForm.volume" :min="0" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="调色滤镜">
          <el-select v-model="nodeForm.filter" style="width: 100%">
            <el-option label="跟随项目默认" value="" />
            <el-option v-for="f in filters" :key="f" :label="f" :value="f" />
          </el-select>
        </el-form-item>
        <el-alert type="info" :closable="false" title="出点超过素材时长时自动截断；变速后的片段时长会自动换算" />
      </el-form>
      <el-form v-else-if="inspectorType === 'audio'" label-position="top">
        <el-form-item label="背景音乐音量">
          <el-slider v-model="audioForm.volume" :min="0" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-alert type="info" :closable="false" title="音乐节点会覆盖全局 BGM，导出时从片头开始铺满全片，并自动淡入淡出" />
      </el-form>
      <el-form v-else label-position="top">
        <el-form-item label="转场类型（作用于该镜头之后）">
          <el-select v-model="edgeForm.transition" style="width: 100%">
            <el-option v-for="t in transitions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="转场时长（秒）">
          <el-input-number v-model="edgeForm.transitionDuration" :min="0.1" :max="2" :step="0.1" style="width: 100%" />
        </el-form-item>
        <el-alert type="info" :closable="false" title="选择「无」表示两个镜头之间硬切" />
      </el-form>
      <template #footer>
        <el-button @click="inspectorVisible = false">取消</el-button>
        <el-button type="primary" @click="applyInspector">应用</el-button>
      </template>
    </el-drawer>

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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ElMessage, ElMessageBox } from 'element-plus'
import api, { mediaUrl, thumbUrl } from '../api'
import PlotNode from '../components/canvas/PlotNode.vue'
import RoleNode from '../components/canvas/RoleNode.vue'
import VideoNode from '../components/canvas/VideoNode.vue'
import SceneNode from '../components/canvas/SceneNode.vue'
import SceneItemNode from '../components/canvas/SceneItemNode.vue'
import PreviewPlayer from '../components/canvas/PreviewPlayer.vue'
import AudioNode from '../components/canvas/AudioNode.vue'
import SubtitleNode from '../components/canvas/SubtitleNode.vue'
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
const exporting = ref(false)
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
  // 点击素材节点直接预览视频
  if (node.type === 'video' && node.data?.mediaId) openPreview(node)
}

// 视频预览
const previewVisible = ref(false)
const previewing = ref(null)
const previewFailed = ref(false)
const timelinePreviewVisible = ref(false)
function openPreview(node) {
  previewing.value = node.data
  previewFailed.value = false
  previewVisible.value = true
}
async function openExternal() {
  await api.post(`/media/open/${previewing.value.mediaId}`)
}
function clearSelection() {
  selectedIds.clear()
  lastClickId.value = null
}

/* ---------------- 素材面板与拖拽 ---------------- */
const paletteVisible = ref(false)
const paletteItems = ref([])
const paletteMusic = ref([])
function togglePalette() {
  paletteVisible.value = !paletteVisible.value
  if (paletteVisible.value) {
    api.get('/media/list').then(({ data }) => (paletteItems.value = data.items || []))
    api.get('/music/list').then(({ data }) => (paletteMusic.value = data.items || data || []))
  }
}
function onPaletteDragStart(e, payload) {
  const raw = JSON.stringify(payload)
  e.dataTransfer.setData('application/x-creator-media', raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'copy'
}
function appendSceneItem(sceneId, payload) {
  nodes.value = nodes.value.map((n) =>
    n.id === sceneId ? { ...n, data: { ...n.data, items: [...(n.data?.items || []), payload] } } : n,
  )
  markDirty()
  ElMessage.success('已加入集成节点')
}
function onDropToScene({ id, payload }) {
  appendSceneItem(id, payload)
}
function onCanvasDrop(e) {
  const raw =
    e.dataTransfer?.getData('application/x-creator-media') || e.dataTransfer?.getData('text/plain')
  if (!raw) return
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }
  const pos = screenToFlowCoordinate({ x: e.clientX, y: e.clientY })
  if (payload.kind === 'video') {
    nodes.value.push({
      id: `n${++nodeSeq}`,
      type: 'video',
      position: { x: pos.x, y: pos.y },
      data: { mediaId: payload.mediaId, filename: payload.filename, note: payload.note || '' },
    })
  } else if (payload.kind === 'audio') {
    nodes.value.push({
      id: `n${++nodeSeq}`,
      type: 'audio',
      position: { x: pos.x, y: pos.y },
      data: { musicId: payload.musicId, filename: payload.filename, volume: payload.volume ?? 0.25 },
    })
  } else if (payload.kind === 'subtitle') {
    nodes.value.push({
      id: `n${++nodeSeq}`,
      type: 'subtitle',
      position: { x: pos.x, y: pos.y },
      data: { title: '新字幕', content: '', font: '' },
    })
  } else {
    return
  }
  markDirty()
}
function inspectNode(id) {
  const node = nodes.value.find((n) => n.id === id)
  if (node) onNodeDblClick({ node })
}
// Vue Flow 自带的节点双击事件（比节点内部原生 dblclick 更可靠）
function onNodeDoubleClickEvent({ node }) {
  const current = nodes.value.find((n) => n.id === node.id) || node
  onNodeDblClick({ node: current })
}
// 把画布上的剧情/素材/音乐/字幕节点拖进集成节点
function onNodeDragStop({ node }) {
  if (!['plot', 'video', 'audio', 'subtitle'].includes(node.type)) return
  const drag = nodes.value.find((n) => n.id === node.id)
  if (!drag) return
  const w = node.dimensions?.width || 220
  const h = node.dimensions?.height || 120
  const cx = node.position.x + w / 2
  const cy = node.position.y + h / 2
  const scene = nodes.value.find((n) => {
    if (n.type !== 'scene' || n.id === node.id) return false
    const sw = n.dimensions?.width || 420
    const sh = n.dimensions?.height || 320
    return cx >= n.position.x && cx <= n.position.x + sw && cy >= n.position.y && cy <= n.position.y + sh
  })
  if (!scene) return
  // 剧情节点不进成片，作为集成节点的说明文字
  if (drag.type === 'plot') {
    const text = `${drag.data.title ? `${drag.data.title}：` : ''}${drag.data.content || ''}`.trim()
    if (!text) return
    const oldNote = (scene.data?.note || '').trim()
    nodes.value = nodes.value
      .filter((n) => n.id !== drag.id)
      .map((n) => (n.id === scene.id ? { ...n, data: { ...n.data, note: [oldNote, text].filter(Boolean).join('\n') } } : n))
    edges.value = edges.value.filter((e) => e.source !== drag.id && e.target !== drag.id)
    markDirty()
    ElMessage.success('剧情已作为集成节点说明')
    return
  }
  let item = null
  if (drag.type === 'video') {
    item = {
      kind: 'video',
      mediaId: drag.data.mediaId,
      filename: drag.data.filename,
      note: drag.data.note || '',
      inPoint: drag.data.inPoint,
      outPoint: drag.data.outPoint,
      speed: drag.data.speed,
      volume: drag.data.volume,
      filter: drag.data.filter,
    }
  } else if (drag.type === 'audio') {
    item = { kind: 'audio', musicId: drag.data.musicId, filename: drag.data.filename, volume: drag.data.volume }
  } else if (drag.type === 'subtitle') {
    item = { kind: 'subtitle', text: drag.data.content || drag.data.title, font: drag.data.font || '' }
  }
  if (!item) return
  nodes.value = nodes.value
    .filter((n) => n.id !== drag.id)
    .map((n) => (n.id === scene.id ? { ...n, data: { ...n.data, items: [...(n.data?.items || []), item] } } : n))
  edges.value = edges.value.filter((e) => e.source !== drag.id && e.target !== drag.id)
  markDirty()
  ElMessage.success('已移入集成节点')
}

/* ---------------- 集成节点画布 ---------------- */
const boardVisible = ref(false)
const boardSceneId = ref(null)
const sceneBoardNodes = ref([])
const sceneNote = ref('')
let boardSeq = 0

function boardPosition(index) {
  return { x: 40 + (index % 3) * 240, y: 40 + Math.floor(index / 3) * 190 }
}
function addBoardItem(payload) {
  sceneBoardNodes.value.push({
    id: `sb${++boardSeq}`,
    type: 'scene-item',
    position: boardPosition(sceneBoardNodes.value.length),
    data: { ...payload },
  })
}
function openSceneBoard(node) {
  boardSceneId.value = node.id
  boardSeq = 0
  sceneNote.value = node.data?.note || ''
  const items = node.data?.items || []
  sceneBoardNodes.value = items.map((it, i) => ({
    id: `sb${++boardSeq}`,
    type: 'scene-item',
    position: it.position && it.position.x != null ? { ...it.position } : boardPosition(i),
    data: { ...it },
  }))
  boardVisible.value = true
}
function addBoardSubtitle() {
  addBoardItem({ kind: 'subtitle', text: '', font: '' })
}
function removeBoardItem(id) {
  sceneBoardNodes.value = sceneBoardNodes.value.filter((n) => n.id !== id)
}
function saveBoard() {
  // 按位置排序（从左到右、从上到下），并记住卡片位置便于下次还原
  const items = [...sceneBoardNodes.value]
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .map((n) => ({ ...n.data, position: { ...n.position } }))
  nodes.value = nodes.value.map((n) =>
    n.id === boardSceneId.value ? { ...n, data: { ...n.data, items, note: sceneNote.value.trim() } } : n,
  )
  boardVisible.value = false
  markDirty()
  ElMessage.success(`已更新集成节点（${items.length} 个卡片）`)
}

/* ---------------- 镜头 / 转场设置 ---------------- */
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const fonts = ['抖音美好体', '思源粗宋', '站酷文艺体', '得意黑', '庞门正道标题体', '无界黑', '优设标题黑', '未来黑', '快乐体']
const filters = ['清透自然', '暖食', '情感电影', '日系奶油', '清晰明亮', '高清黑白']
const transitions = ['无', '叠化', '闪白', '推近', '快涂擦除', '模糊', '闪黑']
const inspectorVisible = ref(false)
const inspectorType = ref('video')
const editingNodeId = ref(null)
const nodeForm = ref({ inPoint: 0, outPoint: 0, speed: 1, volume: 1, filter: '' })
const audioForm = ref({ volume: 0.25 })
const edgeForm = ref({ id: '', transition: '叠化', transitionDuration: 0.5 })
const inspectorTitle = computed(() => {
  const node = nodes.value.find((n) => n.id === editingNodeId.value)
  if (inspectorType.value === 'video') return `镜头设置 · ${node?.data?.filename || ''}`
  if (inspectorType.value === 'audio') return `背景音乐 · ${node?.data?.filename || ''}`
  return '连线转场设置'
})

function onNodeDblClick({ node }) {
  if (node.type === 'scene') {
    openSceneBoard(node)
    return
  }
  if (node.type === 'audio') {
    inspectorType.value = 'audio'
    editingNodeId.value = node.id
    audioForm.value = { volume: node.data?.volume != null ? Number(node.data.volume) : 0.25 }
    inspectorVisible.value = true
    return
  }
  if (node.type !== 'video') return
  inspectorType.value = 'video'
  editingNodeId.value = node.id
  nodeForm.value = {
    inPoint: Number(node.data?.inPoint) || 0,
    outPoint: Number(node.data?.outPoint) || 0,
    speed: Number(node.data?.speed) || 1,
    volume: node.data?.volume != null ? Number(node.data.volume) : 1,
    filter: node.data?.filter || '',
  }
  inspectorVisible.value = true
}

function onEdgeClick({ edge }) {
  inspectorType.value = 'edge'
  edgeForm.value = {
    id: edge.id,
    transition: edge.data?.transition || '叠化',
    transitionDuration: Number(edge.data?.transitionDuration) || 0.5,
  }
  inspectorVisible.value = true
}

function applyInspector() {
  if (inspectorType.value === 'audio') {
    const volume = audioForm.value.volume
    nodes.value = nodes.value.map((n) =>
      n.id === editingNodeId.value ? { ...n, data: { ...n.data, volume } } : n,
    )
  } else if (inspectorType.value === 'video') {
    const f = nodeForm.value
    nodes.value = nodes.value.map((n) =>
      n.id === editingNodeId.value
        ? {
            ...n,
            data: {
              ...n.data,
              inPoint: f.inPoint || 0,
              outPoint: f.outPoint || 0,
              speed: f.speed || 1,
              volume: f.volume,
              filter: f.filter || '',
            },
          }
        : n,
    )
  } else {
    const f = edgeForm.value
    edges.value = edges.value.map((e) =>
      e.id === f.id
        ? { ...e, data: { ...e.data, transition: f.transition, transitionDuration: f.transitionDuration } }
        : e,
    )
  }
  inspectorVisible.value = false
  markDirty()
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
  if (kbVisible.value || editVisible.value || videoPickVisible.value || musicPickVisible.value || boardVisible.value || aiVisible.value) return
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
    subtitle: { title: '新字幕', content: '在这里写字幕文字…' },
    scene: { title: '集成节点', items: [] },
  }
  if (type === 'video') return openVideoPick(center)
  if (type === 'audio') return openMusicPick(center)
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
function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function ratioText(m) {
  if (!m.width || !m.height) return ''
  const name = { portrait: '竖屏', landscape: '横屏', square: '方屏' }[m.orientation] || ''
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  const g = gcd(m.width, m.height) || 1
  return `${name} ${m.width / g}:${m.height / g}`
}
const videoPickVisible = ref(false)
const mediaFiles = ref([])
const pendingPos = ref({ x: 100, y: 100 })
const pickTarget = ref('node')
function openVideoPick(pos, target = 'node') {
  pendingPos.value = pos
  pickTarget.value = target
  api.get('/media/list').then(({ data }) => (mediaFiles.value = data.items))
  videoPickVisible.value = true
}
function pickVideo(row) {
  if (!row) return
  if (pickTarget.value === 'board') {
    addBoardItem({ kind: 'video', mediaId: row.id, filename: row.filename, note: row.note || '' })
    videoPickVisible.value = false
    return
  }
  nodes.value.push({
    id: `n${++nodeSeq}`,
    type: 'video',
    position: pendingPos.value,
    data: { mediaId: row.id, filename: row.filename, note: row.note || '' },
  })
  videoPickVisible.value = false
  markDirty()
}

// 音乐选择
const musicPickVisible = ref(false)
const musicFiles = ref([])
function openMusicPick(pos, target = 'node') {
  pendingPos.value = pos
  pickTarget.value = target
  api.get('/music/list').then(({ data }) => (musicFiles.value = data.items))
  musicPickVisible.value = true
}
function pickMusic(row) {
  if (!row) return
  if (pickTarget.value === 'board') {
    addBoardItem({ kind: 'audio', musicId: row.id, filename: row.filename, volume: 0.25 })
    musicPickVisible.value = false
    return
  }
  nodes.value.push({
    id: `n${++nodeSeq}`,
    type: 'audio',
    position: pendingPos.value,
    data: { musicId: row.id, filename: row.filename, volume: 0.25 },
  })
  musicPickVisible.value = false
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
const editType = ref('plot')
const editForm = ref({ id: '', title: '', content: '', font: '' })
function openEdit(id) {
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return
  editType.value = node.type
  editForm.value = { id, title: node.data.title || '', content: node.data.content || '', font: node.data.font || '' }
  editVisible.value = true
}
function confirmEdit() {
  const node = nodes.value.find((n) => n.id === editForm.value.id)
  if (node) {
    const { id, ...rest } = editForm.value
    if (node.type !== 'subtitle') delete rest.font
    node.data = { ...node.data, ...rest }
  }
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
  if (!nodes.value.some((n) => n.type === 'plot')) {
    ElMessage.warning('画布上还没有剧情节点，先添加剧情再生成脚本')
    return
  }
  await save(true)
  aiResult.value = ''
  aiVisible.value = true
}
async function doAiGenerate() {
  // 脚本只基于剧情节点，素材/音乐/字幕属于画布编排，不参与剧本生成
  const plots = nodes.value.filter((n) => n.type === 'plot')
  if (!plots.length) {
    ElMessage.warning('画布上还没有剧情节点')
    return
  }
  aiGenerating.value = true
  try {
    const notes = plots.map((n) => `${n.data.title || '剧情'}：${n.data.content || ''}`).join('\n')
    const { data } = await api.post('/ai/script', { notes, topic: currentProjectName() })
    aiResult.value = data.content
    if (data.degraded) ElMessage.warning('未配置 GLM Key，已返回模拟内容')
  } finally {
    aiGenerating.value = false
  }
}
function currentProjectName() {
  return projects.value.find((p) => p.id === projectId.value)?.name || ''
}
// 默认草稿名称：项目名-时间戳
function defaultDraftName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${currentProjectName() || '未命名项目'}-${stamp}`
}
// 按画布故事线生成剪映草稿
async function exportJianying() {
  let draftName
  try {
    const { value } = await ElMessageBox.prompt('草稿名称会显示在剪映的草稿列表中，同名草稿将被覆盖。', '导出剪映草稿', {
      inputValue: defaultDraftName(),
      confirmButtonText: '开始导出',
      cancelButtonText: '取消',
      inputValidator: (v) => (v && v.trim() ? true : '请输入草稿名称'),
    })
    draftName = value.trim()
  } catch {
    return
  }
  await save(true)
  exporting.value = true
  try {
    const { data } = await api.post(`/projects/${projectId.value}/export-draft`, { draftName })
    const skipped = data.skipped?.length ? `，跳过 ${data.skipped.length} 个未找到的素材` : ''
    const ratio = { portrait: '竖屏', landscape: '横屏', square: '方屏' }[data.orientation] || ''
    const size = ratio ? `（${ratio} ${data.width}×${data.height}）` : ''
    const mismatch = data.mismatched ? `，${data.mismatched} 个素材比例不同会被裁切` : ''
    ElMessage.success(`已生成剪映草稿${size}：${data.draftPath}（${data.segments} 个片段${mismatch}${skipped}）`)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '生成剪映草稿失败')
  } finally {
    exporting.value = false
  }
}
// 自动编排：按素材库重建画布故事线
const autoPlanning = ref(false)
async function autoPlan() {
  try {
    await ElMessageBox.confirm('将根据素材库自动重建画布故事线，当前画布会被覆盖，是否继续？', '自动编排', {
      type: 'warning',
      confirmButtonText: '开始',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await save(true)
  autoPlanning.value = true
  try {
    const { data } = await api.post(`/projects/${projectId.value}/auto-plan`)
    await loadProject()
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 100)
    ElMessage.success(`已编排 ${data.added} 个镜头${data.ai ? '（AI 分镜）' : '（本地规则：未配置 GLM Key）'}`)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '自动编排失败')
  } finally {
    autoPlanning.value = false
  }
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
.canvas-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.flow-wrap {
  flex: 1;
  min-height: 420px;
  position: relative;
  margin: 0 16px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}
.flow-wrap :deep(.vue-flow) { width: 100%; height: 100%; }
.toolbar { display: flex; gap: 10px; align-items: center; padding: 12px 16px; flex-wrap: wrap; }
.spacer { flex: 1; }
.tip { font-size: 12px; color: var(--el-text-color-secondary); }
.board-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.board-tip { font-size: 12px; color: var(--el-text-color-secondary); }
.board-wrap {
  position: relative;
  height: 62vh;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  background: #f7faff;
}
.board-wrap :deep(.vue-flow) { width: 100%; height: 100%; }
.board-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  pointer-events: none;
}
.palette {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 250px;
  max-height: 60vh;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.palette-head { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--el-border-color-lighter); }
.palette-body { flex: 1; overflow-y: auto; }
.palette-sec { padding: 6px 8px 2px; font-size: 11px; color: var(--el-text-color-secondary); }
.palette-grid { padding: 4px 8px 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.palette-item { cursor: grab; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; overflow: hidden; background: var(--el-fill-color-lighter); }
.palette-item img { width: 100%; height: 56px; object-fit: cover; display: block; }
.palette-item span { display: block; font-size: 10px; padding: 3px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-item.music, .palette-item.subtitle { grid-column: span 2; display: flex; align-items: center; gap: 6px; padding: 6px 8px; }
.palette-item.music span, .palette-item.subtitle span { padding: 0; }
.palette-icon { font-size: 16px; flex: 0 0 auto; }
.palette-empty { grid-column: span 2; text-align: center; font-size: 12px; color: var(--el-text-color-secondary); padding: 12px 0; }
.play-fallback { text-align: center; padding: 40px 0; color: var(--el-text-color-secondary); }
/* 素材/音乐选择弹窗：预览卡片 */
.pick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-height: 62vh; overflow-y: auto; padding-right: 4px; }
.pick-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; cursor: pointer; background: var(--el-fill-color-lighter); transition: border-color 0.15s, box-shadow 0.15s; }
.pick-card:hover { border-color: var(--el-color-primary); box-shadow: 0 2px 10px rgba(64, 158, 255, 0.25); }
.pick-thumb { position: relative; aspect-ratio: 16 / 9; background: #000; }
.pick-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pick-badge { position: absolute; padding: 0 5px; border-radius: 4px; font-size: 10px; line-height: 16px; color: #fff; background: rgba(0, 0, 0, 0.6); }
.pick-badge.dur { right: 6px; bottom: 6px; }
.pick-badge.ratio { left: 6px; top: 6px; background: rgba(64, 158, 255, 0.85); }
.pick-badge.ratio.landscape { background: rgba(230, 162, 60, 0.9); }
.pick-badge.ratio.square { background: rgba(103, 194, 58, 0.9); }
.pick-name { padding: 6px 8px 4px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-note { padding: 0 8px 6px; font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-empty { grid-column: 1 / -1; text-align: center; color: var(--el-text-color-secondary); font-size: 13px; padding: 40px 0; }
.pick-music-list { max-height: 52vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.pick-music { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; cursor: pointer; }
.pick-music:hover { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.pick-music-icon { font-size: 16px; }
.pick-music-name { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-music-ext { font-size: 11px; color: var(--el-text-color-secondary); }
</style>
