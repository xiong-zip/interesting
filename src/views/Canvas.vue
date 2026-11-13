<template>
  <div class="canvas-page">
    <div class="toolbar">
      <el-select :model-value="projectId" placeholder="选择项目" style="width: 220px" @change="switchProject">
        <el-option v-for="p in projectOptions" :key="p.id" :label="projectLabel(p)" :value="p.id" />
      </el-select>
      <el-link
        v-if="orphanCount"
        type="info"
        :underline="false"
        class="orphan-toggle"
        @click="showOrphanProjects = !showOrphanProjects"
      >
        {{ showOrphanProjects ? '隐藏' : '显示' }}{{ orphanCount }} 个脚本已删除的画布
      </el-link>
      <el-button @click="newProject">新建项目</el-button>
      <el-button v-if="projectId" type="danger" plain @click="removeProject">删除项目</el-button>
      <div class="spacer" />
      <el-button-group v-if="projectId">
        <el-button size="small" @click="addNode('plot')">＋剧情</el-button>
        <el-button size="small" @click="addNode('role')">＋角色</el-button>
        <el-button size="small" @click="addNode('video')">＋镜头</el-button>
        <el-button size="small" @click="addNode('scene')">＋分组</el-button>
        <el-button size="small" @click="addNode('subtitle')">＋字幕</el-button>
        <el-button size="small" @click="addNode('audio')">＋音乐</el-button>
        <el-button size="small" @click="togglePalette">素材面板</el-button>
      </el-button-group>
      <el-button
        v-if="projectId"
        size="small"
        :disabled="!undoStack.length"
        title="Ctrl+Z"
        @click="undo"
        >↩ 撤销</el-button
      >
      <el-button
        v-if="projectId"
        size="small"
        :disabled="!redoStack.length"
        title="Ctrl+Shift+Z"
        @click="redo"
        >↪ 重做</el-button
      >
      <span class="save-state">
        {{ saving ? '保存中…' : dirty ? '未保存，稍后自动存' : '已自动保存' }}
      </span>
      <el-dropdown v-if="projectId" @command="(cmd) => cmd === 'autoPlan' && autoPlan()">
        <el-button size="small" :loading="autoPlanning">更多 ▾</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="autoPlan">🤖 自动编排（按素材库覆盖重建）</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button v-if="projectId" size="small" @click="openSubtitleStyle">🎨 字幕样式</el-button>
      <el-button v-if="projectId" size="small" @click="openVersions">🕘 历史</el-button>
      <el-button v-if="projectId" size="small" @click="kbVisible = true">⌨️ 快捷键</el-button>
      <el-button v-if="projectId" size="small" @click="aiFromCanvas">AI 生成脚本</el-button>
      <el-button
        v-if="projectId"
        size="small"
        :loading="exporting || planLoading"
        @click="openExportPlan"
        >导出剪映草稿</el-button
      >
    </div>

    <!-- 当前画布的原脚本已删除时给个说明 -->
    <el-alert
      v-if="currentProject?.orphan"
      class="orphan-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="`这个画布由脚本《${currentProject.script_title}》生成，该脚本已删除`"
    >
      <template #default>
        <span>画布内容还在，可以直接继续用；不需要的话点工具栏「删除项目」。</span>
      </template>
    </el-alert>

    <div class="canvas-body">
      <!-- 素材面板：点击追加到故事线末尾，拖到卡片上插入该位置 -->
      <div v-if="paletteVisible" class="palette">
        <div class="palette-head">
          <span>素材面板</span>
          <el-button text size="small" @click="paletteVisible = false">收起</el-button>
        </div>
        <div class="palette-body">
          <div class="palette-sec">视频（点击或拖入故事线）</div>
          <div class="palette-grid">
            <div
              v-for="m in paletteItems"
              :key="m.id"
              class="palette-item"
              draggable="true"
              @click="appendVideoFromPalette(m)"
              @dragstart="onPaletteDragStart($event, m)"
            >
              <img :src="thumbUrl(m.id)" loading="lazy" />
              <span>{{ m.filename }}</span>
            </div>
            <div v-if="!paletteItems.length" class="palette-empty">媒体库没有素材</div>
          </div>
          <div class="palette-tip">字幕 / 配乐写在镜头卡里：双击镜头卡填写；剧情用独立的剧情卡</div>
        </div>
      </div>

      <!-- 故事线：卡片从上到下 = 成片顺序 -->
      <div class="lane-wrap">
        <div class="lane-head">
          <h2>📖 故事线 · {{ currentProjectName() || '未选择项目' }}</h2>
          <span class="muted">
            {{ videoCount }} 个镜头<template v-if="totalDuration"> · 合计 {{ fmtSec(totalDuration) }}</template>
            <template v-if="cardCount !== videoCount"> · 共 {{ cardCount }} 张卡</template>
          </span>
          <el-button
            size="small"
            :type="previewOpen ? 'primary' : 'default'"
            plain
            @click="previewOpen = !previewOpen"
            >{{ previewOpen ? '收起预览 ▾' : '展开预览 ▴' }}</el-button
          >
        </div>
        <div
          class="lane"
          v-loading="loading"
          @dragover.prevent
          @drop.prevent="onLaneDrop"
        >
          <StoryCard
            v-for="(node, i) in storylineCards"
            :key="node.id"
            :node="node"
            :index="i"
            :total="storylineCards.length"
            :selected="selectedId === node.id"
            :expanded="expandedIds.includes(node.id)"
            :drop-before="dragState.overIndex === i && dragState.before"
            @select="selectedId = node.id"
            @edit="openEdit"
            @inspect="openInspectorById"
            @remove="confirmDeleteNode"
            @move="moveCard"
            @dragstart="onCardDragStart"
            @drag-end="dragState.fromIndex = null"
            @dragover-card="onCardDragOver"
            @drop-card="onCardDrop"
            @toggle-group="toggleGroup"
            @group-add="groupAdd"
            @group-move="groupMove"
            @group-remove="groupRemove"
          />
          <el-empty v-if="!storylineCards.length && !loading" description="故事线还是空的：点上方「＋剧情」写第一段，或「＋镜头」挂素材" />
        </div>
      </div>
    </div>

    <!-- 常驻预览时间轴（可折叠） -->
    <div v-if="previewOpen && projectId" class="preview-panel">
      <PreviewPlayer
        :key="previewKey"
        :project-id="projectId"
        stage-height="30vh"
        @update-shot="applyShotTransform"
        @update-subtitle-style="applySubtitleFromPreview"
        @duration="(d) => (totalDuration = d)"
      />
    </div>

    <!-- 编辑文本卡（剧情/角色/字幕） -->
    <el-dialog v-model="editVisible" title="编辑卡片" width="520px">
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
        <el-popconfirm title="删除该卡片？" @confirm="removeCard(editForm.id)">
          <template #reference><el-button type="danger" plain>删除卡片</el-button></template>
        </el-popconfirm>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 全片字幕样式 -->
    <el-dialog v-model="subtitleStyleVisible" title="🎨 字幕样式（全片统一）" width="min(660px, 96vw)">
      <div class="sub-style-body">
        <div class="sub-preview">
          <div class="sub-frame">
            <span class="sub-sample" :style="subtitlePreviewCss">{{ subtitleSample }}</span>
          </div>
          <div class="sub-preview-tip">9:16 预览 · 字号按剪映等比换算<br />字体用系统近似，导出仍按所选字体</div>
        </div>
        <el-form label-width="64px" class="sub-form">
          <el-form-item label="字体">
            <el-select v-model="subtitleStyleForm.font" placeholder="默认（抖音美好体）" clearable style="width: 100%">
              <el-option v-for="f in fonts" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="字号">
            <el-slider v-model="subtitleStyleForm.size" :min="4" :max="16" :step="0.5" show-input />
          </el-form-item>
          <el-form-item label="位置">
            <el-radio-group v-model="subtitlePreset">
              <el-radio-button value="top">顶部</el-radio-button>
              <el-radio-button value="center">居中</el-radio-button>
              <el-radio-button value="bottom">底部</el-radio-button>
              <el-radio-button value="custom">自定义</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="subtitlePreset === 'custom'" label="Y 偏移">
            <el-input-number v-model="subtitleStyleForm.position" :min="-1" :max="1" :step="0.05" style="width: 100%" />
          </el-form-item>
          <el-alert
            type="info"
            :closable="false"
            title="字幕文字仍写在镜头里（一行一条，按镜头时长均分），这里只统一全片的字体、字号和上下位置；单条字幕卡片自己选了字体时以卡片为准"
          />
        </el-form>
      </div>
      <template #footer>
        <el-button @click="subtitleStyleVisible = false">取消</el-button>
        <el-button type="primary" @click="applySubtitleStyle">应用</el-button>
      </template>
    </el-dialog>

    <!-- 历史版本 -->
    <el-dialog v-model="versionsVisible" title="🕘 故事线历史版本" width="720px">
      <div class="ver-head">
        <span class="muted">自动保存会合并 1 分钟内的连续编辑；恢复前会把当前内容先存一份。</span>
        <el-button size="small" @click="createSnapshot">创建快照</el-button>
      </div>
      <el-table :data="versions" size="small" v-loading="versionsLoading" max-height="440">
        <el-table-column prop="created_at" label="时间" width="150" />
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="reasonType(row.reason)">{{ reasonLabel(row.reason) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="节点" width="70">
          <template #default="{ row }">{{ row.node_count }}</template>
        </el-table-column>
        <el-table-column label="说明" min-width="180">
          <template #default="{ row }">
            {{ row.name || row.description || (row.hash === currentHash ? '当前内容' : '自动保存') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="row.hash === currentHash" @click="restoreVersion(row)"
              >恢复</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 素材选择（镜头卡 / 分组子卡共用） -->
    <el-dialog v-model="videoPickVisible" title="选择视频素材" width="860px" append-to-body>
      <div class="pick-grid">
        <div v-for="m in mediaFiles" :key="m.id" class="pick-card" @click="pickVideo(m)">
          <div class="pick-thumb">
            <img :src="thumbUrl(m.id)" loading="lazy" />
            <span v-if="m.duration" class="pick-badge dur">{{ fmtSec(m.duration) }}</span>
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

    <!-- AI 生成 -->
    <el-dialog v-model="aiVisible" title="根据故事线生成脚本" width="720px" top="5vh">
      <div v-loading="aiGenerating">
        <div class="mode-bar">
          <el-radio-group v-model="aiMode" size="small">
            <el-radio-button value="preview">预览</el-radio-button>
            <el-radio-button value="edit">编辑</el-radio-button>
          </el-radio-group>
        </div>
        <MarkdownView v-if="aiMode === 'preview' && aiResult" :content="aiResult" max-height="380px" />
        <el-input
          v-else
          v-model="aiResult"
          type="textarea"
          :rows="14"
          placeholder="将把故事线上的剧情/角色内容作为剧情笔记，点击开始生成（素材、音乐、字幕不参与脚本）"
        />
      </div>
      <template #footer>
        <el-button type="primary" :loading="aiGenerating" @click="doAiGenerate">开始生成</el-button>
        <el-button :disabled="!aiResult" @click="saveAiScript">保存为脚本</el-button>
      </template>
    </el-dialog>

    <!-- 导出前确认 -->
    <el-dialog v-model="planVisible" title="导出前确认 · 故事线顺序" width="720px" top="6vh">
      <template v-if="planInfo">
        <el-alert
          v-if="planInfo.skipped?.length"
          type="warning"
          :closable="false"
          show-icon
          :title="`${planInfo.skipped.length} 个素材文件未找到，导出将跳过：${planInfo.skipped.join('、')}`"
          style="margin-bottom: 10px"
        />
        <el-alert :type="planInfo.clips?.length ? 'info' : 'error'" :closable="false" show-icon :title="bgmNote" style="margin-bottom: 10px" />
        <el-table v-if="planInfo.clips?.length" :data="planInfo.clips" size="small" max-height="360">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="filename" label="素材" min-width="220" show-overflow-tooltip />
          <el-table-column label="字幕" width="70">
            <template #default="{ row }">{{ row.subtitles?.length ? `${row.subtitles.length} 条` : '—' }}</template>
          </el-table-column>
          <el-table-column label="转场" width="100">
            <template #default="{ row }">{{ row.transition || '—' }}</template>
          </el-table-column>
          <el-table-column label="配乐" width="90">
            <template #default="{ row }">{{ row.bgm ? '镜头配乐' : '—' }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="没有可导出的镜头：请先把素材挂到镜头卡" />
        <div class="muted plan-note">上表顺序即导出到剪映的顺序，与故事线卡片从上到下完全一致。</div>
      </template>
      <template #footer>
        <el-button @click="planVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!planInfo?.clips?.length" @click="exportJianying"> 确认并导出 </el-button>
      </template>
    </el-dialog>

    <!-- 镜头详情：左侧播放视频，右侧参数 -->
    <el-dialog
      v-model="inspectorVisible"
      :title="inspectorTitle"
      :width="inspectorType === 'video' ? '1060px' : '520px'"
      top="5vh"
      destroy-on-close
      class="shot-dialog"
    >
      <div v-if="inspectorType === 'video'" class="shot-body">
        <div class="shot-player">
          <div class="shot-stage">
            <video
              v-if="editingMediaId && !shotPlayFailed"
              ref="shotVideoRef"
              :key="editingMediaId"
              :src="mediaUrl(editingMediaId)"
              class="shot-video"
              controls
              autoplay
              @loadedmetadata="onShotMeta"
              @play="onShotPlay"
              @timeupdate="onShotTime"
              @error="shotPlayFailed = true"
            />
            <div v-else class="shot-fallback">
              <p>浏览器无法播放该视频编码（通常是 HEVC/H.265），剪映可以正常使用。</p>
              <el-button type="primary" size="small" @click="openExternal(editingMediaId)">用系统播放器打开</el-button>
            </div>
          </div>
          <div v-if="shotDuration" class="trim-wrap">
            <div ref="trimRef" class="trim" title="拖两端设置入点/出点；播放只在选中区间内" @pointerdown="onTrimSeek">
              <div class="trim-out" :style="{ left: 0, width: inPct + '%' }" />
              <div class="trim-out" :style="{ left: outPct + '%', width: 100 - outPct + '%' }" />
              <div class="trim-sel" :style="{ left: inPct + '%', width: Math.max(0, outPct - inPct) + '%' }" />
              <div class="trim-play" :style="{ left: playPct + '%' }" />
              <div
                class="trim-handle"
                :style="{ left: inPct + '%' }"
                title="拖我设入点"
                @pointerdown.stop.prevent="startTrim('in', $event)"
              />
              <div
                class="trim-handle right"
                :style="{ left: outPct + '%' }"
                title="拖我设出点"
                @pointerdown.stop.prevent="startTrim('out', $event)"
              />
            </div>
            <div class="trim-info">
              <span>入点 {{ fmtShort(inClamped) }}</span>
              <span>出点 {{ fmtShort(outClamped) }}</span>
              <span class="trim-len">
                {{ fmtShort(clipLen) }}
                <template v-if="Number(nodeForm.speed) !== 1">
                  → {{ fmtShort(clipLen / (Number(nodeForm.speed) || 1)) }}</template
                >
              </span>
            </div>
          </div>
          <div class="shot-meta">
            <span class="shot-name">{{ editingNodeData?.filename }}</span>
            <span v-if="shotDuration">素材 {{ fmtSec(shotDuration) }}</span>
          </div>
          <div class="shot-tools">
            <el-button size="small" :disabled="!shotVideoRef" @click="usePlayheadAsInPoint">入点取当前帧</el-button>
            <el-button size="small" :disabled="!shotVideoRef" @click="usePlayheadAsOutPoint">出点取当前帧</el-button>
            <el-button size="small" :disabled="!shotDuration" @click="resetTrim">全选</el-button>
          </div>
        </div>
        <div class="shot-form">
          <el-form label-position="top">
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
            <el-form-item label="转到下一镜的转场">
              <el-select v-model="nodeForm.transition" style="width: 100%">
                <el-option v-for="t in transitions" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="nodeForm.transition && nodeForm.transition !== '无'" label="转场时长（秒）">
              <el-input-number
                v-model="nodeForm.transitionDuration"
                :min="0.1"
                :max="2"
                :step="0.1"
                style="width: 100%"
              />
            </el-form-item>
            <el-divider content-position="left">这条镜头的内容</el-divider>
            <el-form-item label="字幕（一行一条，按镜头时长均分）">
              <el-input
                v-model="nodeForm.subtitle"
                type="textarea"
                :rows="3"
                resize="none"
                placeholder="例如：&#10;这一段写不下就换行&#10;每行会依次显示"
              />
            </el-form-item>
            <el-form-item label="配乐">
              <el-select
                v-model="nodeForm.musicId"
                clearable
                filterable
                placeholder="不设置则用全局 BGM"
                style="width: 100%"
              >
                <el-option v-for="m in musicFiles" :key="m.id" :label="m.filename" :value="m.id" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="nodeForm.musicId" label="配乐音量">
              <el-slider v-model="nodeForm.musicVolume" :min="0" :max="1" :step="0.05" show-input />
            </el-form-item>
            <el-alert
              type="info"
              :closable="false"
              title="出点超过素材时长时自动截断；变速后的片段时长会自动换算。镜头配了音乐后不再叠加全局 BGM"
            />
          </el-form>
        </div>
      </div>
      <!-- 音乐卡详情：只有一个音量 -->
      <el-form v-else-if="inspectorType === 'audio'" label-position="top">
        <el-form-item label="背景音乐音量">
          <el-slider v-model="nodeForm.volume" :min="0" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          title="音乐卡会覆盖全局 BGM，导出时从片头开始铺满全片，并自动淡入淡出"
        />
      </el-form>
      <template #footer>
        <el-button @click="inspectorVisible = false">取消</el-button>
        <el-button type="primary" @click="applyInspector">应用</el-button>
      </template>
    </el-dialog>

    <!-- 快捷键（固定键位说明） -->
    <el-dialog v-model="kbVisible" title="⌨️ 故事线快捷键" width="480px">
      <el-table :data="kbRows" size="small">
        <el-table-column prop="label" label="动作" />
        <el-table-column prop="key" label="按键" width="170" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import api, { mediaUrl, thumbUrl } from '../api'
import StoryCard from '../components/story/StoryCard.vue'
import MarkdownView from '../components/MarkdownView.vue'
import PreviewPlayer from '../components/canvas/PreviewPlayer.vue'

const route = useRoute()
const router = useRouter()

/* ---------------- 项目 ---------------- */
const projects = ref([])
const projectId = ref(Number(localStorage.getItem('canvas_project')) || null)
const showOrphanProjects = ref(false)
const orphanCount = computed(() => projects.value.filter((p) => p.orphan).length)
const currentProject = computed(() => projects.value.find((p) => p.id === projectId.value) || null)
const projectOptions = computed(() => {
  const list = projects.value
  if (showOrphanProjects.value) return list
  return list.filter((p) => !p.orphan || p.id === projectId.value)
})
function projectLabel(p) {
  return p.orphan ? `${p.name}（脚本已删）` : p.name
}
function currentProjectName() {
  return projects.value.find((p) => p.id === projectId.value)?.name || ''
}

const nodes = ref([])
const storyline = ref([])
// 旧画布的连线数据保留在存量里（回滚参考），新 UI 不再使用
let loadedEdges = []
const loading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const dirty = ref(false)
// 节点是否已从服务端载入完成：没载入前绝不保存，避免把空故事线写回去
let _canvasLoaded = false
let saveTimer = null
// 每次改动 +1，保存返回时用来判断期间有没有新改动
let changeVersion = 0

function markDirty() {
  changeVersion++
  dirty.value = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(true), 2000)
}

/* ---------------- 撤销 / 重做 ---------------- */
const undoStack = ref([])
const redoStack = ref([])
const HISTORY_MAX = 50
let restoringHistory = false
let lastPushAt = 0

function snapshotCanvas() {
  const clean = (list) => list.map(({ selected, dragging, resizing, ...rest }) => rest)
  return JSON.stringify({ nodes: clean(nodes.value), storyline: [...storyline.value] })
}
function pushHistory() {
  if (restoringHistory || !_canvasLoaded) return
  const now = Date.now()
  if (now - lastPushAt < 400) return
  lastPushAt = now
  undoStack.value.push(snapshotCanvas())
  if (undoStack.value.length > HISTORY_MAX) undoStack.value.shift()
  redoStack.value = []
}
function applyHistory(snapshot) {
  const snap = JSON.parse(snapshot)
  restoringHistory = true
  nodes.value = snap.nodes
  storyline.value = snap.storyline
  restoringHistory = false
  selectedId.value = null
  markDirty()
}
function undo() {
  if (!undoStack.value.length) return
  redoStack.value.push(snapshotCanvas())
  applyHistory(undoStack.value.pop())
}
function redo() {
  if (!redoStack.value.length) return
  undoStack.value.push(snapshotCanvas())
  applyHistory(redoStack.value.pop())
}

/* ---------------- 故事线卡片 ---------------- */
const selectedId = ref(null)
const expandedIds = ref([])
let nodeSeq = Date.now()
const byId = computed(() => new Map(nodes.value.map((n) => [n.id, n])))
const storylineCards = computed(() =>
  storyline.value.map((id) => byId.value.get(id)).filter(Boolean),
)
const cardCount = computed(() => storylineCards.value.length)
const videoCount = computed(() => storylineCards.value.filter((n) => n.type === 'video').length)

function newNode(type, data) {
  const id = `n${++nodeSeq}_${Date.now().toString(36)}`
  nodes.value.push({ id, type, position: { x: 0, y: 0 }, data })
  storyline.value.push(id)
  return id
}

const NODE_DEFAULTS = {
  plot: () => ({ title: '新剧情卡', content: '在这里写下这一段剧情/分镜的构思…' }),
  role: () => ({ title: '新角色', content: '人物设定：性格、目标、口头禅…' }),
  subtitle: () => ({ title: '新字幕', content: '在这里写字幕文字…' }),
  scene: () => ({ title: '新分组', items: [], note: '' }),
}

function addNode(type) {
  if (!projectId.value) return
  if (type === 'video') return openVideoPick()
  if (type === 'audio') return openMusicPick()
  pushHistory()
  newNode(type, NODE_DEFAULTS[type]())
  markDirty()
}

function moveCard(from, to) {
  if (from === to || to < 0 || to >= storyline.value.length) return
  pushHistory()
  const [id] = storyline.value.splice(from, 1)
  storyline.value.splice(to, 0, id)
  markDirty()
}

async function confirmDeleteNode(id) {
  const node = byId.value.get(id)
  if (!node) return
  const name = node.data?.title || node.data?.filename || id
  try {
    await ElMessageBox.confirm(`删除卡片「${name}」？`, '二次确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  removeCard(id)
}
function removeCard(id) {
  pushHistory()
  nodes.value = nodes.value.filter((n) => n.id !== id)
  storyline.value = storyline.value.filter((sid) => sid !== id)
  if (selectedId.value === id) selectedId.value = null
  markDirty()
}

function toggleGroup(id) {
  expandedIds.value = expandedIds.value.includes(id)
    ? expandedIds.value.filter((x) => x !== id)
    : [...expandedIds.value, id]
}

/* 分组子卡操作（原集成节点，画中画改为内嵌列表） */
function newItemId() {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
function mutateGroup(groupId, fn) {
  pushHistory()
  nodes.value = nodes.value.map((n) =>
    n.id === groupId ? { ...n, data: { ...n.data, items: fn(n.data?.items || []) } } : n,
  )
  markDirty()
}
function groupAdd(groupId, kind) {
  if (kind === 'video') {
    videoPickTarget.value = groupId
    openVideoPick()
  } else if (kind === 'audio') {
    musicPickTarget.value = groupId
    openMusicPick()
  } else if (kind === 'plot') {
    ElMessageBox.prompt('这段剧情/分镜的构思', '添加剧情子卡', {
      inputType: 'textarea',
      confirmButtonText: '添加',
    })
      .then(({ value }) => {
        const text = (value || '').trim()
        if (!text) return
        mutateGroup(groupId, (items) => [...items, { id: newItemId(), kind: 'plot', title: '剧情', content: text }])
      })
      .catch(() => {})
  } else if (kind === 'subtitle') {
    ElMessageBox.prompt('字幕文字（一行一条）', '添加字幕子卡', {
      inputType: 'textarea',
      confirmButtonText: '添加',
    })
      .then(({ value }) => {
        const text = (value || '').trim()
        if (!text) return
        mutateGroup(groupId, (items) => [...items, { id: newItemId(), kind: 'subtitle', text, font: '' }])
      })
      .catch(() => {})
  }
}
function groupMove(groupId, from, to) {
  mutateGroup(groupId, (items) => {
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    return next
  })
}
function groupRemove(groupId, index) {
  mutateGroup(groupId, (items) => items.filter((_, i) => i !== index))
}

/* ---------------- 拖拽排序 / 素材拖入 ---------------- */
const dragState = ref({ fromIndex: null, mode: 'card', payload: null, overIndex: null, before: true })

function onCardDragStart(index) {
  dragState.value = { ...dragState.value, mode: 'card', fromIndex: index }
}
function onPaletteDragStart(e, m) {
  e.dataTransfer.setData('application/x-creator-media', JSON.stringify({ kind: 'video', mediaId: m.id, filename: m.filename, note: m.note || '' }))
  e.dataTransfer.effectAllowed = 'copy'
  dragState.value = { ...dragState.value, mode: 'palette' }
}
function onCardDragOver({ index, y, el }) {
  if (dragState.value.fromIndex == null && dragState.value.mode !== 'palette') return
  const rect = el.getBoundingClientRect()
  dragState.value = { ...dragState.value, overIndex: index, before: y < rect.top + rect.height / 2 }
}
function insertAt(index, before) {
  const at = before ? index : index + 1
  if (dragState.value.mode === 'card' && dragState.value.fromIndex != null) {
    const from = dragState.value.fromIndex
    let to = at > from ? at - 1 : at
    if (to === from) return
    pushHistory()
    const [id] = storyline.value.splice(from, 1)
    storyline.value.splice(to, 0, id)
    markDirty()
  }
}
function onCardDrop({ index, y, el, source }) {
  onCardDragOver({ index, y, el })
  if (dragState.value.mode === 'palette' && source) {
    // 素材拖到某张卡片上：插到该位置
    const raw =
      source.dataTransfer?.getData('application/x-creator-media') || source.dataTransfer?.getData('text/plain')
    if (raw) {
      try {
        const payload = JSON.parse(raw)
        const at = dragState.value.before ? index : index + 1
        pushHistory()
        const id = newNode('video', { mediaId: payload.mediaId, filename: payload.filename, note: payload.note || '' })
        storyline.value.splice(storyline.value.indexOf(id), 1)
        storyline.value.splice(at, 0, id)
        markDirty()
      } catch {}
    }
  } else {
    insertAt(index, dragState.value.before)
  }
  dragState.value = { fromIndex: null, mode: 'card', payload: null, overIndex: null, before: true }
}
function onLaneDrop(e) {
  // 拖到空白处：素材追加到末尾；卡片拖到末尾
  if (dragState.value.mode === 'palette') {
    const raw = e.dataTransfer?.getData('application/x-creator-media') || e.dataTransfer?.getData('text/plain')
    if (raw) {
      try {
        const payload = JSON.parse(raw)
        appendVideoNode(payload)
      } catch {}
    }
  } else if (dragState.value.fromIndex != null) {
    const from = dragState.value.fromIndex
    const to = storyline.value.length - 1
    if (from !== to) moveCard(from, to)
  }
  dragState.value = { fromIndex: null, mode: 'card', payload: null, overIndex: null, before: true }
}
function appendVideoNode(payload) {
  if (!payload || payload.kind !== 'video') return
  pushHistory()
  newNode('video', { mediaId: payload.mediaId, filename: payload.filename, note: payload.note || '' })
  markDirty()
}
function appendVideoFromPalette(m) {
  appendVideoNode({ kind: 'video', mediaId: m.id, filename: m.filename, note: m.note || '' })
}

/* ---------------- 素材面板 ---------------- */
const paletteVisible = ref(false)
const paletteItems = ref([])
function togglePalette() {
  paletteVisible.value = !paletteVisible.value
  if (paletteVisible.value) {
    api.get('/media/list').then(({ data }) => (paletteItems.value = data.items || []))
  }
}

/* ---------------- 素材 / 音乐选择 ---------------- */
const mediaFiles = ref([])
const musicFiles = ref([])
const videoPickVisible = ref(false)
const musicPickVisible = ref(false)
const videoPickTarget = ref(null) // null=追加到故事线，否则为分组节点 id
const musicPickTarget = ref(null)

async function loadMedia() {
  try {
    const { data } = await api.get('/media/list')
    mediaFiles.value = data.items || []
  } catch {}
  try {
    const { data } = await api.get('/music/list')
    musicFiles.value = data.items || []
  } catch {}
}
function openVideoPick() {
  videoPickTarget.value = null
  videoPickVisible.value = true
}
function openMusicPick() {
  musicPickTarget.value = null
  musicPickVisible.value = true
}
function pickVideo(row) {
  pushHistory()
  if (videoPickTarget.value) {
    const groupId = videoPickTarget.value
    nodes.value = nodes.value.map((n) =>
      n.id === groupId
        ? {
            ...n,
            data: {
              ...n.data,
              items: [
                ...(n.data?.items || []),
                { id: newItemId(), kind: 'video', mediaId: row.id, filename: row.filename, note: row.note || '' },
              ],
            },
          }
        : n,
    )
    expandedIds.value = expandedIds.value.includes(groupId) ? expandedIds.value : [...expandedIds.value, groupId]
  } else {
    newNode('video', { mediaId: row.id, filename: row.filename, note: row.note || '' })
  }
  videoPickVisible.value = false
  markDirty()
}
function pickMusic(row) {
  pushHistory()
  if (musicPickTarget.value) {
    const groupId = musicPickTarget.value
    nodes.value = nodes.value.map((n) =>
      n.id === groupId
        ? {
            ...n,
            data: {
              ...n.data,
              items: [...(n.data?.items || []), { id: newItemId(), kind: 'audio', musicId: row.id, filename: row.filename, volume: 0.25 }],
            },
          }
        : n,
    )
    expandedIds.value = expandedIds.value.includes(groupId) ? expandedIds.value : [...expandedIds.value, groupId]
  } else {
    newNode('audio', { musicId: row.id, filename: row.filename, volume: 0.25 })
  }
  musicPickVisible.value = false
  markDirty()
}
function ratioText(m) {
  return { portrait: '竖屏', landscape: '横屏', square: '方屏' }[m.orientation] || m.orientation
}

/* ---------------- 文本卡编辑 ---------------- */
const editVisible = ref(false)
const editType = ref('plot')
const editForm = ref({ id: null, title: '', content: '', font: '' })
const fonts = [
  '抖音美好体',
  '黑体',
  '宋体',
  '楷体',
  '仿宋',
  '思源黑体',
  '微软雅黑',
  '华文彩云',
  '隶书',
  '幼圆',
]
function openEdit(id) {
  const node = byId.value.get(id)
  if (!node) return
  editType.value = node.type
  editForm.value = { id, title: node.data.title || '', content: node.data.content || '', font: node.data.font || '' }
  editVisible.value = true
}
function confirmEdit() {
  pushHistory()
  const node = nodes.value.find((n) => n.id === editForm.value.id)
  if (node) {
    const { id: _id, ...rest } = editForm.value
    if (node.type !== 'subtitle') delete rest.font
    node.data = { ...node.data, ...rest }
  }
  editVisible.value = false
  markDirty()
}

/* ---------------- 镜头 / 音乐详情 ---------------- */
const inspectorVisible = ref(false)
const inspectorType = ref('video')
const editingNodeId = ref(null)
const editingNodeData = ref(null)
const editingMediaId = ref(null)
const nodeForm = ref({})
const shotVideoRef = ref(null)
const shotDuration = ref(0)
const shotPlayTime = ref(0)
const shotPlayFailed = ref(false)
const trimRef = ref(null)
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const filters = ['清透自然', '暖食', '情感电影', '日系奶油', '清晰明亮', '高清黑白']
const transitions = ['无', '叠化', '闪白', '推近', '快涂擦除', '模糊', '闪黑']

const inspectorTitle = computed(() =>
  inspectorType.value === 'video' ? '🎬 镜头详情' : '🎵 音乐卡详情',
)

function openInspectorById(id) {
  const node = byId.value.get(id)
  if (!node) return
  editingNodeId.value = id
  editingNodeData.value = node.data
  if (node.type === 'video') {
    inspectorType.value = 'video'
    editingMediaId.value = node.data.mediaId ?? null
    shotDuration.value = 0
    shotPlayTime.value = 0
    shotPlayFailed.value = false
    nodeForm.value = {
      inPoint: Number(node.data.inPoint) || 0,
      outPoint: Number(node.data.outPoint) || 0,
      speed: Number(node.data.speed) || 1,
      volume: node.data.volume != null ? Number(node.data.volume) : 1,
      filter: node.data.filter || '',
      transition: node.data.transition || '无',
      transitionDuration: node.data.transitionDuration != null ? Number(node.data.transitionDuration) : null,
      subtitle: node.data.subtitle || '',
      musicId: node.data.musicId ?? null,
      musicName: node.data.musicName || '',
      musicVolume: node.data.musicVolume != null ? Number(node.data.musicVolume) : 0.3,
    }
  } else if (node.type === 'audio') {
    inspectorType.value = 'audio'
    nodeForm.value = { volume: node.data.volume != null ? Number(node.data.volume) : 0.25 }
  } else {
    return
  }
  inspectorVisible.value = true
}

function fmtSec(s) {
  const v = Math.max(0, Math.round(Number(s) || 0))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}
function fmtShort(sec) {
  const s = Math.max(0, Number(sec) || 0)
  return s >= 60 ? fmtSec(s) : `${s.toFixed(1)}s`
}

const inClamped = computed(() => {
  const d = shotDuration.value || 0
  return Math.min(Math.max(0, Number(nodeForm.value.inPoint) || 0), d)
})
const outClamped = computed(() => {
  const d = shotDuration.value || 0
  const o = Number(nodeForm.value.outPoint) || 0
  return o > 0 ? Math.min(o, d) : d
})
const inPct = computed(() => (shotDuration.value ? (inClamped.value / shotDuration.value) * 100 : 0))
const outPct = computed(() => (shotDuration.value ? (outClamped.value / shotDuration.value) * 100 : 100))
const playPct = computed(() =>
  shotDuration.value ? Math.min(100, Math.max(0, (shotPlayTime.value / shotDuration.value) * 100)) : 0,
)
const clipLen = computed(() => Math.max(0, outClamped.value - inClamped.value))

function onShotMeta(e) {
  const v = e.target
  shotDuration.value = v?.duration || 0
  shotPlayTime.value = 0
  const start = Number(nodeForm.value.inPoint) || 0
  if (v && start > 0) {
    try {
      v.currentTime = Math.min(start, shotDuration.value)
    } catch {}
  }
  if (v) v.playbackRate = Number(nodeForm.value.speed) || 1
}
function onShotTime(e) {
  const v = e.target
  shotPlayTime.value = v.currentTime || 0
  const out = Number(nodeForm.value.outPoint) || 0
  if (out > 0 && v.currentTime >= out - 0.03 && !v.paused) v.pause()
}
function onShotPlay(e) {
  const v = e.target
  if (!shotDuration.value) return
  const start = inClamped.value
  const end = outClamped.value
  const t = v.currentTime || 0
  if (t < start - 0.05 || t >= end - 0.05) {
    try {
      v.currentTime = Math.min(start, Math.max(0, shotDuration.value - 0.05))
    } catch {}
  }
}
function usePlayheadAsInPoint() {
  const v = shotVideoRef.value
  if (!v) return
  const t = Math.round((v.currentTime || 0) * 10) / 10
  nodeForm.value.inPoint = Math.min(t, Math.max(0, outClamped.value - 0.1))
}
function usePlayheadAsOutPoint() {
  const v = shotVideoRef.value
  if (!v) return
  const t = Math.round((v.currentTime || 0) * 10) / 10
  nodeForm.value.outPoint = Math.max(t, inClamped.value + 0.1)
}
function resetTrim() {
  nodeForm.value.inPoint = 0
  nodeForm.value.outPoint = 0
}
function startTrim(which, e) {
  const bar = trimRef.value
  if (!bar || !shotDuration.value) return
  const apply = (ev) => {
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
    let t = Math.round(ratio * shotDuration.value * 10) / 10
    if (which === 'in') {
      t = Math.min(t, Math.max(0, outClamped.value - 0.1))
      nodeForm.value.inPoint = t
    } else {
      t = Math.max(t, inClamped.value + 0.1)
      nodeForm.value.outPoint = t >= shotDuration.value - 0.05 ? 0 : t
    }
    const v = shotVideoRef.value
    if (v) {
      try {
        v.currentTime = Math.min(t, shotDuration.value)
      } catch {}
    }
  }
  apply(e)
  const up = () => {
    window.removeEventListener('pointermove', apply)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', apply)
  window.addEventListener('pointerup', up)
}
function onTrimSeek(e) {
  const bar = trimRef.value
  const v = shotVideoRef.value
  if (!bar || !v || !shotDuration.value) return
  const rect = bar.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  try {
    v.currentTime = ratio * shotDuration.value
  } catch {}
}
async function openExternal(mediaId) {
  if (mediaId == null) return
  await api.post(`/media/open/${mediaId}`)
}

function applyInspector() {
  pushHistory()
  const node = nodes.value.find((n) => n.id === editingNodeId.value)
  if (node) {
    if (node.type === 'video') {
      const f = nodeForm.value
      const music = f.musicId != null ? musicFiles.value.find((m) => m.id === f.musicId) : null
      node.data = {
        ...node.data,
        inPoint: f.inPoint,
        outPoint: f.outPoint,
        speed: f.speed,
        volume: f.volume,
        filter: f.filter || '',
        transition: f.transition || '无',
        transitionDuration: f.transition && f.transition !== '无' ? f.transitionDuration : null,
        subtitle: f.subtitle,
        musicId: f.musicId ?? null,
        musicName: music?.filename || '',
        musicVolume: f.musicId != null ? f.musicVolume : null,
      }
    } else if (node.type === 'audio') {
      node.data = { ...node.data, volume: nodeForm.value.volume }
    }
  }
  inspectorVisible.value = false
  markDirty()
}

/* ---------------- 快捷键（固定键位） ---------------- */
const kbVisible = ref(false)
const kbRows = [
  { label: '撤销 / 重做', key: 'Ctrl+Z / Ctrl+Shift+Z' },
  { label: '上移 / 下移选中卡', key: '↑ / ↓' },
  { label: '打开选中卡详情', key: 'Enter' },
  { label: '删除选中卡', key: 'Delete' },
]
function onKeydown(e) {
  if (
    kbVisible.value ||
    editVisible.value ||
    videoPickVisible.value ||
    musicPickVisible.value ||
    aiVisible.value ||
    inspectorVisible.value ||
    planVisible.value ||
    subtitleStyleVisible.value ||
    versionsVisible.value
  )
    return
  if (document.querySelector('.el-message-box')) return
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return

  if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
    e.preventDefault()
    if (e.key.toLowerCase() === 'y' || e.shiftKey) redo()
    else undo()
    return
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (!selectedId.value) return
    e.preventDefault()
    const idx = storyline.value.indexOf(selectedId.value)
    if (idx < 0) return
    moveCard(idx, e.key === 'ArrowUp' ? idx - 1 : idx + 1)
  } else if (e.key === 'Enter') {
    if (selectedId.value) openCard(selectedId.value)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedId.value) confirmDeleteNode(selectedId.value)
  }
}
function openCard(id) {
  const node = byId.value.get(id)
  if (!node) return
  if (['video', 'audio'].includes(node.type)) openInspectorById(id)
  else if (['plot', 'role', 'subtitle'].includes(node.type)) openEdit(id)
}

/* ---------------- 全片字幕样式 ---------------- */
const DEFAULT_SUBTITLE_STYLE = { font: '', size: 8.5, position: -0.66, positionX: 0 }
const subtitleStyle = ref({ ...DEFAULT_SUBTITLE_STYLE })
const subtitleStyleVisible = ref(false)
const subtitleStyleForm = ref({ ...DEFAULT_SUBTITLE_STYLE })
const subtitleSample = '冬天来了，把日子过暖一点'
const subtitlePreset = computed({
  get() {
    const p = Number(subtitleStyleForm.value.position)
    if (p >= 0.45) return 'top'
    if (p <= -0.45) return 'bottom'
    if (Math.abs(p) <= 0.15) return 'center'
    return 'custom'
  },
  set(v) {
    if (v === 'top') subtitleStyleForm.value.position = 0.6
    else if (v === 'center') subtitleStyleForm.value.position = 0
    else if (v === 'bottom') subtitleStyleForm.value.position = -0.66
  },
})
function openSubtitleStyle() {
  subtitleStyleForm.value = { ...DEFAULT_SUBTITLE_STYLE, ...subtitleStyle.value }
  subtitleStyleVisible.value = true
}
function applySubtitleStyle() {
  const form = subtitleStyleForm.value
  subtitleStyle.value = {
    font: String(form.font || ''),
    size: Number(form.size) > 0 ? Number(form.size) : 8.5,
    position: Number.isFinite(Number(form.position)) ? Number(form.position) : -0.66,
    positionX: Number.isFinite(Number(form.positionX)) ? Number(form.positionX) : 0,
  }
  subtitleStyleVisible.value = false
  markDirty()
  ElMessage.success('字幕样式已应用，保存后导出和预览都会同步')
}
const subtitlePreviewCss = computed(() => {
  const s = subtitleStyleForm.value
  const size = (Number(s.size) || 8.5) * 2.6
  const top = (1 - (Number(s.position) || 0)) * 50
  return {
    fontSize: `${size}px`,
    top: `${Math.min(96, Math.max(4, top))}%`,
    transform: `translate(-50%, -50%) translateX(${(Number(s.positionX) || 0) * 40}%)`,
    fontFamily: s.font || undefined,
  }
})

/* ---------------- 版本历史 ---------------- */
const versionsVisible = ref(false)
const versions = ref([])
const versionsLoading = ref(false)
const currentHash = ref('')
const VERSION_REASON = {
  auto: '自动保存',
  manual: '手动快照',
  restore: '恢复',
  'before-restore': '恢复前',
  baseline: '基线',
}
function reasonLabel(reason) {
  return VERSION_REASON[reason] || reason
}
function reasonType(reason) {
  if (reason === 'manual') return 'success'
  if (reason === 'before-restore') return 'warning'
  return 'info'
}
async function openVersions() {
  versionsVisible.value = true
  await loadVersions()
}
async function loadVersions() {
  if (!projectId.value) return
  versionsLoading.value = true
  try {
    const { data } = await api.get(`/projects/${projectId.value}/versions`)
    versions.value = data.items || []
    currentHash.value = data.currentHash || ''
  } finally {
    versionsLoading.value = false
  }
}
async function createSnapshot() {
  let name
  try {
    const { value } = await ElMessageBox.prompt(
      '给这个版本起个名字，方便以后找回（如「发布前」「改结局前」）。',
      '创建快照',
      {
        inputValue: `手动快照 ${new Date().toLocaleString('zh-CN')}`,
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValidator: (v) => (v && v.trim() ? true : '请输入名称'),
      },
    )
    name = value.trim()
  } catch {
    return
  }
  await save(true)
  await api.post(`/projects/${projectId.value}/versions`, { name })
  ElMessage.success('快照已创建')
  await loadVersions()
}
async function restoreVersion(row) {
  try {
    await ElMessageBox.confirm(
      `恢复到 ${row.created_at} 的版本（${row.node_count} 个节点）？当前内容会先自动留一份快照。`,
      '恢复版本',
      { type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  undoStack.value = []
  redoStack.value = []
  await save(true)
  await api.post(`/projects/${projectId.value}/versions/${row.id}/restore`)
  await loadProject()
  dirty.value = false
  versionsVisible.value = false
  ElMessage.success('已恢复，当前内容也已自动存档')
}

/* ---------------- 保存 ---------------- */
function buildCanvasPayload() {
  const clean = (list) => list.map(({ selected, dragging, resizing, ...rest }) => rest)
  const payload = {
    canvas: {
      nodes: clean(nodes.value),
      storyline: [...storyline.value],
      subtitleStyle: { ...subtitleStyle.value },
    },
  }
  // 旧画布的连线保留在存量里（回滚参考），新界面不再使用
  if (loadedEdges.length) payload.canvas.edges = loadedEdges
  return payload
}
async function save(auto = false) {
  if (!projectId.value || !_canvasLoaded) return
  const id = projectId.value
  const version = changeVersion
  saving.value = true
  try {
    await api.put(`/projects/${id}`, buildCanvasPayload())
    if (changeVersion === version) dirty.value = false
    schedulePreviewRefresh()
  } finally {
    saving.value = false
  }
}
function flushSave() {
  clearTimeout(saveTimer)
  if (!dirty.value || !projectId.value || !_canvasLoaded) return
  const id = projectId.value
  const payload = buildCanvasPayload()
  dirty.value = false
  api.put(`/projects/${id}`, payload).catch(() => {})
}
function flushSaveOnUnload() {
  if (!dirty.value || !projectId.value || !_canvasLoaded) return
  fetch(`/api/projects/${projectId.value}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCanvasPayload()),
    keepalive: true,
  }).catch(() => {})
  dirty.value = false
}

/* ---------------- 常驻预览 ---------------- */
const previewOpen = ref(true)
const previewKey = ref(0)
const totalDuration = ref(0)
let previewRefreshTimer = null
function schedulePreviewRefresh() {
  if (!previewOpen.value) return
  clearTimeout(previewRefreshTimer)
  previewRefreshTimer = setTimeout(() => previewKey.value++, 1500)
}
// 预览里拖动画面 / 字幕：写回节点与全片样式
function applyShotTransform({ nodeId, transformX, transformY }) {
  nodes.value = nodes.value.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, transformX, transformY } } : n))
  markDirty()
}
function applySubtitleFromPreview({ position, positionX }) {
  subtitleStyle.value = { ...subtitleStyle.value, position, positionX }
  markDirty()
}

/* ---------------- AI 生成 ---------------- */
const aiVisible = ref(false)
const aiGenerating = ref(false)
const aiResult = ref('')
const aiMode = ref('edit')
function plotNotes() {
  const roles = nodes.value
    .filter((n) => n.type === 'role' && `${n.data.title || ''}${n.data.content || ''}`.trim())
    .map((n) => `【角色设定】${n.data.title || '角色'}：${n.data.content || ''}`)
  const plots = nodes.value
    .filter((n) => n.type === 'plot')
    .map((n) => `${n.data.title || '剧情'}：${n.data.content || ''}`)
  // 分组（章节）里的剧情子卡一并进入 AI 上下文，不因折叠而丢内容
  const groupPlots = nodes.value
    .filter((n) => n.type === 'scene')
    .flatMap((n) => (Array.isArray(n.data?.items) ? n.data.items : []))
    .filter((it) => it.kind === 'plot' && (it.content || it.title || '').trim())
    .map((it) => `${it.title || '剧情'}：${it.content || ''}`)
  return [...roles, ...plots, ...groupPlots]
}
async function aiFromCanvas() {
  if (!plotNotes().length) {
    ElMessage.warning('故事线上还没有剧情卡，先添加剧情再生成脚本')
    return
  }
  await save(true)
  aiResult.value = ''
  aiMode.value = 'edit'
  aiVisible.value = true
}
async function doAiGenerate() {
  const notes = plotNotes()
  if (!notes.length) {
    ElMessage.warning('故事线上还没有剧情')
    return
  }
  aiGenerating.value = true
  try {
    const { data } = await api.post('/ai/script', { notes: notes.join('\n'), topic: currentProjectName() })
    aiResult.value = data.content
    aiMode.value = 'preview'
    if (data.degraded) ElMessage.warning('未配置 AI Key，已返回模拟内容')
  } finally {
    aiGenerating.value = false
  }
}
async function saveAiScript() {
  const title = currentProjectName() || '画布脚本'
  const { data: saved } = await api.post('/scripts', {
    title: `${title} · AI 生成`,
    content: aiResult.value,
    source: 'ai',
    projectId: projectId.value,
  })
  aiVisible.value = false
  const { data: cv } = await api.post(`/scripts/${saved.id}/to-canvas`, { projectId: projectId.value })
  if (cv.added > 0) {
    ElMessage.success(`脚本已保存，${cv.added} 个分镜已追加到故事线`)
    await loadProject()
  } else {
    ElMessage.success('脚本已保存（未解析到分镜结构，可在脚本管理里查看）')
  }
}

/* ---------------- 导出 ---------------- */
const planVisible = ref(false)
const planLoading = ref(false)
const planInfo = ref(null)
const bgmNote = computed(() => {
  const p = planInfo.value
  if (!p) return ''
  const hasClipBgm = p.clips?.some((c) => c.bgm)
  if (hasClipBgm && p.bgm) return '存在镜头配乐：本次导出全局 BGM 不生效（避免两轨同响）'
  if (hasClipBgm) return '使用镜头自带配乐，无全局 BGM'
  if (p.bgm) return '全局 BGM 已启用'
  return '未配置任何 BGM（可加音乐卡，或后台管理设置全局 BGM）'
})
async function openExportPlan() {
  if (!projectId.value) return
  planLoading.value = true
  try {
    await save(true)
    const { data } = await api.get(`/projects/${projectId.value}/preview-plan`)
    planInfo.value = data
    planVisible.value = true
  } finally {
    planLoading.value = false
  }
}
function defaultDraftName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${currentProjectName() || '未命名项目'}-${stamp}`
}
async function exportJianying() {
  let draftName
  try {
    const { value } = await ElMessageBox.prompt(
      '草稿名称会显示在剪映的草稿列表中，同名草稿将被覆盖。',
      '导出剪映草稿',
      {
        inputValue: defaultDraftName(),
        confirmButtonText: '开始导出',
        cancelButtonText: '取消',
        inputValidator: (v) => (v && v.trim() ? true : '请输入草稿名称'),
      },
    )
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
    if (data.warnings?.length) {
      ElMessage.warning(`有 ${data.warnings.length} 项样式被回退：${data.warnings.slice(0, 2).join('；')}`)
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '生成剪映草稿失败')
  } finally {
    exporting.value = false
  }
}

/* ---------------- 自动编排 ---------------- */
const autoPlanning = ref(false)
async function autoPlan() {
  try {
    await ElMessageBox.confirm('将根据素材库自动重建故事线，当前内容会被覆盖，是否继续？', '自动编排', {
      type: 'warning',
      confirmButtonText: '开始',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  pushHistory()
  await save(true)
  autoPlanning.value = true
  try {
    const { data } = await api.post(`/projects/${projectId.value}/auto-plan`)
    await loadProject()
    ElMessage.success(`已编排 ${data.added} 个镜头${data.ai ? '（AI 分镜）' : '（本地规则：未配置 AI Key）'}`)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '自动编排失败')
  } finally {
    autoPlanning.value = false
  }
}

/* ---------------- 项目加载 ---------------- */
async function loadProjects() {
  const { data } = await api.get('/projects/list')
  projects.value = data.items
  const exists = (pid) => data.items.some((p) => p.id === pid)
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
  }
}
function switchProject(id) {
  if (!id || id === projectId.value) return
  flushSave()
  projectId.value = id
  dirty.value = false
  loadProject()
}
async function loadProject() {
  if (!projectId.value) return
  loading.value = true
  _canvasLoaded = false
  undoStack.value = []
  redoStack.value = []
  try {
    const { data } = await api.get(`/projects/${projectId.value}`)
    localStorage.setItem('canvas_project', String(projectId.value))
    const canvas = typeof data.canvas === 'string' ? JSON.parse(data.canvas || '{}') : data.canvas || {}
    nodes.value = (canvas.nodes || []).map(({ selected, ...rest }) => rest)
    loadedEdges = canvas.edges || []
    subtitleStyle.value = { ...DEFAULT_SUBTITLE_STYLE, ...(canvas.subtitleStyle || {}) }
    // 旧画布迁移：没有显式故事线时由服务端按原连线/位置逻辑派生初始顺序
    if (Array.isArray(canvas.storyline) && canvas.storyline.length) {
      storyline.value = canvas.storyline
    } else {
      const { data: derived } = await api.get(`/projects/${projectId.value}/storyline`)
      storyline.value = derived.storyline
      if (!derived.migrated) ElMessage.info('旧画布已按原顺序转换为故事线')
    }
    // 清理指向已删节点的 id；补上漏掉的节点
    const idSet = new Set(nodes.value.map((n) => n.id))
    storyline.value = storyline.value.filter((id) => idSet.has(id))
    const inStory = new Set(storyline.value)
    nodes.value.forEach((n) => {
      if (!inStory.has(n.id)) storyline.value.push(n.id)
    })
    selectedId.value = null
    expandedIds.value = []
    _canvasLoaded = true
    previewKey.value++
  } finally {
    loading.value = false
  }
}
async function newProject() {
  const { value } = await ElMessageBox.prompt('项目名称', '新建项目', { inputPattern: /.+/, inputErrorMessage: '必填' })
  flushSave()
  const { data } = await api.post('/projects', { name: value })
  await loadProjects()
  projectId.value = data.id
  await loadProject()
}
async function removeProject() {
  if (!projectId.value) return
  const name = currentProjectName() || `项目 ${projectId.value}`
  try {
    await ElMessageBox.confirm(
      `删除项目「${name}」？故事线上的 ${nodes.value.length} 个节点会一起删除，无法恢复。`,
      '删除项目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await api.delete(`/projects/${projectId.value}`)
  ElMessage.success('项目已删除')
  nodes.value = []
  storyline.value = []
  loadedEdges = []
  await loadProjects()
  if (!projectId.value) router.replace('/canvas')
}

/* ---------------- 生命周期 ---------------- */
watch(
  () => route.params.projectId,
  (pid) => {
    const next = Number(pid)
    if (next && next !== projectId.value) {
      flushSave()
      projectId.value = next
      dirty.value = false
      loadProject()
    }
  },
)
onMounted(() => {
  loadProjects()
  loadMedia()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', flushSaveOnUnload)
})
onBeforeUnmount(() => {
  flushSave()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', flushSaveOnUnload)
})
</script>

<style scoped>
.canvas-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 16px 6px;
}
.spacer {
  flex: 1;
}
.orphan-toggle {
  font-size: 12px;
}
.orphan-alert {
  margin: 0 16px 6px;
}
.save-state {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin: 0 4px;
  white-space: nowrap;
}
.mode-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.plan-note {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* 主体：左素材面板 + 右故事线 */
.canvas-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
  padding: 0 16px;
}
.palette {
  width: 230px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.palette-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-soft);
  font-weight: 600;
}
.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}
.palette-sec {
  font-size: 12px;
  color: var(--ink-500);
  margin-bottom: 8px;
}
.palette-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.palette-item {
  cursor: pointer;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--brand-050);
}
.palette-item:hover {
  border-color: var(--ink-400);
}
.palette-item img {
  width: 100%;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  display: block;
}
.palette-item span {
  display: block;
  font-size: 11px;
  padding: 4px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--surface);
}
.palette-empty,
.palette-tip {
  font-size: 12px;
  color: var(--ink-400);
  padding: 8px 0;
  line-height: 1.5;
}
.palette-tip {
  margin-top: 10px;
  border-top: 1px dashed var(--line-soft);
}

/* 故事线 */
.lane-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  max-width: 880px;
  margin: 0 auto;
  width: 100%;
}
.lane-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 2px 10px;
}
.lane-head h2 {
  margin: 0;
  font-size: 16px;
}
.lane-head .el-button {
  margin-left: auto;
}
.lane {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px 24px;
}

/* 常驻预览面板 */
.preview-panel {
  flex: none;
  border-top: 1px solid var(--line);
  background: var(--surface);
  padding: 8px 16px 10px;
}

/* 字幕样式弹窗 */
.sub-style-body {
  display: flex;
  gap: 20px;
}
.sub-preview {
  flex: none;
  text-align: center;
}
.sub-frame {
  width: 180px;
  height: 320px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: linear-gradient(160deg, #2b2f3a 0%, #191c24 100%);
  position: relative;
}
.sub-sample {
  position: absolute;
  left: 50%;
  color: #fff;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}
.sub-preview-tip {
  font-size: 12px;
  color: var(--ink-400);
  margin-top: 8px;
  line-height: 1.5;
}
.sub-form {
  flex: 1;
  min-width: 0;
}
.ver-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

/* 素材选择弹窗 */
.pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  max-height: 62vh;
  overflow-y: auto;
}
.pick-card {
  cursor: pointer;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-md);
  overflow: hidden;
  transition: border-color 0.15s var(--ease);
}
.pick-card:hover {
  border-color: var(--ink-400);
}
.pick-thumb {
  position: relative;
  background: var(--brand-050);
}
.pick-thumb img {
  width: 100%;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  display: block;
}
.pick-badge {
  position: absolute;
  font-size: 11px;
  color: #fff;
  border-radius: 4px;
  padding: 1px 5px;
}
.pick-badge.dur {
  left: 6px;
  bottom: 6px;
  background: rgba(0, 0, 0, 0.65);
}
.pick-badge.ratio {
  right: 6px;
  top: 6px;
  background: rgba(0, 0, 0, 0.45);
}
.pick-name {
  font-size: 12px;
  padding: 6px 8px 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-note {
  font-size: 11px;
  color: var(--ink-400);
  padding: 0 8px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-empty {
  grid-column: 1 / -1;
  color: var(--ink-400);
  padding: 30px 0;
  text-align: center;
}
.pick-music-list {
  max-height: 56vh;
  overflow-y: auto;
}
.pick-music {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  margin-bottom: 8px;
  cursor: pointer;
}
.pick-music:hover {
  border-color: var(--ink-400);
}
.pick-music-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-music-ext {
  font-size: 11px;
  color: var(--ink-400);
}

/* 镜头详情弹窗 */
.shot-body {
  display: flex;
  gap: 18px;
}
.shot-player {
  flex: 1.2;
  min-width: 0;
}
.shot-stage {
  background: #000;
  border-radius: var(--r-md);
  overflow: hidden;
}
.shot-video {
  width: 100%;
  max-height: 56vh;
  display: block;
}
.shot-fallback {
  padding: 40px 20px;
  color: #fff;
  text-align: center;
  font-size: 13px;
}
.shot-fallback .el-button {
  margin-top: 12px;
}
.trim-wrap {
  margin-top: 10px;
}
.trim {
  position: relative;
  height: 26px;
  background: var(--brand-050);
  border-radius: 6px;
  cursor: pointer;
}
.trim-out {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
}
.trim-sel {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--brand-100);
  border-radius: 6px;
}
.trim-play {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--el-color-danger);
}
.trim-handle {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 26px;
  transform: translate(-50%, -50%);
  background: var(--surface);
  border: 1px solid var(--ink-400);
  border-radius: 4px;
  cursor: ew-resize;
}
.trim-handle.right {
  left: auto;
}
.trim-info {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--ink-500);
  margin-top: 6px;
}
.trim-len {
  color: var(--ink-900);
  font-weight: 600;
}
.shot-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  margin-top: 8px;
  color: var(--ink-700);
}
.shot-name {
  font-weight: 600;
}
.shot-tools {
  margin-top: 8px;
}
.shot-form {
  flex: 1;
  min-width: 0;
  max-height: 66vh;
  overflow-y: auto;
  padding-right: 4px;
}
</style>
