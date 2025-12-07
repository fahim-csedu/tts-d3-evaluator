#!/usr/bin/env python3
import argparse
import os
import shutil

import pandas as pd


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def copy_file(src: str, dst: str) -> bool:
    """Copy file from src to dst, creating parent dirs as needed."""
    if not os.path.isfile(src):
        print(f"[WARN] Source file not found, skipping: {src}")
        return False
    ensure_dir(os.path.dirname(dst))
    shutil.copy2(src, dst)
    print(f"[INFO] Copied: {src} -> {dst}")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Copy sampled audio files and their .json transcripts "
                    "into a destination folder."
    )
    parser.add_argument(
        "--csv",
        required=True,
        help="Path to sampled file list CSV (with columns: folder, rel_path, full_path, ...).",
    )
    parser.add_argument(
        "--dest",
        required=True,
        help=r"Destination root folder (e.g. 'D:\TTS D3\TTS D3 Data\collect_samples').",
    )
    parser.add_argument(
        "--sep",
        default=",",
        help="CSV separator (default=','; use '\\t' if your file is tab-separated).",
    )
    args = parser.parse_args()

    csv_path = args.csv
    dest_root = args.dest

    sep = "\t" if args.sep == "\\t" else args.sep
    df = pd.read_csv(csv_path, sep=sep)
    print(f"[INFO] Loaded {len(df)} rows from {csv_path}")

    required_cols = {"rel_path", "full_path"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {missing}")

    copied_audio = 0
    copied_json = 0

    for _, row in df.iterrows():
        # Normalize source audio path (handles mix of / and \)
        src_audio_raw = str(row["full_path"])
        src_audio = os.path.normpath(src_audio_raw)

        # Normalize rel_path for destination structure
        rel_raw = str(row["rel_path"])
        rel_norm = rel_raw.replace("/", os.sep).replace("\\", os.sep)

        dest_audio = os.path.normpath(os.path.join(dest_root, rel_norm))

        # Copy audio
        if copy_file(src_audio, dest_audio):
            copied_audio += 1

        # Infer JSON path: same basename, .json extension
        src_base, _ = os.path.splitext(src_audio)
        src_json = src_base + ".json"

        dest_base, _ = os.path.splitext(dest_audio)
        dest_json = dest_base + ".json"

        if os.path.isfile(src_json):
            if copy_file(src_json, dest_json):
                copied_json += 1
        else:
            print(f"[WARN] JSON transcript not found for audio: {src_audio}")
            print(f"       Expected JSON: {src_json}")

    print("\n[INFO] Done.")
    print(f"[INFO] Copied audio files: {copied_audio}")
    print(f"[INFO] Copied JSON files:  {copied_json}")


if __name__ == "__main__":
    main()

# How to run
# python copy_samples_with_json.py  --csv "D:\TTS D3\TTS D3 Data\collect_samples.csv"  --dest "D:\TTS D3\TTS D3 Data\collect_samples"