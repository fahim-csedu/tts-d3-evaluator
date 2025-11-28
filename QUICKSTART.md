# Quick Start Guide

## First Time Setup (5 minutes)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build Data Cache
```bash
npm run build-cache
```

This will take 5-10 minutes depending on your dataset size. It will:
- Load all audio files from `D:\Final_data_MRK\Modified\`
- Load all reference texts from `D:\Final_data_MRK\text\`
- Load metadata from CSV files
- Create `data_cache.json` (100-500 MB)

### Step 3: Start Server
```bash
npm start
```

### Step 4: Open Browser
Navigate to: http://localhost:3002

Login with any demo account (see SETUP.md for credentials)

## Daily Usage

```bash
# Just start the server
npm start
```

The cache is already built, so startup is instant!

## When You Add New Files

```bash
# Rebuild the cache
npm run build-cache

# Restart the server
npm start
```

## Check Cache Status

```bash
npm run check-cache
```

This will tell you:
- If cache exists
- Cache size and age
- If cache needs rebuilding
- Number of files in cache

## Features

### Search Files
- Type in the search box on the left sidebar
- Files are filtered in real-time
- Click "✕" to clear search

### Validate Transcripts
1. Select a file from the list
2. Listen to audio
3. Compare reference vs model transcript
4. Choose one of:
   - ✓ Reference is Correct
   - ✓ API is Correct
   - Enter custom transcript
5. Automatically moves to next unvalidated file
6. Export your work:
   - **Copy Data** - Copy current validation (paste in spreadsheet)
   - **Export Session** - Download all validations as Excel file

**Copy Format:** Tab-separated with all metadata (file_id, transcripts, duration, CER, notes, etc.)
**Export Format:** Excel file with all validations from your session

### Keyboard Shortcuts
- Press `?` to see all shortcuts
- `Space` - Play/pause audio
- `Ctrl + ←/→` - Previous/next clip
- `Alt + R` - Select reference
- `Alt + A` - Select API

## Troubleshooting

### "Data cache not found" warning
```bash
npm run build-cache
```

### Cache is outdated
```bash
npm run check-cache
npm run build-cache
```

### Server won't start
Check that ports 3002 is available:
```bash
netstat -ano | findstr :3002
```

### Missing files
Check `data_cache_errors.log` for details

## Need Help?

See `SETUP.md` for detailed documentation
See `CHANGES_SUMMARY.md` for technical details
