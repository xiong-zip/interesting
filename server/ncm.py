"""批量解码网易云 .ncm 加密文件（复用已安装的 ncmdump 库）。

用法: python ncm.py '["D:/music/a.ncm", "D:/music/b.ncm"]'
输出: [{"source":"...","ok":true,"output":"...","skipped":false}]
      [{"source":"...","ok":false,"error":"..."}]

解码结果就写在 .ncm 旁边（同名 .mp3 / .flac），封面和标签由 ncmdump 一并写入，
扫描时能直接按普通音频识别。
"""
import json
import os
import sys


def extract_cover(audio_path, base):
    """把内嵌封面抽成同名图片，扫描时才能识别封面（已有同名图片则跳过）。"""
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if os.path.exists(base + ext):
            return base + ext

    data = mime = None
    if audio_path.lower().endswith(".mp3"):
        from mutagen.id3 import ID3

        tags = ID3(audio_path)
        for key in tags.keys():
            if key.startswith("APIC"):
                data, mime = tags[key].data, tags[key].mime
                break
    elif audio_path.lower().endswith(".flac"):
        from mutagen.flac import FLAC

        pictures = FLAC(audio_path).pictures
        if pictures:
            data, mime = pictures[0].data, pictures[0].mime

    if not data:
        return ""
    is_png = data[:4] == b"\x89PNG" or "png" in (mime or "").lower()
    out = base + (".png" if is_png else ".jpg")
    with open(out, "wb") as f:
        f.write(data)
    return out


def decode_one(path):
    from ncmdump.core import dump

    base = os.path.splitext(path)[0]
    # skip=True：目标文件已存在时不再重复解码
    output = dump(path, skip=True)
    skipped = False
    if output is None:
        # 已解码过：按同名 mp3/flac 找回来
        for ext in (".mp3", ".flac"):
            if os.path.exists(base + ext):
                output = base + ext
                skipped = True
                break
    if not output or not os.path.exists(output):
        return {"source": path, "ok": False, "error": "解码后没有找到输出文件"}

    audio_base = os.path.splitext(output)[0]
    try:
        cover = extract_cover(output, audio_base)
    except Exception:
        cover = ""  # 封面抽不出来不影响音频本身
    return {"source": path, "ok": True, "output": output, "skipped": skipped, "cover": cover}


def main():
    # stdin 统一按 utf-8 读，避免 Windows 控制台默认编码把中文路径弄乱
    paths = json.loads(sys.stdin.buffer.read().decode("utf-8") or "[]")
    results = []
    for path in paths:
        try:
            results.append(decode_one(path))
        except AssertionError:
            # 文件头不是 CTENFDAM，多半是改名或损坏的假 .ncm
            results.append({"source": path, "ok": False, "error": "不是有效的 .ncm 文件（文件头不匹配）"})
        except Exception as e:  # 单个文件失败不影响其它文件
            results.append({"source": path, "ok": False, "error": f"{type(e).__name__}: {e}"})
    # 统一输出，避免 Windows 控制台编码问题
    sys.stdout.write(json.dumps(results, ensure_ascii=True))


if __name__ == "__main__":
    main()
