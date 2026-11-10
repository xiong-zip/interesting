<template>
  <div class="canvas-page">
    <div class="toolbar">
      <el-select v-model="projectId" placeholder="选择项目" style="width: 220px" @change="loadProject">
        <el-option v-for="p in projectOptions" :key="p.id" :label="projectLabel(p)" :value="p.id" />
      </el-select>
      <el-link v-if="orphanCount" type="info" :underline="false" class="orphan-toggle" @click="showOrphanProjects = !showOrphanProjects">
        {{ showOrphanProjects ? '隐藏' : '显示' }}{{ orphanCount }} 个脚本已删除的画布
      </el-link>
      <el-button @click="newProject">新建项目</el-button>
      <el-button v-if="projectId" type="danger" plain @click="removeProject">删除项目</el-button>
      <div class="spacer" />
      <el-button-group v-if="projectId">
        <el-button size="small" @click="addNode('plot')">＋剧情</el-button>
        <el-button size="small" @click="addNode('role')">＋角色</el-button>
        <el-button size="small" @click="addNode('video')">＋镜头</el-button>
        <el-button size="small" @click="addNode('scene')">＋集成</el-button>
        <el-button size="small" @click="togglePalette">素材面板</el-button>
        <el-button size="small" @click="addNode('hot')">＋热点</el-button>
      </el-button-group>
      <el-button v-if="projectId" size="small" @click="organize">⚡ 一键整理</el-button>
      <el-button v-if="projectId" size="small" @click="toggleTextSummary">{{ showTextSummary ? '📝 摘要开' : '📝 摘要关' }}</el-button>
      <el-button v-if="projectId" size="small" @click="kbVisible = true">⌨️ 快捷键</el-button>
      <el-button v-if="projectId" size="small" @click="openSubtitleStyle">🎨 字幕样式</el-button>
      <el-button v-if="projectId" type="primary" size="small" :loading="saving" @click="save">
        保存{{ dirty ? ' *' : '' }}
      </el-button>
      <el-button v-if="projectId" size="small" :loading="autoPlanning" @click="autoPlan">🤖 自动编排</el-button>
      <el-button v-if="projectId" size="small" @click="aiFromCanvas">AI 生成脚本</el-button>
      <el-button v-if="projectId" size="small" :loading="exporting" @click="exportJianying">导出剪映草稿</el-button>
      <el-button v-if="projectId" size="small" @click="timelinePreviewVisible = true">▶ 预览</el-button>
      <span class="tip">双击镜头节点填字幕 / 配乐并设置入点变速，剧情用剧情节点写，点击连线设置转场</span>
    </div>

    <!-- 当前画布的原脚本已删除时给个说明，避免它看起来像凭空多出来的项目 -->
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
          <div class="palette-tip">字幕 / 配乐写在镜头节点里：双击镜头节点填写；剧情用独立的剧情节点</div>
        </div>
      </div>
      <VueFlow
        id="main-flow"
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-viewport="{ zoom: 1 }"
        :connection-radius="100"
        :disable-keyboard-a11y="true"
        :zoom-on-double-click="false"
        :edges-updatable="true"
        fit-view-on-init
        @nodesChange="onNodesChange"
        @edgesChange="markDirty"
        @connect="onConnect"
        @edge-update="onEdgeUpdate"
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
        <template #node-video="props"><VideoNode v-bind="props" :compact="nodeCompact" @inspect="inspectNode" /></template>
        <template #node-scene="props"><SceneNode v-bind="props" @inspect="inspectNode" @drop-media="onDropToScene" /></template>
        <template #node-audio="props"><AudioNode v-bind="props" @inspect="inspectNode" /></template>
        <template #node-subtitle="props"><SubtitleNode v-bind="props" @edit="openEdit" /></template>
        <template #node-hot="props"><HotNode v-bind="props" /></template>
      </VueFlow>
    </div>

    <!-- 选中镜头时的右侧详情：不用点开弹窗就能读到字幕 / 配乐 -->
    <aside v-if="selectedVideo" class="shot-aside">
      <div class="aside-head">
        <span class="aside-title" :title="selectedVideo.data?.filename">🎥 {{ selectedVideo.data?.filename }}</span>
        <button class="aside-close" title="关闭" @click="clearSelection">×</button>
      </div>
      <div class="aside-body">
        <div class="field">
          <label>字幕 <span class="count">{{ subCount }} 条</span></label>
          <el-input
            ref="asideSubRef"
            :model-value="selectedVideo.data?.subtitle || ''"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="一行一条，按镜头时长均分"
            @change="(v) => updateSelectedVideo({ subtitle: String(v) })"
          />
          <div class="field-actions">
            <el-button size="small" text type="primary" @click="appendSubtitleLine">＋ 添加一条字幕</el-button>
            <el-button size="small" text @click="openSubtitleStyle">🎨 全片样式</el-button>
            <span class="field-hint">一行 = 一条字幕</span>
          </div>
        </div>
        <div class="field">
          <label>配乐</label>
          <el-select
            :model-value="selectedVideo.data?.musicId ?? null"
            clearable
            filterable
            size="small"
            placeholder="不设置则用全局 BGM"
            style="width: 100%"
            @update:model-value="onAsideMusic"
          >
            <el-option v-for="m in musicFiles" :key="m.id" :label="m.filename" :value="m.id" />
          </el-select>
          <el-slider
            v-if="selectedVideo.data?.musicId"
            :model-value="Number(selectedVideo.data?.musicVolume ?? 0.3)"
            :min="0"
            :max="1"
            :step="0.05"
            size="small"
            @update:model-value="(v) => updateSelectedVideo({ musicVolume: Number(v) })"
          />
          <div class="field-actions">
            <el-button v-if="prevShotMusic" size="small" text type="primary" @click="inheritMusic">
              沿用上一镜头：{{ prevShotMusic.data?.musicName || prevShotMusic.data?.filename }}
            </el-button>
            <span v-else class="field-hint">{{ selectedVideo.data?.musicId ? '与前后镜头同曲会接着播' : '' }}</span>
          </div>
        </div>
        <div class="field">
          <label>镜头参数</label>
          <div class="chips">
            <span class="chip">✂️ {{ asideTrim }}</span>
            <span v-if="Number(selectedVideo.data?.speed) !== 1" class="chip">{{ selectedVideo.data?.speed }}x</span>
            <span v-if="selectedVideo.data?.filter" class="chip">{{ selectedVideo.data.filter }}</span>
          </div>
        </div>
        <el-button size="small" type="primary" plain style="width: 100%" @click="openShotFromAside">
          播放 / 裁剪 / 高级设置
        </el-button>
      </div>
    </aside>
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

    <!-- 全局字幕样式：文字仍写在镜头里，字体 / 字号 / 位置全片统一 -->
    <el-dialog v-model="subtitleStyleVisible" title="🎨 字幕样式（全片统一）" width="min(660px, 96vw)">
      <div class="sub-style-body">
        <!-- 9:16 画面预览：字号 / 位置按剪映画布比例换算，调参数即时看效果 -->
        <div class="sub-preview">
          <div class="sub-frame">
            <span class="sub-sample" :style="subtitlePreviewCss">{{ subtitleSample }}</span>
          </div>
          <div class="sub-preview-tip">9:16 预览 · 以剪映实际字号等比换算</div>
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

    <!-- 热点选择 -->
    <el-dialog v-model="hotPickVisible" title="选择热点" width="560px" append-to-body>
      <div class="pick-music-list">
        <div v-for="(h, i) in hotList" :key="`${i}-${h.title}`" class="pick-music" @click="pickHot(h)">
          <span class="pick-music-icon">🔥</span>
          <span class="pick-music-name" :title="h.title">{{ h.title }}</span>
          <span class="pick-music-ext">{{ h.platformName }}</span>
        </div>
        <div v-if="!hotList.length" class="pick-empty">暂无可选热点，先去热点中心刷新</div>
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
        <el-dropdown trigger="click" @command="addBoardNode">
          <el-button size="small" type="primary" plain>＋ 添加节点</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="plot">🎬 剧情</el-dropdown-item>
              <el-dropdown-item command="role">👤 角色</el-dropdown-item>
              <el-dropdown-item command="video">🎞 素材</el-dropdown-item>
              <el-dropdown-item command="audio">🎵 音乐</el-dropdown-item>
              <el-dropdown-item command="subtitle">💬 字幕</el-dropdown-item>
              <el-dropdown-item command="hot">🔥 热点</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" @click="organizeBoard">⚡ 一键整理</el-button>
        <span class="board-tip">拖动卡片右侧连接点到另一张卡片左侧（或依次点两个连接点）串顺序；没连线的卡片按位置排在最后。剧情 / 角色 / 热点只作说明</span>
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
          v-model:edges="sceneBoardEdges"
          :nodes-connectable="true"
          :edges-updatable="false"
          :zoom-on-double-click="false"
          :min-zoom="0.3"
          :max-zoom="2"
          :default-viewport="{ zoom: 0.9 }"
          fit-view-on-init
          @connect="onBoardConnect"
          @edge-click="onBoardEdgeClick"
        >
          <Background pattern-color="#dbe7ff" :gap="18" />
          <Controls />
          <template #node-scene-item="props">
            <SceneItemNode v-bind="props" @remove="removeBoardItem" />
          </template>
        </VueFlow>
        <div v-if="!sceneBoardNodes.length" class="board-empty">点「添加节点」放入剧情 / 角色 / 素材 / 音乐 / 字幕卡片，再用连线串起播放顺序</div>
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

    <!-- AI 生成 -->
    <el-dialog v-model="aiVisible" title="根据画布生成脚本" width="720px" top="5vh">
      <el-input v-model="aiResult" type="textarea" :rows="14" v-loading="aiGenerating" placeholder="将把画布上的剧情节点内容作为剧情笔记，点击开始生成（素材、音乐、字幕不参与脚本）" />
      <template #footer>
        <el-button type="primary" :loading="aiGenerating" @click="doAiGenerate">开始生成</el-button>
        <el-button :disabled="!aiResult" @click="saveAiScript">保存为脚本</el-button>
      </template>
    </el-dialog>
    <!-- 镜头：双击打开，左侧播放视频，右侧是功能操作 -->
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

          <!-- 裁剪条：拖两端手柄设入点 / 出点 -->
          <div v-if="shotDuration" class="trim-wrap">
            <div ref="trimRef" class="trim" title="拖两端设置入点/出点；播放只在选中区间内" @pointerdown="onTrimSeek">
              <div class="trim-out" :style="{ left: 0, width: inPct + '%' }" />
              <div class="trim-out" :style="{ left: outPct + '%', width: 100 - outPct + '%' }" />
              <div class="trim-sel" :style="{ left: inPct + '%', width: Math.max(0, outPct - inPct) + '%' }" />
              <div class="trim-play" :style="{ left: playPct + '%' }" />
              <div class="trim-handle" :style="{ left: inPct + '%' }" title="拖我设入点" @pointerdown.stop.prevent="startTrim('in', $event)" />
              <div class="trim-handle right" :style="{ left: outPct + '%' }" title="拖我设出点" @pointerdown.stop.prevent="startTrim('out', $event)" />
            </div>
            <div class="trim-info">
              <span>入点 {{ fmtShort(inClamped) }}</span>
              <span>出点 {{ fmtShort(outClamped) }}</span>
              <span class="trim-len">
                {{ fmtShort(clipLen) }}
                <template v-if="Number(nodeForm.speed) !== 1"> → {{ fmtShort(clipLen / (Number(nodeForm.speed) || 1)) }}</template>
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
            <el-divider content-position="left">这条镜头的内容</el-divider>
            <el-form-item label="字幕（一行一条，按镜头时长均分）">
              <el-input v-model="nodeForm.subtitle" type="textarea" :rows="3" resize="none" placeholder="例如：&#10;这一段写不下就换行&#10;每行会依次显示" />
            </el-form-item>
            <el-form-item label="配乐">
              <el-select v-model="nodeForm.musicId" clearable filterable placeholder="不设置则用全局 BGM" style="width: 100%">
                <el-option v-for="m in musicFiles" :key="m.id" :label="m.filename" :value="m.id" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="nodeForm.musicId" label="配乐音量">
              <el-slider v-model="nodeForm.musicVolume" :min="0" :max="1" :step="0.05" show-input />
            </el-form-item>
            <el-alert type="info" :closable="false" title="出点超过素材时长时自动截断；变速后的片段时长会自动换算。镜头配了音乐后不再叠加全局 BGM" />
          </el-form>
        </div>
      </div>
      <template #footer>
        <el-button @click="inspectorVisible = false">取消</el-button>
        <el-button type="primary" @click="applyInspector">应用</el-button>
      </template>
    </el-dialog>

    <!-- 音乐节点 / 连线：右侧抽屉，跟镜头弹窗区分开；不加遮罩，画布还能继续操作 -->
    <el-drawer
      v-model="panelVisible"
      :title="panelTitle"
      size="360px"
      destroy-on-close
      :modal="false"
      :modal-penetrable="true"
      :lock-scroll="false"
      append-to-body
      class="panel-drawer"
    >
      <el-form v-if="panelType === 'audio'" label-position="top">
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
        <el-divider />
        <el-button type="danger" plain style="width: 100%" @click="deleteEdge">删除这条连线</el-button>
        <div class="drawer-tip">删掉连线后两个镜头不再有先后关系，导出顺序会按画布位置排</div>
      </el-form>
      <template #footer>
        <el-button @click="panelVisible = false">取消</el-button>
        <el-button type="primary" @click="applyPanel">应用</el-button>
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
// 同一个页面里有两个 VueFlow 实例：主画布和集成节点弹窗。必须各自显式指定 id，
// 否则 useVueFlow 会把最后创建的 store provide 给所有子组件，导致弹窗画布的节点渲染到主画布上。
const { fitView, screenToFlowCoordinate, panBy, viewport, updateEdge } = useVueFlow('main-flow')
const { fitView: fitViewBoard } = useVueFlow('scene-board')

