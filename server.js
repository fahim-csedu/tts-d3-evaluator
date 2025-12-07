const express = require('express');
const path = require('path');
const fs = require('fs');
const ValidationStorage = require('./validationStorage');
const ExcelExportService = require('./excelExport');

// Load configuration
let config;
if (process.env.USE_LOCAL_CONFIG === '1' || process.env.USE_LOCAL_CONFIG === 'true') {
    try {
        config = require('./config.local.js');
        console.log('Using local configuration (USE_LOCAL_CONFIG set)');
    } catch (error) {
        config = require('./config.js');
        console.log('Local configuration requested but not found, using default config.js');
    }
} else {
    config = require('./config.js');
    console.log('Using default configuration (config.js)');
}

const app = express();
const { AUDIO_BASE_DIR, TRANSCRIPTION_DIR, ANNOTATIONS_DIR, PORT, SESSION_TIMEOUT, DEBUG } = config;

// Trust proxy for Cloudflare tunnel
app.set('trust proxy', true);

// CORS headers for Cloudflare tunnel
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-session-id');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// TTS D3 Evaluator - Transcripts are loaded from JSON files alongside audio files

// Initialize validation storage
const validationStoragePath = path.join(__dirname, 'validations.json');
const validationStorage = new ValidationStorage(validationStoragePath);

// Helper function to normalize paths
function normalizePath(pathStr) {
    if (!pathStr) return '';
    return pathStr
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\//, '')
        .replace(/\/$/, '');
}

// Demo accounts
const DEMO_ACCOUNTS = {
    'mehadi': 'Kx9#mP2vL8qR',
    'annoor': 'Zt4$nW7jF3xY',
    'lina': 'Bv6&hQ9sM1kE',
    'rar': 'Gp3*rT8cN5wA',
    'dipto': 'Jm7@uV2bX4zD',
    'sta': 'Qw5!yH8fK9pL',
    'mrk': 'Cx2%eR6gJ7nM',
    'fa': 'Fs4^iO1tY3vB',
    'demo': 'Nz8&aU5hW2qS',
    'nusrat': 'Np8@xK4mT9wQ',
    'mashruf': 'Mh5#vL2nR6yB',
    'khairul': 'Kj9$pW3cF7sD'
};

// Session storage with persistence
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const sessions = new Map();

// Load sessions from file on startup
function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
            const sessionsArray = JSON.parse(data);
            sessionsArray.forEach(([key, value]) => {
                // Only load sessions that haven't expired (24 hours)
                const loginTime = new Date(value.loginTime);
                const now = new Date();
                const hoursSinceLogin = (now - loginTime) / (1000 * 60 * 60);
                if (hoursSinceLogin < 24) {
                    sessions.set(key, value);
                }
            });
            console.log(`Loaded ${sessions.size} active sessions from disk`);
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// Save sessions to file
function saveSessions() {
    try {
        const sessionsArray = Array.from(sessions.entries());
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsArray, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error saving sessions:', error);
    }
}

loadSessions();

// Middleware
app.use(express.json());

