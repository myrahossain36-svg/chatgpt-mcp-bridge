# Demo video source

The README demo is a motion-graphics animation, rendered frame by frame from `demo.html` in headless Chrome.

```bash
pip install playwright
python3 render.py            # writes scene_*.mp4 (needs ffmpeg and Chrome)
printf "file 'scene_title.mp4'\nfile 'scene_chat.mp4'\nfile 'scene_end.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy demo.mp4
ffmpeg -i demo.mp4 -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 demo.gif
```

The conversation shown is illustrative. Real replies depend on the model. Edit the `USER`, `CLAUDE1`, `GPT` and `CLAUDE2` strings in `demo.html` to make your own.
