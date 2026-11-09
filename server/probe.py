"""读取视频分辨率与时长（不需要 ffprobe，复用 imageio-ffmpeg 自带的 ffmpeg）。

用法: python probe.py <视频路径>
输出: {"width":1080,"height":1920,"duration":12.34}
"""
import json
import re
import subprocess
import sys

import imageio_ffmpeg


def main():
    src = sys.argv[1]
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    # ffmpeg -i 只探测不转码，信息输出在 stderr
    out = subprocess.run(
        [exe, "-i", src],
        capture_output=True,
        text=True,
        errors="ignore",
        timeout=60,
    )
    text = out.stderr or ""

    width = height = 0
    m = re.search(r"Video:.*?\b(\d{2,5})x(\d{2,5})\b", text)
    if m:
        width, height = int(m.group(1)), int(m.group(2))

    duration = 0.0
    d = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if d:
        duration = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))

    print(json.dumps({"width": width, "height": height, "duration": duration}))


if __name__ == "__main__":
    main()