// Authentication middleware
function requireAuth(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    if (DEBUG) {
        console.log(`Auth check - Session ID: ${sessionId}`);
    }
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    // Attach user info to request for use in endpoints
    const session = sessions.get(sessionId);
    req.user = session ? { username: session.username } : null;
    next();
}

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Audio file serving with authentication
app.get('/audio/*', (req, res) => {
    const sessionId = req.query.session || req.headers['x-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const filePath = req.params[0];
    const decodedPath = decodeURIComponent(filePath);
    const windowsPath = decodedPath.replace(/\//g, path.sep);
    const fullPath = path.resolve(AUDIO_BASE_DIR, windowsPath);

    try {
        const normalizedBase = path.resolve(AUDIO_BASE_DIR);
        const normalizedFull = path.resolve(fullPath);

        if (!normalizedFull.startsWith(normalizedBase)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const ext = path.extname(fullPath).toLowerCase();
        const contentTypes = {
            '.flac': 'audio/flac',
            '.wav': 'audio/wav',
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg'
        };
        // TTS D3 uses FLAC files primarily
        const contentType = contentTypes[ext] || 'audio/octet-stream';

        const stat = fs.statSync(fullPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(fullPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
            };
            res.writeHead(200, head);
            fs.createReadStream(fullPath).pipe(res);
        }
    } catch (error) {
        console.error('Audio serving error:', error);
        res.status(500).json({ error: 'Failed to serve audio file' });
    }
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    if (DEMO_ACCOUNTS[username] && DEMO_ACCOUNTS[username] === password) {
        const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessions.set(sessionId, { username, loginTime: new Date() });
        saveSessions(); // Persist session to disk
        if (DEBUG) {
            console.log(`Login successful - User: ${username}, Session: ${sessionId}`);
        }
        res.json({ success: true, sessionId, username });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        sessions.delete(sessionId);
        saveSessions(); // Persist session removal to disk
    }
    res.json({ success: true });
});

// Browse directory
app.get('/api/browse', requireAuth, (req, res) => {
    const relativePath = decodeURIComponent(req.query.path || '');
    const windowsPath = relativePath.replace(/\//g, path.sep);
    const fullPath = path.resolve(AUDIO_BASE_DIR, windowsPath);

    if (DEBUG) {
        console.log('Browse request:', {
            relativePath,
            windowsPath,
            fullPath,
            baseDir: AUDIO_BASE_DIR
        });
    }

    try {
        const normalizedBase = path.resolve(AUDIO_BASE_DIR);
        const normalizedFull = path.resolve(fullPath);

        if (!normalizedFull.startsWith(normalizedBase)) {
            console.error('Access denied:', { normalizedFull, normalizedBase });
            return res.status(403).json({ error: 'Access denied', details: 'Path outside base directory' });
        }

        if (!fs.existsSync(fullPath)) {
            console.error('Directory not found:', fullPath);
            return res.status(404).json({ error: 'Directory not found', path: fullPath });
        }

        const items = fs.readdirSync(fullPath, { withFileTypes: true });
        const result = {
            currentPath: relativePath,
            items: []
        };

        const audioFiles = [];
        const jsonFiles = [];

        items.forEach(item => {
            if (item.isDirectory()) {
                const itemPath = normalizePath(relativePath ? `${relativePath}/${item.name}` : item.name);
                const dirFullPath = path.join(fullPath, item.name);
                let itemCount = 0;
                try {
                    const dirItems = fs.readdirSync(dirFullPath, { withFileTypes: true });
                    // Count only .flac files in the directory
                    itemCount = dirItems.filter(dirItem => 
                        dirItem.isFile() && dirItem.name.match(/\.flac$/i)
                    ).length;
                } catch (error) {
                    itemCount = 0;
                }
                result.items.push({
                    name: item.name,
                    type: 'folder',
                    path: itemPath,
                    fileCount: itemCount
                });
            } else {
                // Show FLAC files (TTS audio format)
                if (item.name.match(/\.flac$/i)) {
                    audioFiles.push(item.name);
                } else if (item.name.endsWith('.json')) {
                    jsonFiles.push(item.name);
                }
            }
        });

        audioFiles.forEach(audioFile => {
            const baseName = audioFile.replace(/\.flac$/i, '');
            const matchingJson = jsonFiles.find(jsonFile => jsonFile === baseName + '.json');
            const audioPath = normalizePath(relativePath ? `${relativePath}/${audioFile}` : audioFile);
            const jsonPath = matchingJson ? normalizePath(relativePath ? `${relativePath}/${matchingJson}` : matchingJson) : null;

            // Check if annotation exists for this file
            let isAnnotated = false;
            if (ANNOTATIONS_DIR) {
                const annotationFilename = `${baseName}.json`;
                const annotationPath = path.join(ANNOTATIONS_DIR, annotationFilename);
                isAnnotated = fs.existsSync(annotationPath);
            }

            result.items.push({
                name: baseName,
                type: 'audio',
                audioFile: audioPath,
                jsonFile: jsonPath,
                path: audioPath,
                isAnnotated: isAnnotated
            });
        });

        res.json(result);
    } catch (error) {
        console.error('Browse error:', error);
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

// Get absolute path
app.get('/api/absolutePath', requireAuth, (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
    }
    const normalizedPath = normalizePath(decodeURIComponent(filePath));
    res.json({ absolutePath: normalizedPath });
});

// Get transcript from JSON file in same folder as audio file (TTS D3 format)
app.get('/api/transcript', requireAuth, async (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
    }

    const decodedPath = decodeURIComponent(filePath);
    const windowsPath = decodedPath.replace(/\//g, path.sep);
    const audioFullPath = path.resolve(AUDIO_BASE_DIR, windowsPath);
    
    // Get JSON file in same folder as audio file
    const audioFileName = path.basename(audioFullPath, path.extname(audioFullPath));
    const audioDir = path.dirname(audioFullPath);
    const jsonFullPath = path.join(audioDir, audioFileName + '.json');

    // Check if JSON exists
    if (fs.existsSync(jsonFullPath)) {
        try {
            const content = fs.readFileSync(jsonFullPath, 'utf8');
            const jsonData = JSON.parse(content);
            
            // TTS D3 format: transcript is concatenated from all annotation objects
            if (jsonData.annotation && Array.isArray(jsonData.annotation) && jsonData.annotation.length > 0) {
                // Concatenate all sentences from all annotation objects with newlines
                const transcript = jsonData.annotation
                    .map(ann => ann.sentence || '')
                    .filter(s => s.trim().length > 0)
                    .join('\n');
                return res.json({ transcript: transcript });
            }
            
            // Fallback: check for other possible fields
            if (jsonData.transcript) {
                return res.json({ transcript: jsonData.transcript });
            }
            
            return res.status(404).json({ error: 'Transcript not found in JSON file' });
        } catch (error) {
            console.error('Error reading JSON:', error);
            return res.status(500).json({ error: 'Failed to read JSON file' });
        }
    }
    
    return res.status(404).json({ error: 'JSON file not found' });
});

// Get reference data from JSON file (TTS D3 format)
app.get('/api/reference', requireAuth, async (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
    }

    const decodedPath = decodeURIComponent(filePath);
    const windowsPath = decodedPath.replace(/\//g, path.sep);
    const audioFullPath = path.resolve(AUDIO_BASE_DIR, windowsPath);
    
    // Get JSON file in same folder as audio file
    const audioFileName = path.basename(audioFullPath, path.extname(audioFullPath));
    const audioDir = path.dirname(audioFullPath);
    const jsonFullPath = path.join(audioDir, audioFileName + '.json');

    if (!fs.existsSync(jsonFullPath)) {
        return res.status(404).json({ error: 'JSON file not found' });
    }

    try {
        const content = fs.readFileSync(jsonFullPath, 'utf8');
        const jsonData = JSON.parse(content);
        
        // Extract transcript by concatenating all sentences from all annotation objects with newlines
        const transcript = jsonData.annotation && Array.isArray(jsonData.annotation) && jsonData.annotation.length > 0
            ? jsonData.annotation
                .map(ann => ann.sentence || '')
                .filter(s => s.trim().length > 0)
                .join('\n')
            : '';
        
        return res.json({
            filename: audioFileName,
            sentence: transcript,
            duration: jsonData.duration || 0,
            book_name: jsonData.book_name || '',
            source: jsonData.source || '',
            speech_id: jsonData.speech_id || ''
        });
    } catch (error) {
        console.error('Error reading JSON:', error);
        return res.status(500).json({ error: 'Failed to read JSON file' });
    }
});

// Save annotation
// Save annotation data to individual JSON file (new endpoint for TTS D3)
app.post('/api/annotation', requireAuth, async (req, res) => {
    try {
        const annotationData = req.body;
        
        if (!annotationData.filename || !annotationData.absolutePath) {
            return res.status(400).json({ 
                error: 'Filename and absolute path are required' 
            });
        }
        
        // Ensure annotations directory exists
        if (!fs.existsSync(ANNOTATIONS_DIR)) {
            fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });
        }
        
        // Extract base filename safely (handle Windows-style paths on non-Windows host)
        const safeBase = (annotationData.absolutePath || '')
            .split(/[/\\]+/)
            .pop()
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-zA-Z0-9_.-]/g, '_') || 'annotation';
        const annotationFilename = `${safeBase}.json`;
        const annotationPath = path.join(ANNOTATIONS_DIR, annotationFilename);
        
        // Get username from session
        const username = req.user ? req.user.username : 'unknown';
        
        // Prepare annotation data with all fields
        const annotation = {
            absolute_path: annotationData.absolutePath,
            original_transcript: annotationData.originalTranscript,
            corrected_transcript: annotationData.correctedTranscript,
            is_transcript_correct: annotationData.isTranscriptCorrect,
            punctuation_missing: annotationData.punctuationMissing,
            duration: annotationData.duration,
            notes: annotationData.notes,
            naturalness: annotationData.naturalness,
            intelligibility: annotationData.intelligibility,
            prosody: annotationData.prosody,
            pronunciation: annotationData.pronunciation,
            overall: annotationData.overall,
            annotator: username,
            timestamp: annotationData.timestamp || new Date().toISOString()
        };
        
        // Save to JSON file
        fs.writeFileSync(annotationPath, JSON.stringify(annotation, null, 2), 'utf-8');
        
        console.log(`Annotation saved to ${annotationPath}`);
        res.json({ 
            success: true, 
            message: 'Annotation saved successfully',
            path: annotationPath
        });
    } catch (error) {
        console.error('Error saving annotation:', error);
        res.status(500).json({ 
            error: 'Failed to save annotation',
            details: error.message
        });
    }
});

// Get annotation data from individual JSON file
app.get('/api/annotation/:filename', requireAuth, async (req, res) => {
    try {
        const filename = req.params.filename;
        
        // Remove extension if present
        const baseFilename = filename.replace(/\.(json|flac|wav|mp3|m4a|ogg)$/i, '');
        const annotationFilename = `${baseFilename}.json`;
        const annotationPath = path.join(ANNOTATIONS_DIR, annotationFilename);
        
        if (!fs.existsSync(annotationPath)) {
            return res.status(404).json({ 
                error: 'Annotation not found',
                filename: annotationFilename
            });
        }
        
        const annotationContent = fs.readFileSync(annotationPath, 'utf-8');
        const annotation = JSON.parse(annotationContent);
        
        res.json(annotation);
    } catch (error) {
        console.error('Error loading annotation:', error);
        res.status(500).json({ 
            error: 'Failed to load annotation',
            details: error.message
        });
    }
});

// Legacy endpoint for old annotation format (kept for backward compatibility)
app.get('/api/annotation', requireAuth, async (req, res) => {
    try {
        const filePath = req.query.file;
        if (!filePath) {
            return res.status(400).json({ error: 'File path required' });
        }
        
        const audioFileName = path.basename(decodeURIComponent(filePath), path.extname(decodeURIComponent(filePath)));
        const annotationFilename = `${audioFileName}.json`;
        const annotationPath = path.join(ANNOTATIONS_DIR, annotationFilename);
        
        if (fs.existsSync(annotationPath)) {
            const content = fs.readFileSync(annotationPath, 'utf-8');
            const annotation = JSON.parse(content);
            return res.json(annotation);
        } else {
            return res.status(404).json({ error: 'No annotation found for this file' });
        }
    } catch (error) {
        console.error('Error loading annotation:', error);
        res.status(500).json({ error: 'Failed to load annotation' });
    }
});

// Audio streaming endpoint for transcript validation
app.get('/api/audio/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        
        if (!filename) {
            console.error('Audio streaming error: No filename provided');
            return res.status(400).json({ error: 'Filename required' });
        }
        
        // Validate filename to prevent directory traversal
        // Only allow alphanumeric characters, underscores, hyphens, and dots
        const safeFilenamePattern = /^[a-zA-Z0-9_\-\.]+$/;
        if (!safeFilenamePattern.test(filename)) {
            console.error(`Audio streaming error: Invalid filename format: ${filename}`);
            return res.status(400).json({ 
                error: 'Invalid filename format',
                details: 'Filename contains invalid characters'
            });
        }
        
        // Ensure filename ends with .wav
        const audioFilename = filename.endsWith('.wav') ? filename : `${filename}.wav`;
        
        // Construct the full path to the audio file
        // Using the configured audio directory from config
        const audioDir = AUDIO_BASE_DIR;
        const fullPath = path.join(audioDir, audioFilename);
        
        // Validate that the resolved path is within the audio directory (prevent directory traversal)
        const normalizedAudioDir = path.resolve(audioDir);
        const normalizedFullPath = path.resolve(fullPath);
        
        if (!normalizedFullPath.startsWith(normalizedAudioDir)) {
            console.error(`Audio streaming error: Path traversal attempt: ${fullPath}`);
            return res.status(403).json({ 
                error: 'Access denied: Invalid file path',
                details: 'File path is outside the allowed directory'
            });
        }
        
        // Check if file exists
        if (!fs.existsSync(fullPath)) {
            console.error(`Audio streaming error: File not found: ${fullPath}`);
            return res.status(404).json({ 
                error: 'Audio file not found', 
                filename: audioFilename,
                details: 'The requested audio file does not exist'
            });
        }
        
        // Get file stats for streaming
        const stat = fs.statSync(fullPath);
        const fileSize = stat.size;
        
        // Validate file size (prevent serving empty or corrupted files)
        if (fileSize === 0) {
            console.error(`Audio streaming error: Empty file: ${fullPath}`);
            return res.status(500).json({ 
                error: 'Audio file is empty',
                filename: audioFilename
            });
        }
        
        const range = req.headers.range;
        
        // Support HTTP range requests for seeking
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            // Validate range values
            if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
                console.error(`Audio streaming error: Invalid range: ${range}`);
                return res.status(416).json({ error: 'Invalid range request' });
            }
            
            const chunksize = (end - start) + 1;
            
            const file = fs.createReadStream(fullPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'audio/wav',
            };
            
            res.writeHead(206, head);
            file.pipe(res);
            
            // Handle stream errors
            file.on('error', (streamError) => {
                console.error(`Audio streaming error: Stream error: ${streamError.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error streaming audio file' });
                }
            });
        } else {
            // No range request, serve entire file
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'audio/wav',
                'Accept-Ranges': 'bytes',
            };
            
            res.writeHead(200, head);
            const stream = fs.createReadStream(fullPath);
            stream.pipe(res);
            
            // Handle stream errors
            stream.on('error', (streamError) => {
                console.error(`Audio streaming error: Stream error: ${streamError.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error streaming audio file' });
                }
            });
        }
    } catch (error) {
        console.error('Error streaming audio:', error);
        console.error('Stack trace:', error.stack);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to stream audio file',
                details: error.message
            });
        }
    }
});

