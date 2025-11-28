const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock the server setup for testing
describe('Audio Streaming Endpoint', () => {
    let app;
    
    beforeAll(() => {
        app = express();
        app.use(express.json());
        
        // Add the audio streaming endpoint
        app.get('/api/audio/:filename', (req, res) => {
            try {
                const filename = req.params.filename;
                
                if (!filename) {
                    return res.status(400).json({ error: 'Filename required' });
                }
                
                // Validate filename to prevent directory traversal
                const safeFilenamePattern = /^[a-zA-Z0-9_\-\.]+$/;
                if (!safeFilenamePattern.test(filename)) {
                    return res.status(400).json({ error: 'Invalid filename format' });
                }
                
                // Ensure filename ends with .wav
                const audioFilename = filename.endsWith('.wav') ? filename : `${filename}.wav`;
                
                // For testing, use a test directory
                const audioDir = process.env.TEST_AUDIO_DIR || path.join(__dirname, 'test-audio');
                const fullPath = path.join(audioDir, audioFilename);
                
                // Validate path
                const normalizedAudioDir = path.resolve(audioDir);
                const normalizedFullPath = path.resolve(fullPath);
                
                if (!normalizedFullPath.startsWith(normalizedAudioDir)) {
                    return res.status(403).json({ error: 'Access denied: Invalid file path' });
                }
                
                // Check if file exists
                if (!fs.existsSync(fullPath)) {
                    return res.status(404).json({ error: 'Audio file not found', filename: audioFilename });
                }
                
                // Get file stats
                const stat = fs.statSync(fullPath);
                const fileSize = stat.size;
                const range = req.headers.range;
                
                // Support range requests
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
                        'Content-Type': 'audio/wav',
                    };
                    
                    res.writeHead(206, head);
                    file.pipe(res);
                } else {
                    const head = {
                        'Content-Length': fileSize,
                        'Content-Type': 'audio/wav',
                        'Accept-Ranges': 'bytes',
                    };
                    
                    res.writeHead(200, head);
                    fs.createReadStream(fullPath).pipe(res);
                }
            } catch (error) {
                console.error('Error streaming audio:', error);
                res.status(500).json({ error: 'Failed to stream audio file' });
            }
        });
    });
    
    beforeEach(() => {
        // Create test audio directory
        const testAudioDir = path.join(__dirname, 'test-audio');
        if (!fs.existsSync(testAudioDir)) {
            fs.mkdirSync(testAudioDir, { recursive: true });
        }
        
        // Create a dummy WAV file for testing
        const testFile = path.join(testAudioDir, 'test.wav');
        if (!fs.existsSync(testFile)) {
            // Create a minimal WAV file (44 bytes header + some data)
            const buffer = Buffer.alloc(100);
            fs.writeFileSync(testFile, buffer);
        }
    });
    
    afterAll(() => {
        // Clean up test files
        const testAudioDir = path.join(__dirname, 'test-audio');
        if (fs.existsSync(testAudioDir)) {
            fs.rmSync(testAudioDir, { recursive: true, force: true });
        }
    });
    
    test('should return 400 for invalid filename format', async () => {
        const response = await request(app)
            .get('/api/audio/invalid@file#name.wav')
            .expect(400);
        
        expect(response.body.error).toBe('Invalid filename format');
    });
    
    test('should return 404 for non-existent file', async () => {
        const response = await request(app)
            .get('/api/audio/nonexistent.wav')
            .expect(404);
        
        expect(response.body.error).toBe('Audio file not found');
    });
    
    test('should stream audio file successfully', async () => {
        const response = await request(app)
            .get('/api/audio/test.wav')
            .expect(200);
        
        expect(response.headers['content-type']).toBe('audio/wav');
        expect(response.headers['accept-ranges']).toBe('bytes');
        expect(response.headers['content-length']).toBe('100');
    });
    
    test('should support range requests', async () => {
        const response = await request(app)
            .get('/api/audio/test.wav')
            .set('Range', 'bytes=0-49')
            .expect(206);
        
        expect(response.headers['content-type']).toBe('audio/wav');
        expect(response.headers['accept-ranges']).toBe('bytes');
        expect(response.headers['content-range']).toBe('bytes 0-49/100');
        expect(response.headers['content-length']).toBe('50');
    });
    
    test('should handle filename without .wav extension', async () => {
        const response = await request(app)
            .get('/api/audio/test')
            .expect(200);
        
        expect(response.headers['content-type']).toBe('audio/wav');
    });
});
