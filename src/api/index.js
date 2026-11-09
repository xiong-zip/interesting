import axios from 'axios'
import { ElMessage } from 'element-plus'

const api = axios.create({ baseURL: '/api' })

api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    ElMessage.error(err.response?.data?.error || err.message || '请求失败')
    return Promise.reject(err)
  },
)

export default api

// 媒体流地址，hash 用于让浏览器跳到指定时间点取封面帧
export function mediaUrl(id, hash = '') {
  return `/api/media/stream/${id}${hash}`
}

// 封面图（后端用 ffmpeg 抽帧，兼容 HEVC 等浏览器无法解码的素材）
export function thumbUrl(id) {
  return `/api/media/thumb/${id}`
}

// 音乐试听地址（支持 Range）
export function musicUrl(id) {
  return `/api/music/stream/${id}`
}

// 音乐同名封面（转码工具输出的 .jpg）
export function musicCoverUrl(id) {
  return `/api/music/cover/${id}`
}