// TTS D3 Evaluator uses folder browsing instead of CSV file lists
// Files are discovered by browsing the folder structure

// TTS D3 Evaluator - Metadata is loaded from JSON files alongside audio files
// Use /api/reference endpoint to get file metadata

// Get all data for a file (TTS D3 format - loads from folder structure)
app.get('/api/file-data/:filepath(*)', requireAuth, (req, res) => {
    try {
        const filepath = req.params.filepath;
        
        if (!filepath) {
            return res.status(400).json({ error: 'File path required' });
        }
        
        // Decode and normalize path
        const decodedPath = decodeURIComponent(filepath);
        const windowsPath = decodedPath.replace(/\//g, path.sep);
        const audioFullPath = path.resolve(AUDIO_BASE_DIR, windowsPath);
        
        // Validate path is within base directory
        const normalizedBase = path.resolve(AUDIO_BASE_DIR);
        const normalizedFull = path.resolve(audioFullPath);
        if (!normalizedFull.startsWith(normalizedBase)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Get base filename without extension
        const baseFilename = path.basename(audioFullPath, path.extname(audioFullPath));
        const audioDir = path.dirname(audioFullPath);
        const jsonFullPath = path.join(audioDir, baseFilename + '.json');
        
        const fileData = {
            filename: baseFilename,
            cached: false
        };
        
        // Load JSON file for transcript and metadata
        if (fs.existsSync(jsonFullPath)) {
            try {
                const jsonContent = fs.readFileSync(jsonFullPath, 'utf-8');
                const jsonData = JSON.parse(jsonContent);
                
                // Extract transcript by concatenating all sentences from all annotation objects with newlines
                const transcript = jsonData.annotation && Array.isArray(jsonData.annotation) && jsonData.annotation.length > 0
                    ? jsonData.annotation
                        .map(ann => ann.sentence || '')
                        .filter(s => s.trim().length > 0)
                        .join('\n')
                    : '';
                
                fileData.transcript = transcript;
                fileData.metadata = {
                    duration: jsonData.duration || 0,
                    book_name: jsonData.book_name || '',
                    source: jsonData.source || '',
                    speech_id: jsonData.speech_id || ''
                };
            } catch (error) {
                console.error('Error reading JSON:', error);
                fileData.transcript = null;
                fileData.metadata = null;
            }
        } else {
            fileData.transcript = null;
            fileData.metadata = null;
        }
        
        // Audio file path is already provided in the request
        // The client will use /audio/* endpoint to stream it
        fileData.audioPath = filepath;
        
        res.json({
            success: true,
            ...fileData
        });
        
    } catch (error) {
        console.error('Error loading file data:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load file data',
            details: error.message
        });
    }
});

// TTS D3 Evaluator - Reference text is in JSON files, use /api/reference endpoint

// Validation API endpoints

// Save a validation record
app.post('/api/validation', (req, res) => {
    try {
        const validation = req.body;
        
        // Validate required fields
        if (!validation.filename) {
            console.error('Validation error: Missing filename');
            return res.status(400).json({ 
                error: 'Filename is required',
                details: 'The validation record must include a filename'
            });
        }
        
        if (!validation.ideal_transcript) {
            console.error(`Validation error: Missing ideal transcript for ${validation.filename}`);
            return res.status(400).json({ 
                error: 'Ideal transcript is required',
                details: 'The validation record must include an ideal transcript'
            });
        }
        
        // Validate that ideal transcript is not just whitespace
        if (!/\S/.test(validation.ideal_transcript)) {
            console.error(`Validation error: Empty ideal transcript for ${validation.filename}`);
            return res.status(400).json({ 
                error: 'Ideal transcript cannot be empty',
                details: 'The ideal transcript must contain meaningful text'
            });
        }
        
        // Add timestamp if not provided
        if (!validation.timestamp) {
            validation.timestamp = new Date().toISOString();
        }
        
        // Save validation
        const success = validationStorage.saveValidation(validation);
        
        if (success) {
            console.log(`Validation saved successfully for ${validation.filename}`);
            res.json({ 
                success: true, 
                message: 'Validation saved successfully',
                filename: validation.filename
            });
        } else {
            console.error(`Failed to save validation for ${validation.filename}`);
            res.status(500).json({ 
                error: 'Failed to save validation',
                details: 'An error occurred while writing to storage'
            });
        }
    } catch (error) {
        console.error('Error saving validation:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Failed to save validation',
            details: error.message
        });
    }
});