// 当前视口中心（转换成画布坐标），用于新节点默认落点
function viewCenter() {
  const el = document.querySelector('.vue-flow')
  if (!el) return { x: 100, y: 100 }
  const rect = el.getBoundingClientRect()
  return screenToFlowCoordinate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
}

// 一键整理的布局：按连线方向走
// - 左右连线（默认手柄）→ 横向推进一列
// - 上下连线（上/下手柄）→ 纵向推进一行
// 环上和孤立节点放到最右侧一列。主画布和集成节点弹窗共用。
function topoLayout(ids, edges, colW, rowH, pad = 0) {
  const idSet = new Set(ids)
  const parents = new Map(ids.map((id) => [id, []]))
  const children = new Map(ids.map((id) => [id, []]))
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target) || e.source === e.target) continue
    parents.get(e.target).push(e)
    children.get(e.source).push(e)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }
  const isVertical = (e) => e.sourceHandle === 'sb' || e.targetHandle === 'tt'
  const linked = (id) => parents.get(id).length > 0 || children.get(id).length > 0

  // Kahn 拓扑序（只看有连线的节点，孤立节点最后单独排）
  const deg = new Map(indeg)
  const queue = ids.filter((id) => linked(id) && deg.get(id) === 0)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const e of children.get(id)) {
      deg.set(e.target, deg.get(e.target) - 1)
      if (deg.get(e.target) === 0) queue.push(e.target)
    }
  }
  // 成环的节点排在拓扑序最后，仍然按父节点位置摆放
  for (const id of ids) if (linked(id) && !order.includes(id)) order.push(id)

  const cell = new Map()
  const used = new Set()
  const free = (col, row) => !used.has(`${col},${row}`)
  const place = (id, col, row) => {
    while (!free(col, row)) row++
    cell.set(id, { col, row })
    used.add(`${col},${row}`)
  }

  for (const id of order) {
    const ins = parents.get(id)
    const h = ins.filter((e) => !isVertical(e) && cell.has(e.source)).map((e) => cell.get(e.source))
    const v = ins.filter((e) => isVertical(e) && cell.has(e.source)).map((e) => cell.get(e.source))
    let col = 0
    let row = 0
    if (h.length) {
      col = Math.max(...h.map((c) => c.col)) + 1
      row = Math.min(...h.map((c) => c.row))
    }
    if (v.length) {
      row = Math.max(...v.map((c) => c.row)) + 1
      if (!h.length) col = Math.max(...v.map((c) => c.col))
    }
    place(id, col, row)
  }

  // 没有连线的节点：最右一列依次往下排
  const maxCol = cell.size ? Math.max(...[...cell.values()].map((c) => c.col)) + 1 : 0
  for (const id of ids) {
    if (!cell.has(id)) place(id, maxCol, 0)
  }

  const posMap = new Map()
  for (const [id, c] of cell) posMap.set(id, { x: c.col * colW + pad, y: c.row * rowH + pad })
  return posMap
}

