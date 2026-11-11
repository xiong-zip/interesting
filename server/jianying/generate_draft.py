"""根据剪辑计划 JSON 生成剪映专业版草稿。

用法: python generate_draft.py <plan.json>
plan.json 结构:
{
  "draftDir": "...", "draftName": "...", "width": 1080, "height": 1920, "fps": 30,
  "title": "片头标题", "endCard": "完", "bgmPath": "D:/bgm.mp3",
  "filter": "清透自然", "filterIntensity": 60,
  "transition": "叠化", "transitionDuration": "0.5s",
  "clips": [{ "path": "D:/a.mp4", "filename": "a.mp4", "subtitle": "剧情文字" }]
}
"""
import json
import csv
import difflib
import os
import sys

import pyJianYingDraft as draft

SEC = draft.SEC

# 本机 pyJianYingDraft 装的是哪个版本，决定了「哪些滤镜/转场真的能写进草稿」；
# 名字写错时不再静默回退，而是导出前报错并给候选，见 collect_style_errors()


def enum_member(enum_cls, name, fallback, warnings=None, label=""):
    """按名称取枚举；名称不存在时回退到 fallback，并记录一条可展示的警告。"""
    value = getattr(enum_cls, name, None) if name else None
    if value is not None:
        return value
    value = getattr(enum_cls, fallback, None)
    if value is None:
        members = list(enum_cls)
        if not members:
            raise ValueError(f"{enum_cls} 没有可用成员")
        value = members[0]
    if warnings is not None and name:
        warnings.append(f"{label or enum_cls.__name__}「{name}」当前 pyJianYingDraft 不支持，已回退为「{fallback}」")
    return value


def _enum_names(enum_cls):
    return [m.name for m in enum_cls]


# 名称表是静态文件，一次进程内只读一遍（一个项目可能校验几十个名字）
_POOL_CACHE = {}


def _skill_name_pool(enum_type):
    """从 jianying-editor skill 的 CSV 里取同名枚举的名称，用于区分「拼错了」和「本机版本太旧」。

    skill 库里收集的是新版剪映的完整名称表；本机 pyJianYingDraft 可能是旧版，
    提示时优先给本机真实可用的名字，其次才引用 skill 库。
    """
    if enum_type in _POOL_CACHE:
        return _POOL_CACHE[enum_type]
    root = os.getenv("JY_SKILL_ROOT", "").strip() or os.path.join(
        os.path.expanduser("~"), ".zcode", "skills", "jianying-editor"
    )
    fname = {"FilterType": "filters.csv", "TransitionType": "transitions.csv"}.get(enum_type)
    if not fname:
        return []
    path = os.path.join(root, "data", fname)
    if not os.path.isfile(path):
        return []
    names = []
    try:
        with open(path, encoding="utf-8", newline="") as f:
            rows = csv.DictReader(line for line in f if not line.startswith("#"))
            for row in rows:
                ident = (row.get("identifier") or "").strip()
                if ident and (row.get("enum_type") or "") == enum_type:
                    names.append(ident)
    except OSError:
        return []
    _POOL_CACHE[enum_type] = names
    return names


def _suggest(enum_cls, name):
    """返回 (候选名列表, 来源)。

    来源区分三种情况，提示语才能说清该「改名字」还是「升级依赖」：
      installed   —— 本机库里有相近的名字，直接用候选即可
      skill_only  —— 这个名字新版剪映支持，但本机 pyJianYingDraft 没有
      skill_hint  —— 本机没相近的，skill 素材库里有（升级后可用）
      none        —— 哪儿都没有
    """
    members = _enum_names(enum_cls)
    close = difflib.get_close_matches(name, members, n=3, cutoff=0.3)
    pool = _skill_name_pool(enum_cls.__name__)
    if name in pool and name not in members:
        return close, "skill_only"
    if close:
        return close, "installed"
    pool_close = difflib.get_close_matches(
        name, [x for x in pool if x not in members], n=3, cutoff=0.3
    )
    return (pool_close, "skill_hint") if pool_close else ([], "none")


