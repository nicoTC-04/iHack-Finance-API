const pdf = require('pdf-parse');
const fs = require('fs');

const pdfFilePath = '../iHack-Finance-API/tempFile/marzo 2024.pdf';


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