const request = require('supertest');
const express = require('express');
const ValidationStorage = require('../validationStorage');
const ExcelExportService = require('../excelExport');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Create a minimal Express app for testing
function createTestApp() {
    const app = express();
    app.use(express.json());
    
    const testStoragePath = path.join(__dirname, 'test-export-validations.json');
    const validationStorage = new ValidationStorage(testStoragePath);
    
    // Mock metadata map
    const metadataMap = new Map([
        ['2308268002', {
            filename: '2308268002',
            duration_seconds: 5.5,
            reference_transcript: 'রেফারেন্স মেটাডেটা',
            transcript: 'এপিআই মেটাডেটা'
        }],
        ['2308268003', {
            filename: '2308268003',
            duration_seconds: 7.2,
            reference_transcript: 'আরেকটি রেফারেন্স',
            transcript: 'আরেকটি এপিআই'
        }]
    ]);
    
    // GET /api/export
    app.get('/api/export', async (req, res) => {
        try {
            const validations = validationStorage.getAllValidations();
            
            if (validations.length === 0) {
                return res.status(404).json({ 
                    error: 'No validations found',
                    message: 'There are no validation records to export'
                });
            }
            
            const excelService = new ExcelExportService();
            const buffer = await excelService.generateExcelBuffer(validations, metadataMap);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `transcript_validations_${timestamp}.xlsx`;
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.length);
            
            res.send(buffer);
        } catch (error) {
            res.status(500).json({ error: 'Failed to export validations' });
        }
    });
    
    return { app, validationStorage, testStoragePath };
}

describe('Export API Endpoint', () => {
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
    
    describe('GET /api/export', () => {
        it('should return 404 when no validations exist', async () => {
            const response = await request(app)
                .get('/api/export')
                .expect(404);
            
            expect(response.body.error).toBe('No validations found');
        });
        
        it('should export validations to Excel', async () => {
            // Save some validations
            validationStorage.saveValidation({
                filename: '2308268002',
                duration: 5.5,
                reference_transcript: 'রেফারেন্স',
                api_transcript: 'এপিআই',
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: 'রেফারেন্স'
            });
            
            const response = await request(app)
                .get('/api/export')
                .buffer()
                .parse((res, callback) => {
                    res.setEncoding('binary');
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => callback(null, Buffer.from(data, 'binary')));
                })
                .expect(200);
            
            // Check headers
            expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            expect(response.headers['content-disposition']).toMatch(/^attachment; filename="transcript_validations_.*\.xlsx"$/);
            
            // Check that we got a buffer
            expect(response.body).toBeInstanceOf(Buffer);
            expect(response.body.length).toBeGreaterThan(0);
        });
        
        it('should generate valid Excel file with correct data', async () => {
            // Save validations
            validationStorage.saveValidation({
                filename: '2308268002',
                duration: 5.5,
                reference_transcript: 'রেফারেন্স',
                api_transcript: 'এপিআই',
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: 'রেফারেন্স'
            });
            
            validationStorage.saveValidation({
                filename: '2308268003',
                duration: 7.2,
                reference_transcript: 'আরেকটি রেফারেন্স',
                api_transcript: 'আরেকটি এপিআই',
                is_reference_correct: false,
                is_api_correct: true,
                ideal_transcript: 'আরেকটি এপিআই'
            });
            
            const response = await request(app)
                .get('/api/export')
                .buffer()
                .parse((res, callback) => {
                    res.setEncoding('binary');
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => callback(null, Buffer.from(data, 'binary')));
                })
                .expect(200);
            
            // Parse the Excel file
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(response.body);
            
            const worksheet = workbook.getWorksheet('Validations');
            expect(worksheet).toBeDefined();
            
            // Check header row
            const headerRow = worksheet.getRow(1);
            expect(headerRow.getCell(1).value).toBe('filename');
            expect(headerRow.getCell(2).value).toBe('duration');
            expect(headerRow.getCell(3).value).toBe('reference_transcript');
            expect(headerRow.getCell(4).value).toBe('api_transcript');
            expect(headerRow.getCell(5).value).toBe('is_reference_correct');
            expect(headerRow.getCell(6).value).toBe('is_api_correct');
            expect(headerRow.getCell(7).value).toBe('ideal_transcript');
            
            // Check data rows (should have 2 validations)
            expect(worksheet.rowCount).toBe(3); // Header + 2 data rows
            
            // Check first data row
            const row1 = worksheet.getRow(2);
            expect(row1.getCell(1).value).toBe('2308268002');
            expect(row1.getCell(5).value).toBe('TRUE');
            expect(row1.getCell(6).value).toBe('FALSE');
            
            // Check second data row
            const row2 = worksheet.getRow(3);
            expect(row2.getCell(1).value).toBe('2308268003');
            expect(row2.getCell(5).value).toBe('FALSE');
            expect(row2.getCell(6).value).toBe('TRUE');
        });
    });
});
