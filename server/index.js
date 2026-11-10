require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const hotRouter = require('./routes/hot')
const mediaRouter = require('./routes/media')
const musicRouter = require('./routes/music')
const projectsRouter = require('./routes/projects')
const scriptsRouter = require('./routes/scripts')
const topicsRouter = require('./routes/topics')
const aiRouter = require('./routes/ai')
const publishRouter = require('./routes/publish')
const healthRouter = require('./routes/health')
const db = require('./db')
const { scheduleBackups } = require('./backup')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.use('/api/hot', hotRouter)
app.use('/api/media', mediaRouter)
app.use('/api/music', musicRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/scripts', scriptsRouter)
app.use('/api/topics', topicsRouter)
app.use('/api/ai', aiRouter)
app.use('/api/publish', publishRouter)
app.use('/api/health', healthRouter)

// 设置读写（后台管理）
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  // key 脱敏
  if (settings.glm_api_key) settings.glm_api_key = settings.glm_api_key.slice(0, 6) + '****'
  res.json(settings)
})
app.post('/api/settings', (req, res) => {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body || {})) {
      // 脱敏值跳过
      if (value && value.includes('****')) continue
      upsert.run(key, String(value))
    }
  })
  tx()
  res.json({ ok: true })
})

// 生产模式托管前端构建产物
const dist = path.join(__dirname, '..', 'dist')
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`[server] Creator Studio 后端已启动: http://localhost:${PORT}`)
  // 启动时补一份当天备份，之后每 6 小时检查一次
  scheduleBackups()
})