// Get annotation data from individual JSON file
app.get('/api/annotation/:filename', requireAuth, async (req, res) => {
    try {
        const filename = req.params.filename;
        
        // Remove extension if present
        const baseFilename = filename.replace(/\.(json|flac|wav|mp3|m4a|ogg)$/i, '');
        const annotationFilename = `${baseFilename}.json`;
        const annotationPath = path.join(ANNOTATIONS_DIR, annotationFilename);
        
        if (!fs.existsSync(annotationPath)) {
            return res.status(404).json({ 
                error: 'Annotation not found',
                filename: annotationFilename
            });
        }
        
        const annotationContent = fs.readFileSync(annotationPath, 'utf-8');
        const annotation = JSON.parse(annotationContent);
        
        res.json(annotation);
    } catch (error) {
        console.error('Error loading annotation:', error);
        res.status(500).json({ 
            error: 'Failed to load annotation',
            details: error.message
        });
    }
});

// Get a specific validation record by filename
app.get('/api/validation/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }
        
        // Remove file extension if present
        const baseFilename = filename.replace(/\.(wav|mp3|flac|m4a|ogg)$/i, '');
        
        const validation = validationStorage.getValidation(baseFilename);
        
        if (validation) {
            res.json(validation);
        } else {
            res.status(404).json({ 
                error: 'Validation not found',
                filename: baseFilename
            });
        }
    } catch (error) {
        console.error('Error retrieving validation:', error);
        res.status(500).json({ error: 'Failed to retrieve validation' });
    }
});

