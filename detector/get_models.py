"""Download the two detector models (about 31 MB) into detector/models/.

    python3 detector/get_models.py

They are kept out of the repo because they are 99% of its size. Source:
ClashRoyaleBuildABot by Peter Batchelor (MIT, see models/LICENSE-ClashRoyaleBuildABot.md),
as vendored in itzik123/ClashRoyaleAi, pinned to one commit and checked by hash.
"""
import hashlib
import os
import urllib.request

COMMIT = "2f172925a15b17f973291f41a789b19a29f0fc43"
BASE = f"https://raw.githubusercontent.com/itzik123/ClashRoyaleAi/{COMMIT}/perception/clashroyalebuildabot/models/"
MODELS = {
    "units_M_480x352.onnx": "4cf422370650b1d18647cffc05e02bf75fdc2fbdb1f8ef983f4b8d6f8ea908b3",
    "side.onnx": "686bc75eae2ddc872b556534aeac8b4f5c6e891df76eef12e9fc91d406ab2583",
}
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    os.makedirs(HERE, exist_ok=True)
    for name, want in MODELS.items():
        path = os.path.join(HERE, name)
        if os.path.exists(path) and sha256(path) == want:
            print(f"{name}: already here")
            continue
        print(f"{name}: downloading ...")
        tmp = path + ".part"
        urllib.request.urlretrieve(BASE + name, tmp)
        got = sha256(tmp)
        if got != want:
            os.remove(tmp)
            raise SystemExit(f"{name}: downloaded file does not match the expected hash, not saved")
        os.replace(tmp, path)
        print(f"{name}: ok")


if __name__ == "__main__":
    main()
