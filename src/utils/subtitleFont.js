// 剪映内置字体在浏览器里没有，预览只能用系统字体近似。
// 这里给每种字体挑一组最接近的本机字体，并配合字重/字距，让切换时能看出区别。
// 导出草稿时仍然写用户选的原字体名，不受这里影响。
export const FONT_PRESETS = {
  抖音美好体: { family: '"Microsoft YaHei", "Noto Sans SC", sans-serif', weight: 700, spacing: '0px' },
  思源粗宋: { family: '"Noto Serif SC", "SimSun", serif', weight: 700, spacing: '0.5px' },
  站酷文艺体: { family: '"KaiTi", "STKaiti", "Noto Serif SC", serif', weight: 600, spacing: '1px' },
  得意黑: { family: '"DengXian", "Microsoft YaHei", "Noto Sans SC", sans-serif', weight: 800, spacing: '-0.5px' },
  庞门正道标题体: { family: '"SimHei", "Noto Sans SC", sans-serif', weight: 900, spacing: '2px' },
  无界黑: { family: '"Microsoft YaHei", "Noto Sans SC", sans-serif', weight: 700, spacing: '3px' },
  优设标题黑: { family: '"SimHei", "Microsoft YaHei", sans-serif', weight: 900, spacing: '0.5px' },
  未来黑: { family: '"DengXian", "Noto Sans SC", sans-serif', weight: 500, spacing: '4px' },
  快乐体: { family: '"YouYuan", "KaiTi", "Comic Sans MS", cursive', weight: 500, spacing: '1.5px' },
}

const DEFAULT_PRESET = FONT_PRESETS['抖音美好体']

// 返回可以直接合并进 :style 的字体样式
export function subtitleFontCss(font) {
  const preset = FONT_PRESETS[font] || DEFAULT_PRESET
  return {
    // 原字体名放最前面：用户把剪映字体装进系统后，预览会自动变成真实字体
    fontFamily: font ? `"${font}", ${preset.family}` : preset.family,
    fontWeight: preset.weight,
    letterSpacing: preset.spacing,
  }
}
