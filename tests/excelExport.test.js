const ExcelExportService = require('../excelExport');
const ExcelJS = require('exceljs');

describe('Excel Export Service', () => {
    let excelService;
    
    beforeEach(() => {
        excelService = new ExcelExportService();
    });
    
    describe('generateWorkbook', () => {
        it('should create workbook with correct columns', async () => {
            const validations = [];
            const metadataMap = new Map();
            
            const workbook = await excelService.generateWorkbook(validations, metadataMap);
            const worksheet = workbook.getWorksheet('Validations');
            
            expect(worksheet).toBeDefined();
            expect(worksheet.columns.length).toBe(7);
            expect(worksheet.columns[0].header).toBe('filename');
            expect(worksheet.columns[1].header).toBe('duration');
            expect(worksheet.columns[2].header).toBe('reference_transcript');
            expect(worksheet.columns[3].header).toBe('api_transcript');
            expect(worksheet.columns[4].header).toBe('is_reference_correct');
            expect(worksheet.columns[5].header).toBe('is_api_correct');
            expect(worksheet.columns[6].header).toBe('ideal_transcript');
        });
        
        it('should populate rows with validation data', async () => {
            const validations = [
                {
                    filename: '2308268002',
                    duration: 5.5,
                    reference_transcript: 'রেফারেন্স',
                    api_transcript: 'এপিআই',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: 'রেফারেন্স'
                }
            ];
            const metadataMap = new Map();
            
            const workbook = await excelService.generateWorkbook(validations, metadataMap);
            const worksheet = workbook.getWorksheet('Validations');
            
            // Row 1 is header, row 2 is data
            expect(worksheet.rowCount).toBe(2);
            
            const dataRow = worksheet.getRow(2);
            expect(dataRow.getCell(1).value).toBe('2308268002');
            expect(dataRow.getCell(2).value).toBe(5.5);
            expect(dataRow.getCell(3).value).toBe('রেফারেন্স');
            expect(dataRow.getCell(4).value).toBe('এপিআই');
            expect(dataRow.getCell(5).value).toBe('TRUE');
            expect(dataRow.getCell(6).value).toBe('FALSE');
            expect(dataRow.getCell(7).value).toBe('রেফারেন্স');
        });
        
        it('should merge data from metadata when not in validation', async () => {
            const validations = [
                {
                    filename: '2308268002',
                    is_reference_correct: false,
                    is_api_correct: true,
                    ideal_transcript: 'এপিআই ট্রান্সক্রিপ্ট'
                }
            ];
            const metadataMap = new Map([
                ['2308268002', {
                    filename: '2308268002',
                    duration_seconds: 7.2,
                    reference_transcript: 'রেফারেন্স মেটাডেটা',
                    transcript: 'এপিআই মেটাডেটা'
                }]
            ]);
            
            const workbook = await excelService.generateWorkbook(validations, metadataMap);
            const worksheet = workbook.getWorksheet('Validations');
            
            const dataRow = worksheet.getRow(2);
            expect(dataRow.getCell(1).value).toBe('2308268002');
            expect(dataRow.getCell(2).value).toBe(7.2); // From metadata
            expect(dataRow.getCell(3).value).toBe('রেফারেন্স মেটাডেটা'); // From metadata
            expect(dataRow.getCell(4).value).toBe('এপিআই মেটাডেটা'); // From metadata
            expect(dataRow.getCell(5).value).toBe('FALSE');
            expect(dataRow.getCell(6).value).toBe('TRUE');
            expect(dataRow.getCell(7).value).toBe('এপিআই ট্রান্সক্রিপ্ট');
        });
        
        it('should handle multiple validations', async () => {
            const validations = [
                {
                    filename: 'file1',
                    duration: 5.0,
                    reference_transcript: 'ref1',
                    api_transcript: 'api1',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: 'ref1'
                },
                {
                    filename: 'file2',
                    duration: 3.5,
                    reference_transcript: 'ref2',
                    api_transcript: 'api2',
                    is_reference_correct: false,
                    is_api_correct: true,
                    ideal_transcript: 'api2'
                }
            ];
            const metadataMap = new Map();
            
            const workbook = await excelService.generateWorkbook(validations, metadataMap);
            const worksheet = workbook.getWorksheet('Validations');
            
            expect(worksheet.rowCount).toBe(3); // Header + 2 data rows
        });
    });
    
    describe('generateExcelBuffer', () => {
        it('should generate a valid Excel buffer', async () => {
            const validations = [
                {
                    filename: 'test',
                    duration: 1.0,
                    reference_transcript: 'ref',
                    api_transcript: 'api',
                    is_reference_correct: true,
                    is_api_correct: false,
                    ideal_transcript: 'ref'
                }
            ];
            const metadataMap = new Map();
            
            const buffer = await excelService.generateExcelBuffer(validations, metadataMap);
            
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
            
            // Verify it's a valid Excel file by reading it back
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Validations');
            expect(worksheet).toBeDefined();
        });
    });
});