def collect_style_errors(plan):
    """导出前校验滤镜/转场/字体名，避免"名字写错 → 静默回退 → 草稿和预期不符"。

    返回空列表表示全部可用；否则每项含 field/label/name/candidates/source。
    """
    errors = []

    def check(enum_cls, name, label, where):
        value = str(name or "").strip()
        if not value or value in ("无", "none"):
            return
        if getattr(enum_cls, value, None) is not None:
            return
        candidates, source = _suggest(enum_cls, value)
        errors.append(
            {
                "field": where,
                "label": label,
                "name": value,
                "candidates": candidates,
                "source": source,
            }
        )

    # 演示模式会用内置的滤镜/转场轮换，不需要校验画布上的名字
    if not plan.get("demoStyles"):
        for idx, clip in enumerate(plan.get("clips") or []):
            check(draft.FilterType, clip.get("filter") or plan.get("filter"), "滤镜", f"clips[{idx}].filter")
            check(
                draft.TransitionType,
                clip.get("transition") or plan.get("transition"),
                "转场",
                f"clips[{idx}].transition",
            )
        for idx, clip in enumerate(plan.get("clips") or []):
            for sub_idx, sub in enumerate(clip.get("subtitles") or []):
                check(draft.FontType, sub.get("font"), "字幕字体", f"clips[{idx}].subtitles[{sub_idx}].font")

    check(draft.FontType, (plan.get("subtitleStyle") or {}).get("font"), "字幕字体", "subtitleStyle.font")
    check(draft.FontType, plan.get("titleFont"), "标题字体", "titleFont")
    for idx, lyric in enumerate(plan.get("lyrics") or []):
        check(draft.FontType, lyric.get("font"), "歌词字体", f"lyrics[{idx}].font")
    return errors


def num_or(value, fallback):
    """计划里的数值可能是字符串或 null，解析失败时回落到默认样式。"""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    return n if n == n and abs(n) != float("inf") else fallback


