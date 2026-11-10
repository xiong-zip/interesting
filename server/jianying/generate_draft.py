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
import os
import sys

import pyJianYingDraft as draft

SEC = draft.SEC


def enum_member(enum_cls, name, fallback):
    return getattr(enum_cls, name, None) or getattr(enum_cls, fallback)


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
        segment = draft.VideoSegment(
            material,
            draft.Timerange(cursor, duration),
            source_timerange=draft.Timerange(in_us, src_duration),
            speed=speed if speed != 1 else None,
            volume=max(0.0, min(1.0, float(clip.get("volume", 1)))),
        )
        # 以库实际计算出的时长推进时间轴，避免变速换算的取整误差造成 1 微秒重叠
        duration = int(segment.target_timerange.duration)
        # 调色：演示模式按片段轮换滤镜，否则用节点选择的滤镜
        if demo:
            current_filter = enum_member(draft.FilterType, demo_filters[idx % len(demo_filters)], "清透自然")
        else:
            current_filter = enum_member(draft.FilterType, clip.get("filter") or plan.get("filter", "清透自然"), "清晰明亮")
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
        transition_type = enum_member(draft.TransitionType, tname, "叠化")
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
            sub_y = num_or(sub.get("position"), -0.66)
            text = draft.TextSegment(
                wrap_subtitle(sub["text"]),
                draft.Timerange(s_start, s_dur),
                font=enum_member(draft.FontType, sub.get("font") or "抖音美好体", "抖音美好体"),
                style=draft.TextStyle(size=sub_size, bold=True, align=1, letter_spacing=1, line_spacing=2),
                border=draft.TextBorder(color=(0.0, 0.0, 0.0), width=45.0),
                shadow=draft.TextShadow(alpha=0.55, color=(0.0, 0.0, 0.0), diffuse=8.0, distance=3.0, angle=-45.0),
                clip_settings=draft.ClipSettings(transform_y=max(-1.0, min(1.0, sub_y))),
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
            font=enum_member(draft.FontType, "抖音美好体", "SourceHanSansCN_Bold"),
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
            font=enum_member(draft.FontType, "抖音美好体", "SourceHanSansCN_Bold"),
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
            font=enum_member(draft.FontType, lyric.get("font") or "抖音美好体", "抖音美好体"),
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
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
