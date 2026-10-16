"""Find the opponent's card plays in a Clash Royale screen recording.

    python3 detector/detect.py my_match.mp4
    python3 detector/detect.py my_match.mp4 --my-cards "Hog Rider,Musketeer,Ice Golem,Skeletons,Ice Spirit,Cannon,Fireball,The Log"

Writes my_match.plays.json next to the video. Load it in the page under
Replay -> Import detections, set the match start, and elixir and cycle follow.

Runs on a recording after the match. It never touches the game or your phone.

The unit detector (models/units_M_480x352.onnx) and the ally/enemy classifier
(models/side.onnx) are from ClashRoyaleBuildABot by Peter Batchelor, MIT licence
(models/LICENSE-ClashRoyaleBuildABot.md), as vendored in ClashRoyaleAi. The
pre-processing below re-implements what that project does: crop the arena band,
letterbox to the model size with grey 114 padding, scale to 0..1. It was trained
on emulator screenshots, so phone recordings may score lower; check it on your
own matches.

Needs: pip install onnxruntime opencv-python-headless numpy
Then once: python3 detector/get_models.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import cv2
import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from plays import UNIT_TO_CARD, Det, Settings, group_plays, track_units  # noqa: E402

CLASSES = json.load(open(os.path.join(HERE, "classes.json")))
# Same band of the screen the original detector looks at: below the top HUD,
# above the card hand.
ARENA_Y0, ARENA_Y1 = 0.05, 0.80


class UnitModel:
    def __init__(self, models_dir=os.path.join(HERE, "models")):
        if not os.path.exists(os.path.join(models_dir, "units_M_480x352.onnx")):
            raise SystemExit("The detector models are not downloaded yet. Run: python3 detector/get_models.py")
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.units = ort.InferenceSession(os.path.join(models_dir, "units_M_480x352.onnx"), opts,
                                          providers=["CPUExecutionProvider"])
        self.side = ort.InferenceSession(os.path.join(models_dir, "side.onnx"), opts,
                                         providers=["CPUExecutionProvider"])
        inp = self.units.get_inputs()[0]
        self.in_name = inp.name
        self.mh, self.mw = inp.shape[2:]
        self.side_in = self.side.get_inputs()[0].name

    def detect(self, rgb, min_conf=0.3):
        """rgb: the game screen (H, W, 3) uint8. Returns [(unit, (x1,y1,x2,y2), conf)]
        in the screen's own pixels."""
        h, w = rgb.shape[:2]
        y0, y1 = int(ARENA_Y0 * h), int(ARENA_Y1 * h)
        band = rgb[y0:y1]
        bh, bw = band.shape[:2]
        scale = min(self.mw / bw, self.mh / bh)
        nw, nh = int(bw * scale), int(bh * scale)
        small = cv2.resize(band, (nw, nh), interpolation=cv2.INTER_LINEAR)
        pad_x, pad_y = self.mw - nw, self.mh - nh
        left, top = pad_x - pad_x // 2, pad_y - pad_y // 2
        canvas = np.full((self.mh, self.mw, 3), 114, np.uint8)
        canvas[top:top + nh, left:left + nw] = small
        x = (canvas.astype(np.float16) / 255).transpose(2, 0, 1)[None]
        out = self.units.run(None, {self.in_name: x})[0][0].astype(np.float32)
        out = out[out[:, 4] >= min_conf]
        dets = []
        for x1, yy1, x2, yy2, conf, cls in out:
            box = ((x1 - left) / scale, (yy1 - top) / scale + y0, (x2 - left) / scale, (yy2 - top) / scale + y0)
            box = tuple(int(round(v)) for v in box)
            dets.append((CLASSES[int(cls)], box, float(conf)))
        return dets

    def is_enemy(self, rgb, box):
        x1, y1, x2, y2 = box
        crop = rgb[max(0, y1):max(y1 + 1, y2), max(0, x1):max(x1 + 1, x2)]
        if crop.size == 0:
            return True
        small = cv2.resize(crop, (16, 16), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
        p = self.side.run(None, {self.side_in: small[None]})[0][0]
        return int(np.argmax(p)) == 1  # index 1 is "enemy" in the original


def game_rect(frame):
    """Trim black bars around the game, which phone recordings often have."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    rows = np.where(gray.mean(axis=1) > 12)[0]
    cols = np.where(gray.mean(axis=0) > 12)[0]
    if len(rows) < 10 or len(cols) < 10:
        return 0, 0, frame.shape[1], frame.shape[0]
    return int(cols[0]), int(rows[0]), int(cols[-1] - cols[0] + 1), int(rows[-1] - rows[0] + 1)


def analyse(path, fps=4.0, my_cards=None, crop=None, settings=Settings(), debug_dir=None, log=print):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"Could not open {path}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, round(src_fps / fps))
    model = UnitModel()
    mine = set(my_cards or [])

    frames, raw, rect, i, t0 = [], [], crop, 0, time.time()
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, bgr = cap.retrieve()
            if not ok:
                break
            if rect is None:
                rect = game_rect(bgr)
            x, y, w, h = rect
            game = cv2.cvtColor(bgr[y:y + h, x:x + w], cv2.COLOR_BGR2RGB)
            t = i / src_fps
            dets = []
            for unit, box, conf in model.detect(game):
                card = UNIT_TO_CARD.get(unit)
                # If you said which cards you play, a unit from any other card
                # can only be theirs. Otherwise ask the side classifier.
                enemy = (card not in mine) if mine and card else model.is_enemy(game, box)
                raw.append({"vt": round(t, 2), "unit": unit, "box": box, "conf": round(conf, 3), "enemy": enemy})
                if enemy:
                    cx, cy = (box[0] + box[2]) / 2 / w, (box[1] + box[3]) / 2 / h
                    dets.append(Det(unit, cx, cy, conf))
            frames.append((t, dets))
            if debug_dir and int(t) % 5 == 0 and (i // step) % max(1, int(fps)) == 0:
                save_debug(debug_dir, game, [r for r in raw if r["vt"] == round(t, 2)], t)
            if len(frames) % 40 == 0:
                done = f"{i}/{total}" if total else str(i)
                log(f"  frame {done}, {len(frames) / (time.time() - t0):.1f} frames/s")
        i += 1
    cap.release()

    plays = group_plays(track_units(frames, settings), settings)
    return {
        "video": os.path.basename(path),
        "sampleFps": fps,
        "gameRect": rect,
        "frames": len(frames),
        "plays": [{"vt": p["t"], "card": p["card"], "units": p["units"], "conf": p["conf"]} for p in plays],
        "detections": raw,
    }


def replan(result, settings=Settings()):
    """Re-run the play finding on saved detections, without the model. For
    tuning the filters on a match that was already analysed."""
    x, y, w, h = result["gameRect"]
    by_t = {}
    for r in result["detections"]:
        by_t.setdefault(r["vt"], [])
        if r["enemy"]:
            b = r["box"]
            by_t[r["vt"]].append(Det(r["unit"], (b[0] + b[2]) / 2 / w, (b[1] + b[3]) / 2 / h, r["conf"]))
    plays = group_plays(track_units(sorted(by_t.items()), settings), settings)
    result["plays"] = [{"vt": p["t"], "card": p["card"], "units": p["units"], "conf": p["conf"]} for p in plays]
    return result


def save_debug(folder, rgb, dets, t):
    os.makedirs(folder, exist_ok=True)
    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    for d in dets:
        x1, y1, x2, y2 = d["box"]
        colour = (60, 60, 230) if d["enemy"] else (230, 140, 40)
        cv2.rectangle(img, (x1, y1), (x2, y2), colour, 2)
        cv2.putText(img, f'{d["unit"]} {d["conf"]:.2f}', (x1, max(12, y1 - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(folder, f"t{t:07.2f}.jpg"), img)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=4.0, help="frames per second to check (default 4)")
    ap.add_argument("--my-cards", default="", help="your 8 cards, comma separated; helps tell your units from theirs")
    ap.add_argument("--crop", default="", help="x,y,w,h of the game in the video, if auto-trim gets it wrong")
    ap.add_argument("--min-conf", type=float, default=Settings.min_conf)
    ap.add_argument("--debug", action="store_true", help="save labelled frames every 5 s to <video>.debug/")
    ap.add_argument("--replan", action="store_true", help="video is a .plays.json: redo the play finding only")
    ap.add_argument("-o", "--out", default="")
    a = ap.parse_args()

    s = Settings(min_conf=a.min_conf)
    crop = tuple(int(v) for v in a.crop.split(",")) if a.crop else None
    my_cards = [c.strip() for c in a.my_cards.split(",") if c.strip()]
    base = os.path.splitext(a.video)[0]
    if a.replan:
        result = replan(json.load(open(a.video)), s)
        out = a.out or a.video
    else:
        print(f"Reading {a.video} at {a.fps} frames/s ...")
        result = analyse(a.video, a.fps, my_cards, crop, s, base + ".debug" if a.debug else None)
        out = a.out or base + ".plays.json"
    with open(out, "w") as f:
        json.dump(result, f, indent=1)
    print(f"\n{len(result['plays'])} opponent plays found:")
    for p in result["plays"]:
        print(f"  {p['vt']:7.2f}s  {p['card']:<18} units {p['units']}  conf {p['conf']}")
    print(f"\nSaved {out}")


if __name__ == "__main__":
    main()
