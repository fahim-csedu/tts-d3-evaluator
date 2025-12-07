/**
 * Integration Tests for Transcript Validation Tool
 * Tests the complete end-to-end validation flow
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadAllMetadata } = require('../csvParser');
const ValidationStorage = require('../validationStorage');
const ExcelExportService = require('../excelExport');

describe('End-to-End Validation Flow', () => {
    let app;
    let validationStorage;
    let metadataMap;
    let testValidationPath;
    
    beforeAll(() => {
        // Set up test environment
        testValidationPath = path.join(__dirname, 'test_validations.json');
        
        // Initialize validation storage with test file
        validationStorage = new ValidationStorage(testValidationPath);
        
        // Load metadata (use actual CSV files if available, otherwise mock)
        const transcriptionResultsPath = path.join(__dirname, '..', 'transcription_results.csv');
        const bnttsCerPath = path.join(__dirname, '..', 'bntts_cer.csv');
        const undefinedListingPath = path.join(__dirname, '..', 'Undefined listing.txt');
        
        if (fs.existsSync(transcriptionResultsPath)) {
            metadataMap = loadAllMetadata(transcriptionResultsPath, bnttsCerPath, undefinedListingPath);
        } else {
            // Create mock metadata for testing
            metadataMap = new Map();
            metadataMap.set('test_audio_1', {
                filename: 'test_audio_1',
                reference_transcript: 'এটি একটি পরীক্ষা',
                transcript: 'এটি একটি পরীক্ষা',
                duration_seconds: 5.5,
                cer: 0.0
            });
            metadataMap.set('test_audio_2', {
                filename: 'test_audio_2',
                reference_transcript: 'দ্বিতীয় পরীক্ষা',
                transcript: 'দ্বিতীয় পরীক্ষা ফাইল',
                duration_seconds: 7.2,
                cer: 0.15
            });
        }
        
        // Set up minimal Express app for testing
        app = express();
        app.use(express.json());
        
        // Add validation endpoints
        app.post('/api/validation', (req, res) => {
            try {
                const validation = req.body;
                
                if (!validation.filename) {
                    return res.status(400).json({ error: 'Filename is required' });
                }
                
                if (!validation.ideal_transcript) {
                    return res.status(400).json({ error: 'Ideal transcript is required' });
                }
                
                if (!/\S/.test(validation.ideal_transcript)) {
                    return res.status(400).json({ error: 'Ideal transcript cannot be empty' });
                }
                
                if (!validation.timestamp) {
                    validation.timestamp = new Date().toISOString();
                }
                
                const success = validationStorage.saveValidation(validation);
                
                if (success) {
                    res.json({ success: true, message: 'Validation saved successfully' });
                } else {
                    res.status(500).json({ error: 'Failed to save validation' });
                }
            } catch (error) {
                res.status(500).json({ error: 'Failed to save validation' });
            }
        });
        
        app.get('/api/validation/:filename', (req, res) => {
            try {
                const filename = req.params.filename;
                const baseFilename = filename.replace(/\.(wav|mp3|flac|m4a|ogg)$/i, '');
                const validation = validationStorage.getValidation(baseFilename);
                
                if (validation) {
                    res.json(validation);
                } else {
                    res.status(404).json({ error: 'Validation not found' });
                }
            } catch (error) {
                res.status(500).json({ error: 'Failed to retrieve validation' });
            }
        });
        
        app.get('/api/validations', (req, res) => {
            try {
                const validations = validationStorage.getAllValidations();
                res.json(validations);
            } catch (error) {
                res.status(500).json({ error: 'Failed to retrieve validations' });
            }
        });
        
        app.get('/api/metadata/:filename', (req, res) => {
            try {
                const filename = req.params.filename;
                const baseFilename = filename.replace(/\.(wav|mp3|flac|m4a|ogg)$/i, '');
                const metadata = metadataMap.get(baseFilename);
                
                if (metadata) {
                    res.json(metadata);
                } else {
                    res.status(404).json({ error: 'Metadata not found' });
                }
            } catch (error) {
                res.status(500).json({ error: 'Failed to retrieve metadata' });
            }
        });
        
        app.get('/api/export', async (req, res) => {
            try {
                const validations = validationStorage.getAllValidations();
                
                if (validations.length === 0) {
                    return res.status(404).json({ error: 'No validations found' });
                }
                
                const excelService = new ExcelExportService();
                const buffer = await excelService.generateExcelBuffer(validations, metadataMap);
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="test_export.xlsx"');
                res.send(buffer);
            } catch (error) {
                res.status(500).json({ error: 'Failed to export validations' });
            }
        });
    });
    
    afterAll(() => {
        // Clean up test validation file
        if (fs.existsSync(testValidationPath)) {
            fs.unlinkSync(testValidationPath);
        }
    });
    
    beforeEach(() => {
        // Clear validations before each test
        if (fs.existsSync(testValidationPath)) {
            fs.unlinkSync(testValidationPath);
        }
        validationStorage = new ValidationStorage(testValidationPath);
    });
    
    describe('Complete Validation Workflow', () => {
        test('should complete full workflow: load metadata -> validate -> retrieve -> export', async () => {
            // Get a real filename from the metadata map
            const testFilename = Array.from(metadataMap.keys())[0];
            
            if (!testFilename) {
                // Skip test if no metadata available
                console.warn('Skipping test: No metadata available');
                return;
            }
            
            // Step 1: Load metadata for a file
            const metadataResponse = await request(app)
                .get(`/api/metadata/${testFilename}`)
                .expect(200);
            
            expect(metadataResponse.body).toHaveProperty('filename', testFilename);
            expect(metadataResponse.body).toHaveProperty('reference_transcript');
            expect(metadataResponse.body).toHaveProperty('transcript');
            
            // Step 2: Submit a validation (reference is correct)
            const validationData = {
                filename: testFilename,
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: metadataResponse.body.reference_transcript,
                naturalness: 4,
                intelligibility: 5,
                prosody: 4,
                pronunciation: 5,
                overall: 4,
                timestamp: new Date().toISOString()
            };
            
            const saveResponse = await request(app)
                .post('/api/validation')
                .send(validationData)
                .expect(200);
            
            expect(saveResponse.body).toHaveProperty('success', true);
            
            // Step 3: Retrieve the validation
            const retrieveResponse = await request(app)
                .get(`/api/validation/${testFilename}`)
                .expect(200);
            
            expect(retrieveResponse.body).toMatchObject({
                filename: testFilename,
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: validationData.ideal_transcript,
                naturalness: 4,
                overall: 4
            });
            
            // Step 4: Export to Excel
            const exportResponse = await request(app)
                .get('/api/export')
                .buffer(true)
                .parse((res, callback) => {
                    res.setEncoding('binary');
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => callback(null, Buffer.from(data, 'binary')));
                })
                .expect(200);
            
            expect(exportResponse.headers['content-type']).toContain('spreadsheetml.sheet');
            // Response body should be a Buffer with content
            expect(exportResponse.body).toBeDefined();
            expect(exportResponse.body.length).toBeGreaterThan(0);
        });
        
        test('should handle multiple validations in sequence', async () => {
            // Validate first audio
            await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_1',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: 'এটি একটি পরীক্ষা',
                    naturalness: 4,
                    intelligibility: 5,
                    prosody: 4,
                    pronunciation: 5,
                    overall: 4,
                    timestamp: new Date().toISOString()
                })
                .expect(200);
            
            // Validate second audio
            await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_2',
                    is_reference_correct: false,
                    is_api_correct: true,
                    ideal_transcript: 'দ্বিতীয় পরীক্ষা ফাইল',
                    naturalness: 3,
                    intelligibility: 4,
                    prosody: 3,
                    pronunciation: 4,
                    overall: 3,
                    timestamp: new Date().toISOString()
                })
                .expect(200);
            
            // Get all validations
            const allValidationsResponse = await request(app)
                .get('/api/validations')
                .expect(200);
            
            expect(Array.isArray(allValidationsResponse.body)).toBe(true);
            expect(allValidationsResponse.body.length).toBe(2);
            
            // Verify both validations are present
            const filenames = allValidationsResponse.body.map(v => v.filename);
            expect(filenames).toContain('test_audio_1');
            expect(filenames).toContain('test_audio_2');
        });
        
        test('should allow modification of existing validations', async () => {
            // Initial validation
            const initialValidation = {
                filename: 'test_audio_1',
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: 'এটি একটি পরীক্ষা',
                naturalness: 4,
                intelligibility: 5,
                prosody: 4,
                pronunciation: 5,
                overall: 4,
                timestamp: new Date().toISOString()
            };
            
            await request(app)
                .post('/api/validation')
                .send(initialValidation)
                .expect(200);
            
            // Modify validation (change to API correct)
            const modifiedValidation = {
                filename: 'test_audio_1',
                is_reference_correct: false,
                is_api_correct: true,
                ideal_transcript: 'এটি একটি সংশোধিত পরীক্ষা',
                naturalness: 2,
                intelligibility: 3,
                prosody: 2,
                pronunciation: 3,
                overall: 2,
                timestamp: new Date().toISOString()
            };
            
            await request(app)
                .post('/api/validation')
                .send(modifiedValidation)
                .expect(200);
            
            // Retrieve and verify modification
            const retrieveResponse = await request(app)
                .get('/api/validation/test_audio_1')
                .expect(200);
            
            expect(retrieveResponse.body).toMatchObject({
                filename: 'test_audio_1',
                is_reference_correct: false,
                is_api_correct: true,
                ideal_transcript: 'এটি একটি সংশোধিত পরীক্ষা'
            });
        });
    });
    
    describe('Data Persistence Across Sessions', () => {
        test('should persist validations to disk', async () => {
            // Save a validation
            await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_1',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: 'এটি একটি পরীক্ষা',
                    naturalness: 4,
                    intelligibility: 5,
                    prosody: 4,
                    pronunciation: 5,
                    overall: 4,
                    timestamp: new Date().toISOString()
                })
                .expect(200);
            
            // Verify file was created
            expect(fs.existsSync(testValidationPath)).toBe(true);
            
            // Create new storage instance (simulating app restart)
            const newStorage = new ValidationStorage(testValidationPath);
            const validation = newStorage.getValidation('test_audio_1');
            
            expect(validation).toBeDefined();
            expect(validation.filename).toBe('test_audio_1');
            expect(validation.ideal_transcript).toBe('এটি একটি পরীক্ষা');
            expect(validation.naturalness).toBe(4);
        });
        
        test('should maintain validation history across multiple saves', async () => {
            // Save multiple validations
            const validations = [
                { filename: 'test_audio_1', ideal_transcript: 'प्रথম', naturalness: 3, intelligibility: 3, prosody: 3, pronunciation: 3, overall: 3 },
                { filename: 'test_audio_2', ideal_transcript: 'द্বিতীয়', naturalness: 4, intelligibility: 4, prosody: 4, pronunciation: 4, overall: 4 },
                { filename: 'test_audio_3', ideal_transcript: 'তৃতীয়', naturalness: 5, intelligibility: 5, prosody: 5, pronunciation: 5, overall: 5 }
            ];
            
            for (const val of validations) {
                await request(app)
                    .post('/api/validation')
                    .send({
                        ...val,
                        is_reference_correct: true,
                        is_api_correct: false,
                        timestamp: new Date().toISOString()
                    })
                    .expect(200);
            }
            
            // Create new storage instance
            const newStorage = new ValidationStorage(testValidationPath);
            const allValidations = newStorage.getAllValidations();
            
            expect(allValidations.length).toBe(3);
            expect(allValidations.map(v => v.filename)).toEqual(
                expect.arrayContaining(['test_audio_1', 'test_audio_2', 'test_audio_3'])
            );
        });
    });
    
    describe('Error Handling', () => {
        test('should reject validation with missing filename', async () => {
            const response = await request(app)
                .post('/api/validation')
                .send({
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: 'এটি একটি পরীক্ষা'
                })
                .expect(400);
            
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Filename');
        });
        
        test('should reject validation with empty ideal transcript', async () => {
            const response = await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_1',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: ''
                })
                .expect(400);
            
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Ideal transcript');
        });
        
        test('should reject validation with whitespace-only ideal transcript', async () => {
            const response = await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_1',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: '   \n\t   '
                })
                .expect(400);
            
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('empty');
        });
        
        test('should return 404 for non-existent validation', async () => {
            const response = await request(app)
                .get('/api/validation/nonexistent_file')
                .expect(404);
            
            expect(response.body).toHaveProperty('error');
        });
        
        test('should return 404 for non-existent metadata', async () => {
            const response = await request(app)
                .get('/api/metadata/nonexistent_file')
                .expect(404);
            
            expect(response.body).toHaveProperty('error');
        });
        
        test('should return 404 when exporting with no validations', async () => {
            const response = await request(app)
                .get('/api/export')
                .expect(404);
            
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('No validations');
        });
    });
    
    describe('Bengali Unicode Handling', () => {
        test('should correctly store and retrieve Bengali Unicode text', async () => {
            const bengaliText = 'আমি বাংলায় গান গাই। এটি একটি পরীক্ষা।';
            
            await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_1',
                    is_reference_correct: false,
                    is_api_correct: false,
                    ideal_transcript: bengaliText,
                    timestamp: new Date().toISOString()
                })
                .expect(200);
            
            const response = await request(app)
                .get('/api/validation/test_audio_1')
                .expect(200);
            
            expect(response.body.ideal_transcript).toBe(bengaliText);
        });
        
        test('should handle Bengali text with diacritics', async () => {
            const bengaliWithDiacritics = 'কী করছো? আমি ভালো আছি।';
            
            await request(app)
                .post('/api/validation')
                .send({
                    filename: 'test_audio_1',
                    is_reference_correct: false,
                    is_api_correct: false,
                    ideal_transcript: bengaliWithDiacritics,
                    timestamp: new Date().toISOString()
                })
                .expect(200);
            
            const response = await request(app)
                .get('/api/validation/test_audio_1')
                .expect(200);
            
            expect(response.body.ideal_transcript).toBe(bengaliWithDiacritics);
        });
    });
});
