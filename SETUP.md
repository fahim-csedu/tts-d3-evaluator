# STT Model Evaluator - Setup Guide

## Overview

This application now uses a comprehensive data cache that includes:
- Audio files (as base64)
- Reference transcripts (from text files)
- Model transcripts (from CSV)
- Metadata (CER, duration, notes)

This approach eliminates the need for multiple API calls and file streaming, making the application much faster for short audio clips.

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Directories

Edit `config.js` or `config.local.js` to set your data directories:

```javascript
{
    AUDIO_BASE_DIR: 'D:\\Final_data_MRK\\Modified',  // Audio files (.wav)
    TRANSCRIPTION_DIR: 'D:\\Final_data_MRK\\text',   // Reference text files (.txt)
    PORT: 3002
}
```

### 3. Build the Data Cache

**Important:** Run this command to build the comprehensive data cache:

```bash
npm run build-cache
```

This will:
- Read all files from `transcription_results.csv` and `bntts_cer.csv`
- Load audio files from `D:\Final_data_MRK\Modified\`
- Load reference text from `D:\Final_data_MRK\text\`
- Load notes from `Undefined listing.txt`
- Create `data_cache.json` with all data

**Note:** The cache file will be large (several hundred MB depending on your dataset). This is normal and expected.

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## Data Structure

### Required Files

```
project/
├── transcription_results.csv      # Source data (only needed for building cache)
├── bntts_cer.csv                 # Source data (only needed for building cache)
├── Undefined listing.txt         # Source data (only needed for building cache)
└── data_cache.json              # Runtime cache (server uses this)
```

**Note:** CSV files are only needed when running `npm run build-cache`. Once the cache is built, the server only uses `data_cache.json`. You can archive the CSV files after building the cache.

### External Directories

```
D:\Final_data_MRK\
├── Modified\                     # Audio files (.wav)
│   ├── 2308268002.wav
│   ├── 2308268003.wav
│   └── ...
├── text\                        # Reference transcripts (.txt)
│   ├── 2308268002.txt
│   ├── 2308268003.txt
│   └── ...
└── api_response\                # API response JSON (optional)
    ├── 2308268002.json
    ├── 2308268003.json
    └── ...
```

## Features

### File List from CSV
- All files are loaded from the CSV instead of browsing directories
- Faster loading and navigation
- Consistent ordering

### Search Functionality
- Search files by filename in the left sidebar
- Real-time filtering as you type
- Clear button to reset search

### Single API Endpoint
- All data (audio, transcripts, metadata) loaded in one request
- Significantly faster than multiple requests
- Audio loaded as base64 (no streaming needed for short clips)

### Validation Workflow
1. Select a file from the list
2. Listen to audio and review transcripts
3. Choose:
   - Reference is correct
   - API/Model is correct
   - Enter custom transcript
4. Automatically advances to next unvalidated clip

## Updating the Cache

When you add new files or update existing data:

```bash
npm run build-cache
```

Then restart the server.

## Performance Notes

- **Cache file size:** Expect 100-500 MB depending on dataset size
- **Initial load:** First load builds the cache (may take 5-10 minutes)
- **Subsequent loads:** Instant (data served from cache)
- **Memory usage:** Server will use more RAM due to cache, but responses are much faster

## Troubleshooting

### Cache not found
If you see "Data cache not found" warning:
```bash
npm run build-cache
```

### Missing files
Check the `data_cache_errors.log` file for details on missing audio or text files.

### Large cache file
This is expected. The cache includes base64-encoded audio which is larger than the original files but eliminates the need for file I/O during runtime.

## API Endpoints

### Get File List
```
GET /api/csv-files
Returns: List of all files from CSV
```

### Get File Data (Single Endpoint)
```
GET /api/file-data/:filename
Returns: {
  filename: string,
  audio: { data: base64, size: number, format: 'wav' },
  reference_text: string,
  model_transcript: string,
  metadata: { duration_seconds, cer, notes },
  api_response: object (optional),
  cached: boolean
}
```

### Save Validation
```
POST /api/validation
Body: {
  filename: string,
  is_reference_correct: boolean,
  is_api_correct: boolean,
  ideal_transcript: string
}
```

### Get Validations
```
GET /api/validations
Returns: List of all validation records
```

### Export to Excel
```
GET /api/export
Returns: Excel file with all validations
```

## User Accounts

Demo accounts (username: password):
- mehadi: Kx9#mP2vL8qR
- annoor: Zt4$nW7jF3xY
- lina: Bv6&hQ9sM1kE
- rar: Gp3*rT8cN5wA
- dipto: Jm7@uV2bX4zD
- sta: Qw5!yH8fK9pL
- mrk: Cx2%eR6gJ7nM
- fa: Fs4^iO1tY3vB
- demo: Nz8&aU5hW2qS
- nusrat: Np8@xK4mT9wQ
- mashruf: Mh5#vL2nR6yB
- khairul: Kj9$pW3cF7sD
