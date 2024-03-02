const pdf = require('pdf-parse');
const PDFParser = require("pdf2json");
const fs = require('fs');

const pdfFilePath = '../iHack-Finance-API/tempFile/agosto2023.pdf';

const pdfParser = new PDFParser();

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    console.log(JSON.stringify(pdfData, null, 2)); // Pretty print the JSON
});

pdfParser.loadPDF(pdfFilePath);


/*
function readAndPrintPdfText(pdfFilePath) {
    // Reading the PDF file
    let dataBuffer = fs.readFileSync(pdfFilePath);

    // Using pdf-parse to extract text from the PDF
    pdf(dataBuffer).then(function(data) {
        // Printing the text content to the console
        console.log(data.text);
    }).catch(function(error){
        // Handling any errors
        console.error("Error parsing PDF: ", error);
    });
}

readAndPrintPdfText(pdfFilePath);
*/