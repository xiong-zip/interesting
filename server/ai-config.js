// AI 服务商配置解析：智谱 GLM / DeepSeek（两者都是 OpenAI 兼容的 chat/completions 接口）
// 纯函数、依赖注入 getSetting/env，便于单测；路由层只管调用，不感知服务商差异
const PROVIDERS = {
  glm: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keySetting: 'glm_api_key',
    keyEnv: 'GLM_API_KEY',
    modelSetting: 'glm_model',
    modelEnv: 'GLM_MODEL',
    defaultModel: 'glm-4-air',
    keyHint: 'open.bigmodel.cn 获取',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keySetting: 'deepseek_api_key',
    keyEnv: 'DEEPSEEK_API_KEY',
    modelSetting: 'deepseek_model',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-flash',
    keyHint: 'platform.deepseek.com 获取，充值后按量计费',
  },
}

// getSetting: (key) => string | undefined；env 默认 process.env
function resolveAIConfig(getSetting, env = process.env) {
  const raw = getSetting('ai_provider')
  const provider = raw && PROVIDERS[raw] ? raw : 'glm'
  const p = PROVIDERS[provider]
  return {
    provider,
    providerName: p.name,
    // ai_base_url 设置可覆盖（换代理/私有网关用），末尾斜杠统一去掉
    baseUrl: String(getSetting('ai_base_url') || p.baseUrl).replace(/\/+$/, ''),
    key: getSetting(p.keySetting) || env[p.keyEnv] || '',
    model: getSetting(p.modelSetting) || env[p.modelEnv] || p.defaultModel,
  }
}

module.exports = { PROVIDERS, resolveAIConfig }