// Get all validation records
app.get('/api/validations', (req, res) => {
    try {
        const validations = validationStorage.getAllValidations();
        res.json({
            count: validations.length,
            validations: validations
        });
    } catch (error) {
        console.error('Error retrieving validations:', error);
        res.status(500).json({ error: 'Failed to retrieve validations' });
    }
});

// Export validation records to Excel
app.get('/api/export', async (req, res) => {
    try {
        // Get all validations
        const validations = validationStorage.getAllValidations();
        
        if (validations.length === 0) {
            return res.status(404).json({ 
                error: 'No validations found',
                message: 'There are no validation records to export'
            });
        }
        
        // Create Excel export service
        const excelService = new ExcelExportService();
        
        // Generate Excel buffer
        const buffer = await excelService.generateExcelBuffer(validations, metadataMap);
        
        // Set appropriate headers for file download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `transcript_validations_${timestamp}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting validations:', error);
        res.status(500).json({ error: 'Failed to export validations' });
    }
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Verify directories exist on startup (warning only, don't exit)
if (!fs.existsSync(AUDIO_BASE_DIR)) {
    console.warn(`WARNING: AUDIO_BASE_DIR does not exist: ${AUDIO_BASE_DIR}`);
    console.warn('Server will start but audio files will not be available until directory is created');
}

app.listen(PORT, () => {
    console.log(`TTS D3 Evaluator running at http://localhost:${PORT}`);
    console.log(`Audio files from: ${AUDIO_BASE_DIR}`);
    console.log(`Transcriptions from: ${TRANSCRIPTION_DIR}`);
    console.log(`Absolute path: ${path.resolve(AUDIO_BASE_DIR)}`);
    
    // List files in directory to verify
    if (fs.existsSync(AUDIO_BASE_DIR)) {
        try {
            const files = fs.readdirSync(AUDIO_BASE_DIR);
            console.log(`Found ${files.length} items in root directory`);
            if (DEBUG) {
                console.log('First few items:', files.slice(0, 5));
            }
        } catch (error) {
            console.error('Error reading audio directory:', error.message);
        }
    }
});
