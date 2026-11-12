import { describe, it, expect } from 'vitest'
import { resolveAIConfig, PROVIDERS } from '../server/ai-config.js'

// 构造一个 settings 表的内存替身
const makeGetSetting = (map = {}) => (k) => map[k]

describe('resolveAIConfig', () => {
  it('无任何配置时默认智谱 GLM', () => {
    const cfg = resolveAIConfig(makeGetSetting(), {})
    expect(cfg.provider).toBe('glm')
    expect(cfg.providerName).toBe('智谱 GLM')
    expect(cfg.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect(cfg.model).toBe('glm-4-air')
    expect(cfg.key).toBe('')
  })

  it('切到 DeepSeek 后读 deepseek_* 配置', () => {
    const cfg = resolveAIConfig(
      makeGetSetting({
        ai_provider: 'deepseek',
        deepseek_api_key: 'sk-x',
        deepseek_model: 'deepseek-reasoner',
      }),
      {},
    )
    expect(cfg.provider).toBe('deepseek')
    expect(cfg.baseUrl).toBe('https://api.deepseek.com')
    expect(cfg.key).toBe('sk-x')
    expect(cfg.model).toBe('deepseek-reasoner')
  })

  it('未知 provider 值回退 glm，不抛错', () => {
    expect(resolveAIConfig(makeGetSetting({ ai_provider: 'gpt9' }), {}).provider).toBe('glm')
  })

  it('settings 没配 key 时回退环境变量', () => {
    const cfg = resolveAIConfig(makeGetSetting({ ai_provider: 'deepseek' }), {
      DEEPSEEK_API_KEY: 'sk-env',
      DEEPSEEK_MODEL: 'deepseek-chat',
    })
    expect(cfg.key).toBe('sk-env')
    expect(cfg.model).toBe('deepseek-chat')
  })

  it('settings 优先于环境变量', () => {
    const cfg = resolveAIConfig(makeGetSetting({ glm_api_key: 'sk-db', glm_model: 'glm-4-plus' }), {
      GLM_API_KEY: 'sk-env',
    })
    expect(cfg.key).toBe('sk-db')
    expect(cfg.model).toBe('glm-4-plus')
  })

  it('ai_base_url 可覆盖且去掉尾斜杠', () => {
    const cfg = resolveAIConfig(makeGetSetting({ ai_base_url: 'https://my-proxy.example/v1/' }), {})
    expect(cfg.baseUrl).toBe('https://my-proxy.example/v1')
  })

  it('PROVIDERS 两个服务商字段齐全', () => {
    for (const [key, p] of Object.entries(PROVIDERS)) {
      expect(p.name).toBeTruthy()
      expect(p.baseUrl).toMatch(/^https:\/\//)
      expect(p.defaultModel).toBeTruthy()
      expect(p.keySetting).toBe(`${key === 'glm' ? 'glm' : 'deepseek'}_api_key`)
    }
  })
})
