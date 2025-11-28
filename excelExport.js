const ExcelJS = require('exceljs');

/**
 * Excel Export Service
 * Generates Excel files with validation results and metadata
 */
class ExcelExportService {
    /**
     * Generate Excel workbook with validation data
     * @param {Array<Object>} validations - Array of validation records
     * @param {Map<string, Object>} metadataMap - Map of filename to metadata
     * @returns {Promise<ExcelJS.Workbook>} - Excel workbook
     */
    async generateWorkbook(validations, metadataMap) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Validations');
        
        // Define columns according to requirements 6.2
        worksheet.columns = [
            { header: 'filename', key: 'filename', width: 20 },
            { header: 'duration', key: 'duration', width: 12 },
            { header: 'reference_transcript', key: 'reference_transcript', width: 50 },
            { header: 'api_transcript', key: 'api_transcript', width: 50 },
            { header: 'is_reference_correct', key: 'is_reference_correct', width: 20 },
            { header: 'is_api_correct', key: 'is_api_correct', width: 20 },
            { header: 'ideal_transcript', key: 'ideal_transcript', width: 50 }
        ];
        
        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };
        
        // Populate rows with validation data
        for (const validation of validations) {
            const metadata = metadataMap.get(validation.filename);
            
            // Get duration from validation record or metadata
            const duration = validation.duration || (metadata ? metadata.duration_seconds : 0);
            
            // Get transcripts from validation record or metadata
            const referenceTranscript = validation.reference_transcript || 
                                       (metadata ? metadata.reference_transcript || '' : '');
            const apiTranscript = validation.api_transcript || 
                                 (metadata ? metadata.transcript || '' : '');
            
            worksheet.addRow({
                filename: validation.filename,
                duration: duration,
                reference_transcript: referenceTranscript,
                api_transcript: apiTranscript,
                is_reference_correct: validation.is_reference_correct ? 'TRUE' : 'FALSE',
                is_api_correct: validation.is_api_correct ? 'TRUE' : 'FALSE',
                ideal_transcript: validation.ideal_transcript
            });
        }
        
        return workbook;
    }
    
    /**
     * Generate Excel buffer for download
     * @param {Array<Object>} validations - Array of validation records
     * @param {Map<string, Object>} metadataMap - Map of filename to metadata
     * @returns {Promise<Buffer>} - Excel file buffer
     */
    async generateExcelBuffer(validations, metadataMap) {
        const workbook = await this.generateWorkbook(validations, metadataMap);
        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }
}

module.exports = ExcelExportService;
