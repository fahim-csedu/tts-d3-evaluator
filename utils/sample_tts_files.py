#!/usr/bin/env python3
import argparse
import csv
import os
import random
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple

import pandas as pd
import soundfile as sf


# ---- CONFIGURABLE CONSTANTS ----

# Audio file extensions we consider
AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".m4a", ".ogg"}

# Duration buckets as used in your Excel / sampling plan
# Format: name -> (low_inclusive, high_exclusive or None for open-ended)
BUCKET_DEFS = {
    "[0, 1)":   (0.0, 1.0),
    "[1, 5)":   (1.0, 5.0),
    "[5, 10)":  (5.0, 10.0),
    "[10, 15)": (10.0, 15.0),
    "[15, 20)": (15.0, 20.0),
    "[20, 25)": (20.0, 25.0),
    "[25, 30)": (25.0, 30.0),
    "[30+)":    (30.0, None),
}


# ---- DATA STRUCTURES ----

@dataclass
class FileInfo:
    folder: str          # Folder key (as in the plan)
    path: str            # Full path on disk
    rel_path: str        # Path relative to audio root (for nicer CSV)
    duration: float      # Seconds
    bucket: Optional[str]


# ---- UTILS ----

def is_audio_file(path: str) -> bool:
    _, ext = os.path.splitext(path)
    return ext.lower() in AUDIO_EXTENSIONS


def get_duration_seconds(path: str) -> Optional[float]:
    try:
        info = sf.info(path)
        if info.samplerate > 0:
            return float(info.frames) / float(info.samplerate)
        return None
    except Exception as e:
        print(f"[WARN] Could not read audio file '{path}': {e}")
        return None


def assign_bucket(duration: float) -> Optional[str]:
    for name, (lo, hi) in BUCKET_DEFS.items():
        if hi is None:
            if duration >= lo:
                return name
        else:
            if lo <= duration < hi:
                return name
    return None


def find_files_in_folder(root: str, folder_key: str) -> List[str]:
    """
    root: audio root directory (e.g. /data)
    folder_key: string from the plan (e.g. 'create/01916706506' or 'collect/NCTB/AmarBanglaBoiClass1')
    We treat folder_key as relative to root.
    """
    folder_path = os.path.join(root, folder_key)
    if not os.path.isdir(folder_path):
        print(f"[WARN] Folder not found on disk: {folder_path}")
        return []

    audio_files = []
    for dirpath, _, filenames in os.walk(folder_path):
        for fname in filenames:
            full = os.path.join(dirpath, fname)
            if is_audio_file(full):
                audio_files.append(full)
    return audio_files


# ---- CORE LOGIC ----

def load_sampling_plan(plan_csv: str) -> pd.DataFrame:
    df = pd.read_csv(plan_csv)
    # Normalize column name: some plans have 'group', others 'Folder'
    if "group" in df.columns and "Folder" not in df.columns:
        df = df.rename(columns={"group": "Folder"})
    if "Folder" not in df.columns:
        raise ValueError("Sampling plan must have a 'Folder' or 'group' column.")
    return df


def build_file_index(audio_root: str, plan_df: pd.DataFrame) -> List[FileInfo]:
    """
    Build a list of FileInfo for all files in all folders mentioned in the plan.
    """
    all_files: List[FileInfo] = []

    for _, row in plan_df.iterrows():
        folder_key = str(row["Folder"])
        files = find_files_in_folder(audio_root, folder_key)
        print(f"[INFO] Folder '{folder_key}': found {len(files)} audio files.")

        for f in files:
            dur = get_duration_seconds(f)
            if dur is None:
                continue
            bucket = assign_bucket(dur)
            rel_path = os.path.relpath(f, audio_root)
            all_files.append(FileInfo(
                folder=folder_key,
                path=f,
                rel_path=rel_path,
                duration=dur,
                bucket=bucket,
            ))

    print(f"[INFO] Total indexed audio files: {len(all_files)}")
    return all_files


def build_folder_bucket_map(files: List[FileInfo]) -> Dict[str, Dict[str, List[FileInfo]]]:
    """
    folder -> bucket_name -> [FileInfo...]
    """
    mapping: Dict[str, Dict[str, List[FileInfo]]] = {}
    for fi in files:
        if fi.bucket is None:
            continue
        folder_map = mapping.setdefault(fi.folder, {})
        bucket_list = folder_map.setdefault(fi.bucket, [])
        bucket_list.append(fi)
    return mapping