// 一键整理：按连线方向和关系排版
function organize() {
  if (!nodes.value.length) return
  const posMap = topoLayout(nodes.value.map((n) => n.id), edges.value, 300, 190)
  nodes.value = nodes.value.map((n) =>
    posMap.has(n.id) ? { ...n, position: posMap.get(n.id) } : n,
  )
  markDirty()
  ElMessage.success('已整理布局')
  setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
}
const projects = ref([])
const projectId = ref(Number(localStorage.getItem('lastProject')) || null)
// 脚本已删除的画布默认折叠，避免下拉框里一堆删不掉的残留
const showOrphanProjects = ref(false)
const orphanCount = computed(() => projects.value.filter((p) => p.orphan).length)
const currentProject = computed(() => projects.value.find((p) => p.id === projectId.value) || null)
const projectOptions = computed(() => {
  const list = projects.value
  if (showOrphanProjects.value) return list
  // 当前选中的孤儿画布要保留，否则下拉框显示不出它的名字
  return list.filter((p) => !p.orphan || p.id === projectId.value)
})
function projectLabel(p) {
  return p.orphan ? `${p.name}（脚本已删）` : p.name
}
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

// 拖拽连线：把新连接写入 edges（记下从哪个手柄拉出来的，刷新后线才不会跳回默认锚点）
function onConnect(params) {
  if (!params?.source || !params.target || params.source === params.target) return
  const exists = edges.value.some(
    (e) => e.source === params.source && e.target === params.target && e.sourceHandle === (params.sourceHandle ?? null) && e.targetHandle === (params.targetHandle ?? null),
  )
  if (!exists) {
    edges.value.push({
      id: `e${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle ?? null,
      targetHandle: params.targetHandle ?? null,
      animated: true,
    })
    markDirty()
  }
}

// 拖动已有连线的端点：改接到别的节点 / 另一侧手柄（横线变竖线就靠这个）
function onEdgeUpdate({ edge, connection }) {
  if (!edge?.id || !connection?.source || !connection?.target) return
  const updated = updateEdge(edge, connection)
  if (!updated) return
  markDirty()
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

// 镜头弹窗里的播放器
const timelinePreviewVisible = ref(false)
const shotVideoRef = ref(null)
const trimRef = ref(null)
const shotDuration = ref(0)
const shotPlayTime = ref(0)
const shotPlayFailed = ref(false)
const editingMediaId = ref(null)
const editingNodeData = ref(null)

function fmtSec(sec) {
  const s = Math.max(0, Number(sec) || 0)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
// 裁剪条上的时间：一分钟以内带一位小数，别把 0.9s 显示成 00:00
function fmtShort(sec) {
  const s = Math.max(0, Number(sec) || 0)
  return s >= 60 ? fmtSec(s) : `${s.toFixed(1)}s`
}

// 入点 / 出点都夹在素材范围内；出点填 0 表示到结尾
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
  // 打开就定位到入点，方便确认起点
  const start = Number(nodeForm.value.inPoint) || 0
  if (v && start > 0) {
    try {
      v.currentTime = Math.min(start, shotDuration.value)
    } catch {}
  }
  // 变速：试听也按设定速度播放
  if (v) v.playbackRate = Number(nodeForm.value.speed) || 1
}


function onShotTime(e) {
  const v = e.target
  shotPlayTime.value = v.currentTime || 0
  // 设了出点就播到出点自动停，直接看到这段镜头有多长
  const out = Number(nodeForm.value.outPoint) || 0
  if (out > 0 && v.currentTime >= out - 0.03 && !v.paused) v.pause()
}

// 播放只在 [入点, 出点] 区间内：起播位置不在区间里就先跳到入点
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

// 把播放器当前时间填进入点 / 出点
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

// 拖手柄：改入点 / 出点，同时把播放器定位到那一帧
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

// 点裁剪条空白处：只移动播放位置，不改入出点
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
function clearSelection() {
  selectedIds.clear()
  lastClickId.value = null
}

/* ---------------- 卡片摘要与右侧详情 ---------------- */
// 摘要开关：关掉只显示画面；缩得太小时也自动只显示画面，避免文字糊成一团
// 画布最小缩放是 0.5，所以阈值放在 0.55：缩到底就切画面模式
const showTextSummary = ref(localStorage.getItem('canvas_text_summary') !== '0')
const zoomLevel = computed(() => Number(viewport.value?.zoom) || 1)
const nodeCompact = computed(() => !showTextSummary.value || zoomLevel.value < 0.55)
function toggleTextSummary() {
  showTextSummary.value = !showTextSummary.value
  localStorage.setItem('canvas_text_summary', showTextSummary.value ? '1' : '0')
}

const selectedVideo = computed(() => {
  const id = lastClickId.value
  if (!id) return null
  const node = nodes.value.find((n) => n.id === id)
  return node && node.type === 'video' ? node : null
})
const subCount = computed(
  () =>
    String(selectedVideo.value?.data?.subtitle || '')
      .split(/\r?\n/)
      .filter((s) => s.trim()).length,
)
const asideTrim = computed(() => {
  const d = selectedVideo.value?.data || {}
  const start = Number(d.inPoint) || 0
  const end = Number(d.outPoint) || 0
  return `${start.toFixed(1)}s – ${end ? `${end.toFixed(1)}s` : '结尾'}`
})

function updateSelectedVideo(patch) {
  const id = selectedVideo.value?.id
  if (!id) return
  nodes.value = nodes.value.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  markDirty()
}

// 加一条字幕：追加空行并把光标放进去，直接接着打字
const asideSubRef = ref(null)
function appendSubtitleLine() {
  const node = selectedVideo.value
  if (!node) return
  const cur = String(node.data?.subtitle || '').replace(/\s+$/, '')
  updateSelectedVideo({ subtitle: cur ? `${cur}\n` : '' })
  // 等 DOM 把新行渲染出来再聚焦（直接 nextTick 有时会被按钮的焦点抢回去）
  setTimeout(() => {
    const el = asideSubRef.value?.textarea || document.querySelector('.shot-aside textarea')
    if (!el) return
    el.focus()
    const pos = el.value.length
    el.setSelectionRange?.(pos, pos)
    el.scrollTop = el.scrollHeight
  }, 50)
}
function onAsideMusic(id) {
  const music = id != null ? musicFiles.value.find((m) => m.id === id) : null
  updateSelectedVideo({ musicId: music ? music.id : null, musicName: music ? music.filename : '' })
}

// 「上一镜头」= 有连线指向当前镜头的那个节点；它配了音乐就能一键沿用
const prevShotMusic = computed(() => {
  const node = selectedVideo.value
  if (!node) return null
  const inEdge = edges.value.find((e) => e.target === node.id)
  if (!inEdge) return null
  const src = nodes.value.find((n) => n.id === inEdge.source)
  return src && src.type === 'video' && src.data?.musicId ? src : null
})
function inheritMusic() {
  const prev = prevShotMusic.value
  if (!prev) return
  updateSelectedVideo({
    musicId: prev.data.musicId,
    musicName: prev.data.musicName || '',
    musicVolume: prev.data.musicVolume != null ? Number(prev.data.musicVolume) : 0.3,
  })
}
function openShotFromAside() {
  const node = selectedVideo.value
  if (node) onNodeDblClick({ node })
}
// 选中镜头时把音乐列表备好
watch(selectedVideo, (node) => {
  if (node) loadMusicList()
})

/* ---------------- 素材面板与拖拽 ---------------- */
const paletteVisible = ref(false)
const paletteItems = ref([])
function togglePalette() {
  paletteVisible.value = !paletteVisible.value
  if (paletteVisible.value) {
    api.get('/media/list').then(({ data }) => (paletteItems.value = data.items || []))
  }
}
function onPaletteDragStart(e, payload) {
  const raw = JSON.stringify(payload)
  e.dataTransfer.setData('application/x-creator-media', raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'copy'
}
function appendSceneItem(sceneId, payload) {
  const item = { ...payload, id: payload.id || newItemId() }
  nodes.value = nodes.value.map((n) =>
    n.id === sceneId ? { ...n, data: { ...n.data, items: [...(n.data?.items || []), item] } } : n,
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
  item.id = newItemId()
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
const sceneBoardEdges = ref([])
const sceneNote = ref('')

// 集成节点里的卡片 id 要跨会话稳定，连线才能记住指向哪张卡片
function newItemId() {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
function boardPosition(index) {
  return { x: 40 + (index % 3) * 240, y: 40 + Math.floor(index / 3) * 190 }
}
function addBoardItem(payload) {
  const id = payload.id || newItemId()
  sceneBoardNodes.value.push({
    id,
    type: 'scene-item',
    position: boardPosition(sceneBoardNodes.value.length),
    data: { ...payload, id },
  })
}
function openSceneBoard(node) {
  boardSceneId.value = node.id
  sceneNote.value = node.data?.note || ''
  const items = node.data?.items || []
  // 老数据的卡片没有 id，用下标补一个，保存时写回
  sceneBoardNodes.value = items.map((it, i) => {
    const id = it.id || `i${i + 1}`
    return {
      id,
      type: 'scene-item',
      position: it.position && it.position.x != null ? { ...it.position } : boardPosition(i),
      data: { ...it, id },
    }
  })
  sceneBoardEdges.value = (node.data?.edges || []).map((e) => ({ ...e }))
  boardVisible.value = true
}
// 连线：卡片右侧连接点拖到另一张卡片左侧
function onBoardConnect(params) {
  if (!params?.source || !params.target || params.source === params.target) return
  const exists = sceneBoardEdges.value.some((e) => e.source === params.source && e.target === params.target)
  if (exists) return
  sceneBoardEdges.value.push({
    id: `be${params.source}-${params.target}-${Date.now()}`,
    source: params.source,
    target: params.target,
    animated: true,
  })
}
async function onBoardEdgeClick({ edge }) {
  try {
    await ElMessageBox.confirm('删除这条连线？删除后两张卡片各自按位置排序。', '删除连线', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  sceneBoardEdges.value = sceneBoardEdges.value.filter((e) => e.id !== edge.id)
}
function addBoardSubtitle() {
  addBoardItem({ kind: 'subtitle', text: '', font: '' })
}
// 弹窗画布的「添加节点」：剧情 / 角色 / 热点是说明卡片，素材 / 音乐 / 字幕进成片
function addBoardNode(type) {
  if (type === 'video') return openVideoPick(null, 'board')
  if (type === 'audio') return openMusicPick(null, 'board')
  if (type === 'hot') return openHotPick(null, 'board')
  if (type === 'subtitle') return addBoardSubtitle()
  const defaults = {
    plot: { kind: 'plot', title: '新剧情', content: '' },
    role: { kind: 'role', title: '新角色', content: '' },
  }
  if (!defaults[type]) return
  addBoardItem({ ...defaults[type] })
}
// 一键整理：和主画布一样按连线拓扑分层
function organizeBoard() {
  if (!sceneBoardNodes.value.length) return
  const posMap = topoLayout(sceneBoardNodes.value.map((n) => n.id), sceneBoardEdges.value, 240, 190, 40)
  sceneBoardNodes.value = sceneBoardNodes.value.map((n) =>
    posMap.has(n.id) ? { ...n, position: { ...posMap.get(n.id) } } : n,
  )
  setTimeout(() => fitViewBoard({ padding: 0.2, duration: 300 }), 50)
  ElMessage.success('已整理布局')
}
function removeBoardItem(id) {
  sceneBoardNodes.value = sceneBoardNodes.value.filter((n) => n.id !== id)
  sceneBoardEdges.value = sceneBoardEdges.value.filter((e) => e.source !== id && e.target !== id)
}
function saveBoard() {
  // 卡片 id、位置和连线都要存下来：导出顺序由连线决定，没连线的卡片回退到位置顺序
  const items = [...sceneBoardNodes.value]
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((n) => ({ ...n.data, id: n.id, position: { ...n.position } }))
  const boardEdges = sceneBoardEdges.value.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  nodes.value = nodes.value.map((n) =>
    n.id === boardSceneId.value
      ? { ...n, data: { ...n.data, items, edges: boardEdges, note: sceneNote.value.trim() } }
      : n,
  )
  boardVisible.value = false
  markDirty()
  ElMessage.success(`已更新集成节点（${items.length} 个卡片）`)
}

/* ---------------- 镜头 / 转场设置 ---------------- */
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const fonts = ['抖音美好体', '思源粗宋', '站酷文艺体', '得意黑', '庞门正道标题体', '无界黑', '优设标题黑', '未来黑', '快乐体']

/* ---------------- 全片字幕样式 ---------------- */
// 字幕文字写在镜头里，字体 / 字号 / 位置存进画布 JSON，导出和预览都读这一份
const DEFAULT_SUBTITLE_STYLE = { font: '', size: 8.5, position: -0.66 }
const subtitleStyle = ref({ ...DEFAULT_SUBTITLE_STYLE })
const subtitleStyleForm = ref({ ...DEFAULT_SUBTITLE_STYLE })
const subtitleStyleVisible = ref(false)
// 位置预设：顶部 0.6、居中 0、底部 -0.66，落在中间就是自定义
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
  }
  subtitleStyleVisible.value = false
  dirty.value = true
  ElMessage.success('字幕样式已应用，保存后导出和预览都会同步')
}
// 样式弹窗里的 9:16 预览：优先用第一个镜头里的第一句字幕当样本
const SUB_PREVIEW_W = 180
const subtitleSample = computed(() => {
  const node = nodes.value.find((n) => n.type === 'video' && String(n.data?.subtitle || '').trim())
  const first = node
    ? String(node.data.subtitle).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
    : ''
  if (!first) return '这是一句示例字幕'
  // 真实字幕一般两行以内，样本太长会把预览框塞满，截断后更能看清字号
  return first.length > 16 ? `${first.slice(0, 16)}…` : first
})
const subtitlePreviewCss = computed(() => {
  const f = subtitleStyleForm.value
  const size = Number(f.size) > 0 ? Number(f.size) : 8.5
  const pos = Number.isFinite(Number(f.position)) ? Math.max(-1, Math.min(1, Number(f.position))) : -0.66
  return {
    // 剪映里字号 8.5 ≈ 1080 宽画面下 60px，按预览框宽度等比换算
    fontSize: `${Math.max(6, (size * 7.06 * SUB_PREVIEW_W) / 1080).toFixed(1)}px`,
    // transform_y 以画面中心为 0，换成距底部的百分比
    bottom: `${((0.5 + pos * 0.5) * 100).toFixed(1)}%`,
    fontFamily: f.font ? `"${f.font}", "PingFang SC", "Microsoft YaHei", sans-serif` : '',
  }
})
const filters = ['清透自然', '暖食', '情感电影', '日系奶油', '清晰明亮', '高清黑白']
const transitions = ['无', '叠化', '闪白', '推近', '快涂擦除', '模糊', '闪黑']
const inspectorVisible = ref(false)
const inspectorType = ref('video')
const editingNodeId = ref(null)
// 音乐节点 / 连线用右侧抽屉，不再占用中间的镜头弹窗
const panelVisible = ref(false)
const panelType = ref('edge')
const panelTitle = computed(() => {
  if (panelType.value === 'audio') {
    const node = nodes.value.find((n) => n.id === editingNodeId.value)
    return `背景音乐 · ${node?.data?.filename || ''}`
  }
  return '连线转场设置'
})
const nodeForm = ref({
  inPoint: 0,
  outPoint: 0,
  speed: 1,
  volume: 1,
  filter: '',
  subtitle: '',
  musicId: null,
  musicVolume: 0.3,
})
const audioForm = ref({ volume: 0.25 })
const edgeForm = ref({ id: '', transition: '叠化', transitionDuration: 0.5 })

// 调速度立刻作用到试听播放器，不用等应用（放在 nodeForm 声明之后，避免初始化顺序问题）
watch(
  () => nodeForm.value.speed,
  (s) => {
    const v = shotVideoRef.value
    if (v) v.playbackRate = Number(s) || 1
  },
)
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
    panelType.value = 'audio'
    editingNodeId.value = node.id
    audioForm.value = { volume: node.data?.volume != null ? Number(node.data.volume) : 0.25 }
    panelVisible.value = true
    return
  }
  if (node.type !== 'video') return
  inspectorType.value = 'video'
  editingNodeId.value = node.id
  panelVisible.value = false // 镜头弹窗已经占中间，把右侧抽屉收掉避免叠在一起
  editingMediaId.value = node.data?.mediaId ?? null
  editingNodeData.value = node.data
  shotDuration.value = 0
  shotPlayFailed.value = false
  nodeForm.value = {
    inPoint: Number(node.data?.inPoint) || 0,
    outPoint: Number(node.data?.outPoint) || 0,
    speed: Number(node.data?.speed) || 1,
    volume: node.data?.volume != null ? Number(node.data.volume) : 1,
    filter: node.data?.filter || '',
    subtitle: node.data?.subtitle || '',
    musicId: node.data?.musicId ?? null,
    musicVolume: node.data?.musicVolume != null ? Number(node.data.musicVolume) : 0.3,
  }
  loadMusicList()
  inspectorVisible.value = true
}

function onEdgeClick({ edge }) {
  panelType.value = 'edge'
  edgeForm.value = {
    id: edge.id,
    transition: edge.data?.transition || '叠化',
    transitionDuration: Number(edge.data?.transitionDuration) || 0.5,
  }
  panelVisible.value = true
}

// 删除连线：删完两个镜头不再有先后关系
async function deleteEdge() {
  const id = edgeForm.value.id
  if (!id) return
  try {
    await ElMessageBox.confirm('删除这条连线？两个镜头之间的先后关系会断开。', '删除连线', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  edges.value = edges.value.filter((e) => e.id !== id)
  panelVisible.value = false
  markDirty()
  ElMessage.success('已删除连线')
}

function applyPanel() {
  if (panelType.value === 'audio') {
    const volume = audioForm.value.volume
    nodes.value = nodes.value.map((n) =>
      n.id === editingNodeId.value ? { ...n, data: { ...n.data, volume } } : n,
    )
  } else {
    const f = edgeForm.value
    edges.value = edges.value.map((e) =>
      e.id === f.id
        ? { ...e, data: { ...e.data, transition: f.transition, transitionDuration: f.transitionDuration } }
        : e,
    )
  }
  panelVisible.value = false
  markDirty()
}

function applyInspector() {
  const f = nodeForm.value
  const music = f.musicId != null ? musicFiles.value.find((m) => m.id === f.musicId) : null
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
            subtitle: String(f.subtitle || '').trim(),
            musicId: music ? music.id : null,
            musicName: music ? music.filename : '',
            musicVolume: f.musicVolume,
          },
        }
      : n,
  )
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
  if (kbVisible.value || editVisible.value || videoPickVisible.value || musicPickVisible.value || hotPickVisible.value || boardVisible.value || aiVisible.value || inspectorVisible.value) return
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
    // 优先选正常项目，实在没有才落到脚本已删的画布
    const first = data.items.find((p) => !p.orphan) || data.items[0]
    projectId.value = first.id
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
    // 老连线的没有手柄 id，统一补成「右出左进」；这样节点有 4 个连接点也不会接错位置
    edges.value = (canvas.edges || []).map((e) => ({
      ...e,
      sourceHandle: e.sourceHandle ?? 'sr',
      targetHandle: e.targetHandle ?? 'tl',
    }))
    subtitleStyle.value = { ...DEFAULT_SUBTITLE_STYLE, ...(canvas.subtitleStyle || {}) }
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

// 删除整个项目（画布删不掉时的出口，也让「脚本删了画布还在」能收尾）
async function removeProject() {
  if (!projectId.value) return
  const name = currentProjectName() || `项目 ${projectId.value}`
  try {
    await ElMessageBox.confirm(
      `删除项目「${name}」？画布上的 ${nodes.value.length} 个节点会一起删除，无法恢复。`,
      '删除项目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await api.delete(`/projects/${projectId.value}`)
  ElMessage.success('项目已删除')
  localStorage.removeItem('lastProject')
  projectId.value = null
  nodes.value = []
  edges.value = []
  await loadProjects()
  if (!projectId.value) router.replace('/canvas')
}

async function save(auto = false) {
  if (!projectId.value) return
  saving.value = true
  try {
    // 剥离 selected/dragging 等瞬态属性，避免选中状态被持久化
    const clean = (list) => list.map(({ selected, dragging, resizing, ...rest }) => rest)
    // 连线重接后 Vue Flow 会把整份 GraphEdge（含节点快照）塞回来，这里只留必要字段
    const cleanEdges = edges.value.map((e) => {
      const out = {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      }
      if (e.data && Object.keys(e.data).length) out.data = e.data
      if (e.animated != null) out.animated = e.animated
      if (e.label) out.label = e.label
      if (e.type) out.type = e.type
      return out
    })
    await api.put(`/projects/${projectId.value}`, {
      canvas: { nodes: clean(nodes.value), edges: cleanEdges, subtitleStyle: { ...subtitleStyle.value } },
    })
    dirty.value = false
    if (!auto) ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

let nodeSeq = Date.now()
// 新节点落点：视口中心开始，和已有节点重叠就往右挪，挪到头再换行，避免叠在一起看不见
function freeSpot(width = 240, height = 220) {
  const c = viewCenter()
  const baseX = c.x - width / 2
  const baseY = c.y - height / 2
  const nodeSize = (n) => ({
    w: n.dimensions?.width || (n.type === 'scene' ? 420 : 240),
    h: n.dimensions?.height || (n.type === 'scene' ? 320 : 200),
  })
  const overlaps = (x, y) =>
    nodes.value.some((n) => {
      const { w, h } = nodeSize(n)
      return x < n.position.x + w + 20 && x + width + 20 > n.position.x && y < n.position.y + h + 20 && y + height + 20 > n.position.y
    })
  let x = baseX
  let y = baseY
  for (let i = 0; i < 40 && overlaps(x, y); i++) {
    x += width + 40
    if (i % 6 === 5) {
      x = baseX
      y += height + 40
    }
  }
  return { x, y }
}

function addNode(type) {
  nodeSeq++
  const center = freeSpot()
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
// 镜头设置里要选配乐，先确保音乐列表已加载
async function loadMusicList() {
  if (musicFiles.value.length) return
  const { data } = await api.get('/music/list')
  musicFiles.value = data.items || []
}
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
const hotPickVisible = ref(false)
const hotList = ref([])
const hotTarget = ref('node')
async function openHotPick(pos, target = 'node') {
  pendingPos.value = pos
  hotTarget.value = target
  const { data } = await api.get('/hot/list')
  hotList.value = (data.items || []).slice(0, 30)
  hotPickVisible.value = true
}
function pickHot(item) {
  if (!item) return
  if (hotTarget.value === 'board') {
    addBoardItem({ kind: 'hot', title: item.title, platform: item.platformName, url: item.url })
  } else {
    nodes.value.push({
      id: `n${++nodeSeq}`,
      type: 'hot',
      position: pendingPos.value,
      data: { title: item.title, platform: item.platformName, url: item.url },
    })
    markDirty()
  }
  hotPickVisible.value = false
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
// 剧本素材：独立剧情节点 + 镜头节点里写的剧情，都算剧情笔记
// 剧本素材只取独立剧情节点（镜头节点不再承载剧情文字）
function plotNotes() {
  return nodes.value
    .filter((n) => n.type === 'plot')
    .map((n) => `${n.data.title || '剧情'}：${n.data.content || ''}`)
}

async function aiFromCanvas() {
  if (!plotNotes().length) {
    ElMessage.warning('画布上还没有剧情节点，先添加剧情再生成脚本')
    return
  }
  await save(true)
  aiResult.value = ''
  aiVisible.value = true
}
async function doAiGenerate() {
  // 脚本只基于剧情笔记，素材/配乐属于画布编排，不参与剧本生成
  const notes = plotNotes()
  if (!notes.length) {
    ElMessage.warning('画布上还没有剧情')
    return
  }
  aiGenerating.value = true
  try {
    const { data } = await api.post('/ai/script', { notes: notes.join('\n'), topic: currentProjectName() })
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
.canvas-body { flex: 1; min-height: 0; display: flex; }
.flow-wrap {
  flex: 1;
  min-width: 0;
  min-height: 420px;
  position: relative;
  margin: 0 16px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}
.flow-wrap :deep(.vue-flow) { width: 100%; height: 100%; }
/* 上下连接点常驻但淡一点，鼠标移到节点上变实；隐藏会导致拖拽起点抓不到 */
.flow-wrap :deep(.vue-flow__handle-top),
.flow-wrap :deep(.vue-flow__handle-bottom) {
  opacity: 0.45;
  transition: opacity 0.15s;
}
.flow-wrap :deep(.vue-flow__node:hover .vue-flow__handle-top),
.flow-wrap :deep(.vue-flow__node:hover .vue-flow__handle-bottom) {
  opacity: 1;
}
/* 连线端点：平时淡一点，悬停连线时变实，拖它可以改接 */
.flow-wrap :deep(.vue-flow__edgeupdater) { opacity: 0.35; transition: opacity 0.15s; }
.flow-wrap :deep(.vue-flow__edge:hover .vue-flow__edgeupdater),
.flow-wrap :deep(.vue-flow__edgeupdater:hover) { opacity: 1; }

/* 右侧镜头详情 */
.shot-aside {
  width: 340px;
  flex: 0 0 340px;
  margin: 0 16px 16px 0;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.aside-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.aside-title { flex: 1; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aside-close { border: none; background: transparent; font-size: 18px; line-height: 1; color: var(--el-text-color-secondary); cursor: pointer; padding: 0 4px; }
.aside-close:hover { color: var(--el-color-danger); }
.aside-body { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field > label { font-size: 12px; color: var(--el-text-color-secondary); display: flex; justify-content: space-between; }
.field .count { color: var(--el-text-color-placeholder); }
.field-actions { display: flex; align-items: center; justify-content: space-between; }
.field-hint { font-size: 11px; color: var(--el-text-color-placeholder); }
.field :deep(.el-textarea__inner) { font-size: 12px; line-height: 1.6; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: var(--el-fill-color-light); color: var(--el-text-color-regular); }
.toolbar { display: flex; gap: 10px; align-items: center; padding: 12px 16px; flex-wrap: wrap; }
.spacer { flex: 1; }
.tip { font-size: 12px; color: var(--el-text-color-secondary); }
.orphan-toggle { font-size: 12px; }
.orphan-alert { margin: 0 16px 8px; }
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
.palette-tip { padding: 4px 10px 10px; font-size: 11px; line-height: 1.6; color: var(--el-text-color-placeholder); border-top: 1px dashed var(--el-border-color-lighter); }
.play-fallback { text-align: center; padding: 40px 0; color: var(--el-text-color-secondary); }

/* 镜头弹窗：左播放 + 右操作 */
.shot-body { display: flex; gap: 18px; align-items: flex-start; }
.shot-player { width: 520px; flex: 0 0 520px; display: flex; flex-direction: column; gap: 8px; }
.shot-stage { background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; }
.shot-video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
.shot-fallback { color: #ccc; text-align: center; padding: 24px; font-size: 13px; line-height: 1.7; }
.shot-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--el-text-color-secondary); }
.shot-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.shot-tools { display: flex; gap: 8px; }
.shot-tools .el-button { flex: 1; margin-left: 0; }

/* 裁剪条 */
.drawer-tip { font-size: 12px; color: var(--el-text-color-placeholder); margin-top: 8px; line-height: 1.6; }
.trim-wrap { user-select: none; }
.trim {
  position: relative;
  height: 30px;
  border-radius: 6px;
  background: var(--el-fill-color-dark);
  cursor: pointer;
  touch-action: none;
}
.trim-out { position: absolute; top: 0; bottom: 0; background: rgba(0, 0, 0, 0.45); pointer-events: none; }
.trim-sel {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.18);
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
  pointer-events: none;
}
.trim-play { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #fff; box-shadow: 0 0 4px rgba(0, 0, 0, 0.6); pointer-events: none; }
.trim-handle {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 12px;
  margin-left: -6px;
  border-radius: 4px;
  background: var(--el-color-primary);
  cursor: ew-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}
.trim-handle::after { content: ''; width: 2px; height: 12px; background: rgba(255, 255, 255, 0.9); border-radius: 1px; }
.trim-handle:hover { background: var(--el-color-primary-light-3); }
.trim-info { display: flex; justify-content: space-between; font-size: 12px; color: var(--el-text-color-secondary); margin-top: 6px; }
.trim-len { color: var(--el-color-primary); font-weight: 600; }
.shot-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.shot-form { flex: 1; min-width: 0; max-height: 66vh; overflow-y: auto; padding-right: 6px; }
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
/* 字幕样式弹窗：左边 9:16 画面预览，右边参数 */
.sub-style-body { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.sub-preview { flex: 0 0 180px; margin: 0 auto; text-align: center; }
.sub-frame {
  position: relative;
  width: 180px;
  height: 320px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(165deg, #2b3a4d 0%, #45566b 45%, #1f2937 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12), 0 4px 14px rgba(0, 0, 0, 0.18);
}
/* 假画面：几条竖向渐变模拟素材，让字幕位置更好判断 */
.sub-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0 24%, transparent 24% 32%, rgba(255, 255, 255, 0.04) 32% 68%, transparent 68%),
    radial-gradient(circle at 70% 30%, rgba(255, 255, 255, 0.12), transparent 55%);
}
.sub-sample {
  position: absolute;
  left: 6%;
  width: 88%;
  text-align: center;
  color: #fff;
  font-weight: 700;
  line-height: 1.35;
  text-shadow: 0 2px 5px rgba(0, 0, 0, 0.9), 0 0 2px #000;
  white-space: pre-wrap;
  word-break: break-all;
}
.sub-preview-tip { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 8px; }
.sub-form { flex: 1 1 300px; min-width: 0; }
</style>
