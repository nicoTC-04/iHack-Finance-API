const express = require('express');
const mysql = require('mysql2');
const pdf = require('pdf-parse');
const fs = require('fs');
const axios = require('axios');
const cors = require('cors');
const path = require('path');



const app = express();
app.use(express.json());
app.use(cors());


// Configuracion DB
const pool = mysql.createPool({
    connectionLimit : 10, // Modify as needed
    host: '10.44.208.3',
    user: 'nicoAdmin',
    password: 'Kge/a;^nSH#./]L8',
    database: 'Finance'
  });
  
  pool.on('connection', function (connection) {
    console.log('DB Connection established');
  });
  
  pool.on('error', function (err) {
    console.error('DB Connection error', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Database connection was closed.');
    } else {
        throw err;
    }
  });




//const pdfFilePath = '../iHack-Finance-API/tempFile/marzo 2024.pdf';
const port = 3000;




app.get('/', (req, res) => {
  res.send('Hello World!');
});




// Endpoint to receive email and return information
app.post('/checkUser', (req, res) => {
    const { email } = req.body;
    const { password } = req.body;
  
    const query = `
        SELECT id_miembro, nombre
        FROM Miembro
        WHERE correo = ? AND password = ?
      `;
  
  
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting connection from pool:', err);
            res.status(500).send('Internal Server Error');
            return;
        }
  
        connection.query(query, [email, password], (err, results) => {
            // When done with the connection, release it.
            connection.release();
  
            if (err) {
                console.error('Error performing query:', err);
                res.status(500).send('Internal Server Error');
                return;
            }
  
            // existing code
            if (results.length > 0) {
                const [result] = results;
                res.json({
                    valid: true,
                    id_miembro: result.id_miembro,
                    nombre: result.nombre
                });
            } else {
                res.json({
                    valid: false,
                    id_miembro: null,
                    nombre: null
                });
            }
        });
    });
  });




// Endpoint to receive email and return information
app.get('/reportesMiembro', (req, res) => {
    const miembroId = req.header('id_miembro');
    console.log("miembroId en reportes");
    console.log(miembroId);

    if (!miembroId) {
        return res.status(400).json({ error: 'El id_miembro es requerido' });
    }

    // Obtener el primer y último día del mes actual y el mes anterior
    const currentDate = new Date();
    const firstDayCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
    const firstDayPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

    const query = `
        SELECT r.total_gastos, r.total_ingresos, r.resumen, r.datos 
        FROM Reporte r
        WHERE r.id_miembro = ? AND (
            (r.fecha >= ? AND r.fecha <= ?) OR 
            (r.fecha >= ? AND r.fecha <= ?)
        )`;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting connection from pool:', err);
            return res.status(500).send('Internal Server Error');
        }

        connection.query(query, [id_miembro, firstDayPreviousMonth, lastDayPreviousMonth, firstDayCurrentMonth, currentDate], (err, results) => {
            connection.release();

            if (err) {
                console.error('Error performing query:', err);
                return res.status(500).send('Internal Server Error');
            }

            res.json(results);
        });
    });
});












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


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});