const express = require('express')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('../db')

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

function hashpwd(pwd) {
  return crypto.createHash('sha256').update(pwd + '::creator-studio').digest('hex')
}

// 首次启动种子账号：admin / admin123
function seedAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get()
  if (row.n === 0) {
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hashpwd('admin123'))
    console.log('[seed] 已创建默认账号 admin / admin123（请登录后在后台修改密码）')
  }
}
seedAdmin()

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '')
  if (!user || user.password !== hashpwd(password || '')) {
    return res.status(400).json({ error: '用户名或密码错误' })
  }
  res.json({ token: sign(user), user: { id: user.id, username: user.username } })
})

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

router.post('/password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user || user.password !== hashpwd(oldPassword || '')) {
    return res.status(400).json({ error: '原密码错误' })
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' })
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashpwd(newPassword), user.id)
  res.json({ ok: true })
})

module.exports = { router, authMiddleware }
