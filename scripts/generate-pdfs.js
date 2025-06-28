const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { marked } = require('marked');

// Configure marked for better rendering
marked.setOptions({
    breaks: true,
    gfm: true
});

// Create PDFs directory if it doesn't exist
const pdfsDir = path.join(__dirname, '..', 'pdfs');
if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir);
}

// Function to convert markdown to PDF
function markdownToPDF(markdownFile, outputFile, title) {
    console.log(`Converting ${markdownFile} to PDF...`);
    
    // Read markdown file
    const markdown = fs.readFileSync(markdownFile, 'utf8');
    
    // Convert markdown to HTML
    const html = marked(markdown);
    
    // Create PDF document with page buffering enabled
    const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true, // Enable page buffering for page numbering
        info: {
            Title: title,
            Author: 'Novi',
            Subject: 'Smart Commerce Suite Documentation',
            Keywords: 'Novi, Commerce, Platform, Documentation',
            Creator: 'PDF Generator',
            Producer: 'PDFKit'
        }
    });
    
    // Pipe to file
    const stream = fs.createWriteStream(outputFile);
    doc.pipe(stream);
    
    // Add header with Novi branding
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text(title, { align: 'center' })
       .moveDown(2);
    
    // Add company info
    doc.fontSize(12)
       .font('Helvetica')
       .text('Novi', { align: 'center' })
       .text('Smart Commerce Suite', { align: 'center' })
       .moveDown(2);
    
    // Add date
    doc.fontSize(10)
       .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'right' })
       .moveDown(3);
    
    // Process HTML content
    const lines = html.split('\n');
    let inCodeBlock = false;
    let codeBlockContent = '';
    
    for (let line of lines) {
        // Handle code blocks
        if (line.includes('<pre><code>')) {
            inCodeBlock = true;
            codeBlockContent = '';
            continue;
        }
        
        if (line.includes('</code></pre>')) {
            inCodeBlock = false;
            // Add code block to PDF
            doc.fontSize(8)
               .font('Courier')
               .text(codeBlockContent, {
                   align: 'left',
                   continued: false
               })
               .moveDown(1);
            continue;
        }
        
        if (inCodeBlock) {
            codeBlockContent += line + '\n';
            continue;
        }
        
        // Handle headers
        if (line.includes('<h1>')) {
            const text = line.replace(/<h1>(.*?)<\/h1>/, '$1');
            doc.fontSize(18)
               .font('Helvetica-Bold')
               .text(text)
               .moveDown(1);
            continue;
        }
        
        if (line.includes('<h2>')) {
            const text = line.replace(/<h2>(.*?)<\/h2>/, '$1');
            doc.fontSize(16)
               .font('Helvetica-Bold')
               .text(text)
               .moveDown(1);
            continue;
        }
        
        if (line.includes('<h3>')) {
            const text = line.replace(/<h3>(.*?)<\/h3>/, '$1');
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text(text)
               .moveDown(1);
            continue;
        }
        
        // Handle lists
        if (line.includes('<li>')) {
            const text = line.replace(/<li>(.*?)<\/li>/, '• $1');
            doc.fontSize(10)
               .font('Helvetica')
               .text(text, { indent: 20 })
               .moveDown(0.5);
            continue;
        }
        
        // Handle paragraphs
        if (line.includes('<p>')) {
            const text = line.replace(/<p>(.*?)<\/p>/, '$1');
            if (text.trim()) {
                doc.fontSize(10)
                   .font('Helvetica')
                   .text(text)
                   .moveDown(1);
            }
            continue;
        }
        
        // Handle tables
        if (line.includes('<table>')) {
            // Skip table for now (complex to render)
            continue;
        }
        
        // Handle horizontal rules
        if (line.includes('<hr>')) {
            doc.moveTo(50, doc.y)
               .lineTo(550, doc.y)
               .stroke()
               .moveDown(1);
            continue;
        }
        
        // Handle bold text
        if (line.includes('<strong>')) {
            const text = line.replace(/<strong>(.*?)<\/strong>/, '$1');
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .text(text)
               .moveDown(1);
            continue;
        }
        
        // Handle regular text
        if (line.trim() && !line.startsWith('<')) {
            doc.fontSize(10)
               .font('Helvetica')
               .text(line)
               .moveDown(1);
        }
    }
    
    // Add footer with page numbers
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // Add page number at bottom
        doc.fontSize(8)
           .font('Helvetica')
           .text(
               `Page ${i + 1} of ${pages.count}`,
               0,
               doc.page.height - 50,
               { align: 'center', width: doc.page.width }
           );
    }
    
    // Finalize PDF
    doc.end();
    
    return new Promise((resolve, reject) => {
        stream.on('finish', () => {
            console.log(`✅ PDF generated: ${outputFile}`);
            resolve();
        });
        
        stream.on('error', (error) => {
            console.error(`❌ Error generating PDF: ${error}`);
            reject(error);
        });
    });
}

// Main function to generate all PDFs
async function generateAllPDFs() {
    console.log('🚀 Starting PDF generation for Novi documentation...\n');
    
    const documents = [
        {
            markdown: path.join(__dirname, '..', 'docs', '01_BUSINESS_OVERVIEW.md'),
            pdf: path.join(pdfsDir, '01_Novi_Business_Overview.pdf'),
            title: 'Novi - Business Overview'
        },
        {
            markdown: path.join(__dirname, '..', 'docs', '02_USER_MANUAL.md'),
            pdf: path.join(pdfsDir, '02_Novi_User_Manual.pdf'),
            title: 'Novi - User Manual'
        },
        {
            markdown: path.join(__dirname, '..', 'docs', '03_TECHNICAL_DOCUMENTATION.md'),
            pdf: path.join(pdfsDir, '03_Novi_Technical_Documentation.pdf'),
            title: 'Novi - Technical Documentation'
        },
        {
            markdown: path.join(__dirname, '..', 'docs', '04_OPERATIONAL_DOCUMENTATION.md'),
            pdf: path.join(pdfsDir, '04_Novi_Operational_Documentation.pdf'),
            title: 'Novi - Operational Documentation'
        }
    ];
    
    for (const doc of documents) {
        try {
            if (fs.existsSync(doc.markdown)) {
                await markdownToPDF(doc.markdown, doc.pdf, doc.title);
            } else {
                console.log(`⚠️  Markdown file not found: ${doc.markdown}`);
            }
        } catch (error) {
            console.error(`❌ Failed to generate PDF for ${doc.markdown}:`, error);
        }
    }
    
    console.log('\n🎉 PDF generation completed!');
    console.log(`📁 PDFs saved in: ${pdfsDir}`);
    console.log('\n📋 Generated Documents:');
    console.log('   • 01_Novi_Business_Overview.pdf');
    console.log('   • 02_Novi_User_Manual.pdf');
    console.log('   • 03_Novi_Technical_Documentation.pdf');
    console.log('   • 04_Novi_Operational_Documentation.pdf');
}

// Run the script
if (require.main === module) {
    generateAllPDFs().catch(console.error);
}

module.exports = { generateAllPDFs, markdownToPDF }; 