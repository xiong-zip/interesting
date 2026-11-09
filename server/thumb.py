"""用 imageio-ffmpeg 自带的 ffmpeg 抽取视频封面帧。

用法: python thumb.py <视频路径> <输出 jpg 路径>
"""
import subprocess
import sys

import imageio_ffmpeg


def main():
    src, out = sys.argv[1], sys.argv[2]
    exe = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [exe, "-y", "-ss", "0.5", "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out],
        check=True,
        capture_output=True,
        timeout=120,
    )


if __name__ == "__main__":
    main()
