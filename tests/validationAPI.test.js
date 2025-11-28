const request = require('supertest');
const express = require('express');
const ValidationStorage = require('../validationStorage');
const path = require('path');
const fs = require('fs');

// Create a minimal Express app for testing
function createTestApp() {
    const app = express();
    app.use(express.json());
    
    const testStoragePath = path.join(__dirname, 'test-api-validations.json');
    const validationStorage = new ValidationStorage(testStoragePath);
    
    // POST /api/validation
    app.post('/api/validation', (req, res) => {
        try {
            const validation = req.body;
            
            if (!validation.filename) {
                return res.status(400).json({ error: 'Filename is required' });
            }
            
            if (!validation.ideal_transcript) {
                return res.status(400).json({ error: 'Ideal transcript is required' });
            }
            
            if (!validation.timestamp) {
                validation.timestamp = new Date().toISOString();
            }
            
            const success = validationStorage.saveValidation(validation);
            
            if (success) {
                res.json({ 
                    success: true, 
                    message: 'Validation saved successfully',
                    filename: validation.filename
                });
            } else {
                res.status(500).json({ error: 'Failed to save validation' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Failed to save validation' });
        }
    });
    
    // GET /api/validation/:filename
    app.get('/api/validation/:filename', (req, res) => {
        try {
            const filename = req.params.filename;
            
            if (!filename) {
                return res.status(400).json({ error: 'Filename is required' });
            }
            
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
            res.status(500).json({ error: 'Failed to retrieve validation' });
        }
    });
    
    // GET /api/validations
    app.get('/api/validations', (req, res) => {
        try {
            const validations = validationStorage.getAllValidations();
            res.json({
                count: validations.length,
                validations: validations
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve validations' });
        }
    });
    
    return { app, validationStorage, testStoragePath };
}

describe('Validation API Endpoints', () => {
    let app;
    let validationStorage;
    let testStoragePath;
    
    beforeEach(() => {
        const testApp = createTestApp();
        app = testApp.app;
        validationStorage = testApp.validationStorage;
        testStoragePath = testApp.testStoragePath;
    });
    
    afterEach(() => {
        if (fs.existsSync(testStoragePath)) {
            fs.unlinkSync(testStoragePath);
        }
    });
    
    describe('POST /api/validation', () => {
        it('should save a validation record', async () => {
            const validation = {
                filename: '2308268002',
                duration: 5.5,
                reference_transcript: 'রেফারেন্স',
                api_transcript: 'এপিআই',
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: 'রেফারেন্স'
            };
            
            const response = await request(app)
                .post('/api/validation')
                .send(validation)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.filename).toBe('2308268002');
        });
        
        it('should require filename', async () => {
            const validation = {
                ideal_transcript: 'test'
            };
            
            const response = await request(app)
                .post('/api/validation')
                .send(validation)
                .expect(400);
            
            expect(response.body.error).toBe('Filename is required');
        });
        
        it('should require ideal_transcript', async () => {
            const validation = {
                filename: '2308268002'
            };
            
            const response = await request(app)
                .post('/api/validation')
                .send(validation)
                .expect(400);
            
            expect(response.body.error).toBe('Ideal transcript is required');
        });
    });
    
    describe('GET /api/validation/:filename', () => {
        it('should retrieve a saved validation', async () => {
            const validation = {
                filename: '2308268002',
                ideal_transcript: 'test transcript'
            };
            
            validationStorage.saveValidation(validation);
            
            const response = await request(app)
                .get('/api/validation/2308268002')
                .expect(200);
            
            expect(response.body.filename).toBe('2308268002');
            expect(response.body.ideal_transcript).toBe('test transcript');
        });
        
        it('should handle .wav extension in filename', async () => {
            const validation = {
                filename: '2308268002',
                ideal_transcript: 'test'
            };
            
            validationStorage.saveValidation(validation);
            
            const response = await request(app)
                .get('/api/validation/2308268002.wav')
                .expect(200);
            
            expect(response.body.filename).toBe('2308268002');
        });
        
        it('should return 404 for non-existent validation', async () => {
            const response = await request(app)
                .get('/api/validation/nonexistent')
                .expect(404);
            
            expect(response.body.error).toBe('Validation not found');
        });
    });
    
    describe('GET /api/validations', () => {
        it('should return all validations', async () => {
            validationStorage.saveValidation({ filename: 'file1', ideal_transcript: 'test1' });
            validationStorage.saveValidation({ filename: 'file2', ideal_transcript: 'test2' });
            
            const response = await request(app)
                .get('/api/validations')
                .expect(200);
            
            expect(response.body.count).toBe(2);
            expect(response.body.validations).toHaveLength(2);
        });
        
        it('should return empty array when no validations', async () => {
            const response = await request(app)
                .get('/api/validations')
                .expect(200);
            
            expect(response.body.count).toBe(0);
            expect(response.body.validations).toEqual([]);
        });
    });
});