def sample_for_folder(
    folder: str,
    folder_row: pd.Series,
    folder_buckets: Dict[str, List[FileInfo]],
    rng: random.Random
) -> List[FileInfo]:
    """
    For one folder, pick files according to the plan's Sample columns.
    """
    selected: List[FileInfo] = []

    # Determine requested samples per bucket based on column names
    requested: Dict[str, int] = {}
    for bucket_name in BUCKET_DEFS.keys():
        col = f"Samples {bucket_name}"
        if col in folder_row.index:
            requested_count = int(folder_row[col]) if not pd.isna(folder_row[col]) else 0
            if requested_count > 0:
                requested[bucket_name] = requested_count

    for bucket_name, n_req in requested.items():
        available = folder_buckets.get(bucket_name, [])
        if not available:
            print(
                f"[WARN] Folder '{folder}' bucket '{bucket_name}' "
                f"requested {n_req} but found 0 files."
            )
            continue

        if len(available) <= n_req:
            # take all
            print(
                f"[INFO] Folder '{folder}' bucket '{bucket_name}' "
                f"requested {n_req}, only {len(available)} available -> taking all."
            )
            selected.extend(available)
        else:
            # random sample
            chosen = rng.sample(available, n_req)
            selected.extend(chosen)

    return selected


def run_sampling(plan_csv: str, audio_root: str, output_csv: str, seed: int = 42) -> None:
    rng = random.Random(seed)
    plan_df = load_sampling_plan(plan_csv)

    print(f"[INFO] Loaded sampling plan with {len(plan_df)} rows from {plan_csv}")
    files = build_file_index(audio_root, plan_df)
    folder_bucket_map = build_folder_bucket_map(files)

    all_selected: List[FileInfo] = []

    for idx, row in plan_df.iterrows():
        folder_key = str(row["Folder"])
        target = int(row["Target Samples"]) if "Target Samples" in row and not pd.isna(row["Target Samples"]) else None
        folder_buckets = folder_bucket_map.get(folder_key, {})

        if not folder_buckets:
            print(f"[WARN] No bucketed files for folder '{folder_key}'. Skipping.")
            continue

        selected = sample_for_folder(folder_key, row, folder_buckets, rng)
        if target is not None and len(selected) < target:
            print(
                f"[WARN] Folder '{folder_key}' target {target}, "
                f"only selected {len(selected)} clips (insufficient long buckets)."
            )

        all_selected.extend(selected)

    # Deduplicate in case of any weird overlaps
    unique_selected: Dict[Tuple[str, str], FileInfo] = {}
    for fi in all_selected:
        key = (fi.folder, fi.path)
        unique_selected[key] = fi
    final_list = list(unique_selected.values())

    print(f"[INFO] Final selected clips: {len(final_list)}")

    # Write output CSV
    fieldnames = ["folder", "rel_path", "full_path", "duration_sec", "bucket"]
    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for fi in final_list:
            writer.writerow({
                "folder": fi.folder,
                "rel_path": fi.rel_path,
                "full_path": fi.path,
                "duration_sec": round(fi.duration, 3),
                "bucket": fi.bucket,
            })

    print(f"[INFO] Wrote sampled file list to {output_csv}")


# ---- CLI ----

def main():
    parser = argparse.ArgumentParser(
        description="Sample TTS audio files according to a duration-based sampling plan."
    )
    parser.add_argument(
        "--plan",
        required=True,
        help="Path to sampling plan CSV (e.g. sampling_plan_create_long_priority.csv)",
    )
    parser.add_argument(
        "--audio_root",
        required=True,
        help="Root directory containing audio folders (e.g. /data for /data/create/...)",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output CSV path for selected samples.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducible sampling.",
    )

    args = parser.parse_args()
    run_sampling(args.plan, args.audio_root, args.output, seed=args.seed)


if __name__ == "__main__":
    main()


#python sample_tts_files.py --plan ./sampling_plan_collect_long_priority.csv --audio_root "D:\TTS D3\TTS D3 Data" --output ./collect_samples.csv