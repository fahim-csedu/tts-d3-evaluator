// Configuration file for the TTS D3 Evaluator
const config = {
    // Base directory for audio files (TTS D3 collect folder)
    AUDIO_BASE_DIR: process.env.AUDIO_BASE_DIR || 'D:\\TTS D3\\TTS D3 Data\\collect',
    
    // Directory for transcriptions (same as audio base dir - JSON files are in same folders)
    TRANSCRIPTION_DIR: process.env.TRANSCRIPTION_DIR || 'D:\\TTS D3\\TTS D3 Data\\collect',
    
    // Server port
    PORT: process.env.PORT || 3002,
    
    // Session timeout (in milliseconds)
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
    
    // Enable debug logging
    DEBUG: process.env.NODE_ENV !== 'production'
};

module.exports = config;
