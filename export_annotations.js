/**
 * Export annotations from individual JSON files to CSV
 * Usage: node export_annotations.js
 */

const fs = require('fs');
const path = require('path');

const ANNOTATIONS_DIR = path.join(__dirname, 'annotations');
const OUTPUT_FILE = path.join(__dirname, 'annotations_export.csv');

function exportAnnotations() {
    if (!fs.existsSync(ANNOTATIONS_DIR)) {
        console.log('No annotations directory found.');
        return;
    }

    // Read all annotation files
    const files = fs.readdirSync(ANNOTATIONS_DIR).filter(f => f.endsWith('_annotation.json'));

    if (files.length === 0) {
        console.log('No annotation files found.');
        return;
    }

    // Parse all annotations
    const annotations = [];
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(ANNOTATIONS_DIR, file), 'utf-8');
            annotations.push(JSON.parse(content));
        } catch (e) {
            console.error('Error parsing file:', file, e.message);
        }
    }

    // CSV headers
    const headers = [
        'filename',
        'duration',
        'refCorrect',
        'modelCorrect',
        'idealTranscript',
        'properNoun',
        'accentVariation',
        'numericDate',
        'homophone',
        'foreignLanguage',
        'gender',
        'backgroundNoise',
        'audioQuality',
        'notes',
        'annotator',
        'timestamp'
    ];

    // Create CSV content
    let csv = headers.join(',') + '\n';

    for (const ann of annotations) {
        const row = headers.map(header => {
            let value = ann[header] || '';
            // Escape quotes and wrap in quotes if contains comma or quote
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += row.join(',') + '\n';
    }

    // Write CSV file
    fs.writeFileSync(OUTPUT_FILE, csv, 'utf-8');

    console.log(`\nAnnotation Export Complete`);
    console.log(`========================`);
    console.log(`Total annotations: ${annotations.length}`);
    console.log(`Output file: ${OUTPUT_FILE}`);
    console.log(`\nSummary by annotator:`);

    // Count by annotator
    const byAnnotator = {};
    for (const ann of annotations) {
        byAnnotator[ann.annotator] = (byAnnotator[ann.annotator] || 0) + 1;
    }

    for (const [annotator, count] of Object.entries(byAnnotator)) {
        console.log(`  ${annotator}: ${count} files`);
    }
}

exportAnnotations();