def wrap_subtitle(text):
    """长句在中间标点处断成两行，提升可读性。"""
    text = (text or "").strip()
    if len(text) <= 12:
        return text
    mid = len(text) // 2
    marks = "，。！？、；：,.!?;:"
    candidates = [i for i, ch in enumerate(text) if ch in marks and 4 <= i <= len(text) - 4]
    if candidates:
        idx = min(candidates, key=lambda i: abs(i - mid))
        return text[:idx + 1].rstrip() + "\n" + text[idx + 1:].lstrip()
    return text[:mid] + "\n" + text[mid:]


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        plan = json.load(f)

    # 先校验样式名，名字不存在时直接返回结构化错误，不生成半成品草稿
    style_errors = collect_style_errors(plan)
    if style_errors:
        print(json.dumps({"ok": False, "code": "unknown_style", "errors": style_errors}, ensure_ascii=False))
        sys.exit(2)

    warnings = []
    os.makedirs(plan["draftDir"], exist_ok=True)
    folder = draft.DraftFolder(plan["draftDir"])
    script = folder.create_draft(
        plan["draftName"],
        plan.get("width", 1080),
        plan.get("height", 1920),
        fps=plan.get("fps", 30),
        allow_replace=True,
    )

    video_track = script.append_track(draft.TrackSpec(draft.TrackType.video))
    text_track = script.append_track(draft.TrackSpec(draft.TrackType.text, 'subtitle'))
    overlay_track = script.append_track(draft.TrackSpec(draft.TrackType.text, 'overlay'))
    lyrics_track = script.append_track(draft.TrackSpec(draft.TrackType.text, 'lyrics'))

    filter_intensity = plan.get("filterIntensity", 60)
    demo = plan.get("demoStyles")
    demo_filters = ["清透自然", "暖食", "情感电影", "日系奶油", "清晰明亮", "高清黑白"]
    demo_transitions = ["叠化", "闪白", "推近", "快涂擦除", "模糊", "闪黑"]

    cursor = 0
    built = []
    for idx, clip in enumerate(plan["clips"]):
        material = draft.VideoMaterial(clip["path"])
        total = int(material.duration)
        # 入点/出点（秒）与变速：只截取素材的一段
        in_us = max(0, int(float(clip.get("inPoint") or 0) * SEC))
        out_us = int(float(clip["outPoint"]) * SEC) if clip.get("outPoint") else total
        out_us = max(in_us + SEC // 30, min(out_us, total))
        src_duration = out_us - in_us
        speed = float(clip.get("speed") or 1)
        duration = max(SEC // 30, int(src_duration / speed))
        # 画面位置：预览里拖动素材写回的值，单位为半个画布
        tx = max(-1.0, min(1.0, num_or(clip.get("transformX"), 0.0)))
        ty = max(-1.0, min(1.0, num_or(clip.get("transformY"), 0.0)))
        segment = draft.VideoSegment(
            material,
            draft.Timerange(cursor, duration),
            source_timerange=draft.Timerange(in_us, src_duration),
            speed=speed if speed != 1 else None,
            volume=max(0.0, min(1.0, float(clip.get("volume", 1)))),
            clip_settings=draft.ClipSettings(transform_x=tx, transform_y=ty) if (tx or ty) else None,
        )
        # 以库实际计算出的时长推进时间轴，避免变速换算的取整误差造成 1 微秒重叠
        duration = int(segment.target_timerange.duration)
        # 调色：演示模式按片段轮换滤镜，否则用节点选择的滤镜
        if demo:
            current_filter = enum_member(draft.FilterType, demo_filters[idx % len(demo_filters)], "清透自然", warnings, "滤镜")
        else:
            current_filter = enum_member(draft.FilterType, clip.get("filter") or plan.get("filter", "清透自然"), "清晰明亮", warnings, "滤镜")
        segment.add_filter(current_filter, filter_intensity)
        built.append((segment, cursor, duration, clip))
        cursor += duration

    if not built:
        raise SystemExit("没有可用的视频片段")

    # 转场必须在前置片段加入轨道前设置，否则素材不会写入草稿
    for i, (segment, _, _, clip) in enumerate(built[:-1]):
        if demo:
            tname = demo_transitions[i % len(demo_transitions)]
            tduration = "0.5s"
        else:
            tname = clip.get("transition") or plan.get("transition", "叠化")
            tduration = clip.get("transitionDuration") or plan.get("transitionDuration", "0.5s")
            if isinstance(tduration, (int, float)):
                tduration = f"{tduration}s"
        if tname in ("无", "none", None):
            continue
        transition_type = enum_member(draft.TransitionType, tname, "叠化", warnings, "转场")
        segment.add_transition(transition_type, duration=tduration)

    for segment, start, duration, clip in built:
        script.add_segment(segment, video_track)
        subs = [s for s in (clip.get("subtitles") or []) if (s.get("text") or "").strip()]
        if not subs:
            continue
        # 一个字幕节点对应一段字幕；同一镜头有多条时按时间均分，避免重叠
        if len(subs) == 1:
            slots = [(start, duration)]
        else:
            slot = duration // len(subs)
            slots = [(start + i * slot, slot if i < len(subs) - 1 else duration - i * slot) for i in range(len(subs))]
        for (s_start, s_dur), sub in zip(slots, subs):
            # 字号 / 位置由画布统一指定，缺省时回落到原来的样式
            sub_size = num_or(sub.get("size"), 8.5)
            sub_y = max(-1.0, min(1.0, num_or(sub.get("position"), -0.66)))
            sub_x = max(-1.0, min(1.0, num_or(sub.get("positionX"), 0.0)))
            text = draft.TextSegment(
                wrap_subtitle(sub["text"]),
                draft.Timerange(s_start, s_dur),
                font=enum_member(draft.FontType, sub.get("font") or "抖音美好体", "抖音美好体", warnings, "字体"),
                style=draft.TextStyle(size=sub_size, bold=True, align=1, letter_spacing=1, line_spacing=2),
                border=draft.TextBorder(color=(0.0, 0.0, 0.0), width=45.0),
                shadow=draft.TextShadow(alpha=0.55, color=(0.0, 0.0, 0.0), diffuse=8.0, distance=3.0, angle=-45.0),
                clip_settings=draft.ClipSettings(transform_x=sub_x, transform_y=sub_y),
            )
            text.add_animation(draft.TextIntro.渐显, 0.4)
            text.add_animation(draft.TextOutro.渐隐, 0.3)
            script.add_segment(text, text_track)

    segments = built

    # 片头标题
    title = plan.get("title")
    if title:
        title_seg = draft.TextSegment(
            title,
            draft.Timerange(0, 2 * SEC),
            font=enum_member(draft.FontType, "抖音美好体", "SourceHanSansCN_Bold", warnings, "字体"),
            style=draft.TextStyle(size=18.0, bold=True, align=1, letter_spacing=2, line_spacing=2),
            border=draft.TextBorder(color=(0.0, 0.0, 0.0), width=55.0),
            shadow=draft.TextShadow(alpha=0.6, color=(0.0, 0.0, 0.0), diffuse=10.0, distance=4.0, angle=-45.0),
            clip_settings=draft.ClipSettings(transform_y=0.05),
        )
        title_seg.add_animation(draft.TextIntro.放大, 0.8)
        title_seg.add_animation(draft.TextOutro.渐隐, 0.5)
        script.add_segment(title_seg, overlay_track)

    # 片尾
    end_card = plan.get("endCard")
    if end_card and cursor > 2 * SEC:
        end_seg = draft.TextSegment(
            end_card,
            draft.Timerange(cursor - int(1.5 * SEC), int(1.5 * SEC)),
            font=enum_member(draft.FontType, "抖音美好体", "SourceHanSansCN_Bold", warnings, "字体"),
            style=draft.TextStyle(size=22.0, bold=True, align=1, letter_spacing=3),
            border=draft.TextBorder(color=(0.0, 0.0, 0.0), width=55.0),
            shadow=draft.TextShadow(alpha=0.6, color=(0.0, 0.0, 0.0), diffuse=10.0, distance=4.0, angle=-45.0),
        )
        end_seg.add_animation(draft.TextIntro.渐显, 0.8)
        end_seg.add_animation(draft.TextOutro.渐隐, 0.5)
        script.add_segment(end_seg, overlay_track)

    # 每个镜头自带的配乐：位置跟着镜头走。
    # 连续几个镜头用同一首曲子时合并成一段音轨，并从上次播放的位置接着放（source_timerange），
    # 否则每切一个镜头音乐就会从头重来。
    clip_bgm_plan = []
    music_cursor = {}   # 曲目 -> 已经播到的位置（微秒）
    music_length = {}   # 曲目 -> 素材总长
    runs = []           # [{path, start, dur, source_start, volume}]
    for _seg, start, duration, clip in built:
        path = clip.get("bgmPath")
        if not path or not os.path.exists(path):
            continue
        volume = float(clip.get("bgmVolume") if clip.get("bgmVolume") is not None else 0.3)
        if path not in music_length:
            try:
                music_length[path] = draft.AudioMaterial(path).duration
            except Exception:
                music_length[path] = 0
        length = music_length[path]
        source_start = music_cursor.get(path, 0)
        # 素材不够长就重新从头放，避免超出时长报错
        if length and source_start + duration > length:
            source_start = 0
        clip_bgm_plan.append((clip, start, duration))
        last = runs[-1] if runs else None
        adjacent = (
            last
            and last["path"] == path
            and abs(last["volume"] - volume) < 1e-6
            and last["start"] + last["dur"] == start
            and last["source_start"] + last["dur"] == source_start
        )
        if adjacent:
            last["dur"] += duration
        else:
            runs.append({"path": path, "start": start, "dur": duration, "source_start": source_start, "volume": volume})
        music_cursor[path] = source_start + duration

    for run in runs:
        try:
            audio_track = script.append_track(draft.TrackSpec(draft.TrackType.audio))
            audio = draft.AudioSegment(
                run["path"],
                draft.Timerange(run["start"], run["dur"]),
                source_timerange=draft.Timerange(run["source_start"], run["dur"]),
                volume=run["volume"],
            )
            audio.add_fade("0.5s", "1s")
            script.add_segment(audio, audio_track)
        except Exception as e:  # 单个镜头配乐失败不影响主流程
            print(f"镜头配乐添加失败: {e}", file=sys.stderr)

    # 全局 BGM（音量压低、淡入淡出）：镜头自带配乐时不叠加
    bgm = plan.get("bgmPath")
    bgm_used = False
    if bgm and os.path.exists(bgm) and not clip_bgm_plan:
        try:
            audio_track = script.append_track(draft.TrackSpec(draft.TrackType.audio))
            audio = draft.AudioSegment(bgm, draft.Timerange(0, cursor), volume=float(plan.get("bgmVolume", 0.25)))
            audio.add_fade("1s", "2s")
            script.add_segment(audio, audio_track)
            bgm_used = True
        except Exception as e:  # BGM 失败不影响主流程
            print(f"BGM 添加失败: {e}", file=sys.stderr)

    # 歌词字幕轨：按 LRC 时间轴逐句显示，独立于视频字幕
    lyrics = [l for l in (plan.get("lyrics") or []) if (l.get("text") or "").strip()]
    lyrics_count = 0
    for i, lyric in enumerate(lyrics):
        start_us = max(0, int(float(lyric["start"]) * SEC))
        if start_us >= cursor:
            break
        next_start = int(float(lyrics[i + 1]["start"]) * SEC) if i + 1 < len(lyrics) else cursor
        dur_us = max(SEC // 30, min(next_start - start_us, cursor - start_us))
        text = draft.TextSegment(
            wrap_subtitle(lyric["text"]),
            draft.Timerange(start_us, dur_us),
            font=enum_member(draft.FontType, lyric.get("font") or "抖音美好体", "抖音美好体", warnings, "字体"),
            style=draft.TextStyle(size=10.0, bold=True, align=1, letter_spacing=1, line_spacing=2),
            border=draft.TextBorder(color=(0.0, 0.0, 0.0), width=45.0),
            shadow=draft.TextShadow(alpha=0.6, color=(0.0, 0.0, 0.0), diffuse=9.0, distance=3.0, angle=-45.0),
            clip_settings=draft.ClipSettings(transform_y=-0.74),
        )
        text.add_animation(draft.TextIntro.渐显, 0.25)
        text.add_animation(draft.TextOutro.渐隐, 0.25)
        script.add_segment(text, lyrics_track)
        lyrics_count += 1

    script.save()
    print(json.dumps({
        "ok": True,
        "draftPath": os.path.join(plan["draftDir"], plan["draftName"]),
        "segments": len(segments),
        "durationUs": cursor,
        "bgm": bgm_used,
        "clipBgm": len(clip_bgm_plan),
        "clipBgmTracks": len(runs),
        "lyrics": lyrics_count,
        "warnings": warnings,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
