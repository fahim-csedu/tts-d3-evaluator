# STT Model Evaluator Web App

A web application for evaluating STT (Speech-to-Text) models by playing audio files and displaying pre-generated transcriptions.

## Features

- Browse audio files from `D:\cv-corpus-23.0-2025-09-05\bn\clips` directory
- Play audio files directly in the browser
- Display transcriptions from `D:\cv-corpus-23.0-2025-09-05\bn\csedu_labels`
- User authentication system
- Keyboard navigation support

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure the application:
   - Copy `config.local.example.js` to `config.local.js`
   - Update paths and settings as needed

3. Start the server:
```bash
npm start
```

4. Access the application at `http://localhost:3002`

## Configuration

Edit `config.local.js` to customize:
- `AUDIO_BASE_DIR`: Path to audio files (default: `D:\cv-corpus-23.0-2025-09-05\bn\clips`)
- `TRANSCRIPTION_DIR`: Path to transcription JSON files (default: `D:\cv-corpus-23.0-2025-09-05\bn\csedu_labels`)
- `PORT`: Server port (default: 3002)

## How It Works

1. The app lists audio files from the clips directory
2. When you select an audio file, it looks for a matching JSON file in the csedu_labels directory
3. The transcript is loaded and displayed from the JSON file
4. JSON files should have the same name as the audio file (e.g., `audio.mp3` → `audio.json`)

## Transcription File Format

The app expects JSON files in this format:
```json
{
  "transcript": "হাই আমি এখানে আপনার টাইপ করা যেকোনো লেখা পড়তে পারি",
  "output": {
    "predicted_words": [
      {
        "word": "হাই",
        "char_scores": [["হ", 98.894], ["া", 99.6], ["ই", 61.933]],
        "is_confident": true,
        "timestamp": [2560, 8000]
      }
    ]
  }
}
```

The app will display the `transcript` field or extract text from `predicted_words` if available.

## Default Login Credentials

- Username: `demo`
- Password: `Nz8&aU5hW2qS`

(See `server.js` for all available accounts)

## Keyboard Shortcuts

- `↑/↓`: Navigate files
- `Enter`: Open folder or play audio
- `Backspace`: Go back to parent directory
