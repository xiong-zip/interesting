import { describe, it, expect } from 'vitest'
import styleError from '../server/jianying/style-error.js'

const { describeFailure, describeStyleError } = styleError

const fail = (payload, stderr = '') => ({
  status: 2,
  stdout: typeof payload === 'string' ? payload : JSON.stringify(payload),
  stderr,
})

describe('describeStyleError', () => {
  it('本机库有相近名字时给出候选', () => {
    expect(
      describeStyleError({ label: '滤镜', name: '复古', candidates: ['英伦复古', '港风复古'], source: 'installed' }),
    ).toBe('滤镜「复古」本机剪映/Python 库不认识；最接近：英伦复古、港风复古')
  })

  it('名字存在于新版库时提示升级而不是拼错', () => {
    expect(
      describeStyleError({ label: '滤镜', name: '入夏', candidates: ['漫夏', '岚夏'], source: 'skill_only' }),
    ).toBe('滤镜「入夏」新版剪映支持，本机 pyJianYingDraft 还没有；升级依赖后可用，或先改成：漫夏、岚夏')
  })

  it('本机没有相近名字、只在新版素材库里出现时给出升级提示', () => {
    expect(describeStyleError({ label: '转场', name: '光效', candidates: ['光效擦除'], source: 'skill_hint' })).toBe(
      '转场「光效」本机剪映/Python 库不认识；jianying-editor 素材库里有相近的：光效擦除（需升级 pyJianYingDraft）',
    )
  })

  it('没有候选时提示换名字', () => {
    expect(describeStyleError({ label: '字幕字体', name: 'xxx', candidates: [], source: 'none' })).toBe(
      '字幕字体「xxx」本机剪映/Python 库不认识，请换一个名字',
    )
  })
})

describe('describeFailure', () => {
  it('解析 unknown_style 结构化错误', () => {
    const message = describeFailure(
      fail({
        ok: false,
        code: 'unknown_style',
        errors: [{ label: '滤镜', name: '复古', candidates: ['英伦复古'], source: 'installed' }],
      }),
    )
    expect(message).toContain('滤镜「复古」')
    expect(message).toContain('英伦复古')
  })

  it('超过两项时只展开前两项并给出总数', () => {
    const errors = [
      { label: '滤镜', name: 'a', candidates: ['A'], source: 'installed' },
      { label: '转场', name: 'b', candidates: ['B'], source: 'installed' },
      { label: '字幕字体', name: 'c', candidates: ['C'], source: 'installed' },
    ]
    const message = describeFailure(fail({ ok: false, code: 'unknown_style', errors }))
    expect(message).toContain('滤镜「a」')
    expect(message).toContain('转场「b」')
    expect(message).not.toContain('字幕字体「c」')
    expect(message).toContain('等 3 项需要纠正')
  })

  it('普通失败保留原始日志', () => {
    const message = describeFailure(fail('Traceback: boom', 'ModuleNotFoundError: pyJianYingDraft'))
    expect(message).toBe('生成剪映草稿失败: ModuleNotFoundError: pyJianYingDraft')
  })

  it('结构化输出里没有 errors 时也走兜底', () => {
    const message = describeFailure(fail({ ok: false, code: 'other' }, 'other error'))
    expect(message).toBe('生成剪映草稿失败: other error')
  })
})
