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

        connection.query(query, [miembroId, firstDayPreviousMonth, lastDayPreviousMonth, firstDayCurrentMonth, currentDate], (err, results) => {
            connection.release();

            if (err) {
                console.error('Error performing query:', err);
                return res.status(500).send('Internal Server Error');
            }

            res.json(results);
        });
    });
});



// endpoint que agrega un movimientoManual
app.post('/movimientoManual', (req, res) => {
    const { id_miembro, gasto, cantidad, nombre_lugar, tipo, fechaMovimiento } = req.body;
    const fecha = fechaMovimiento ? new Date(fechaMovimiento) : new Date();
    const fechaReporte = new Date(fecha.getFullYear(), fecha.getMonth(), 1);

    const insertMovimientoQuery = `
        INSERT INTO Movimientos (id_miembro, fecha, gasto, cantidad, nombre_lugar, tipo)
        VALUES (?, ?, ?, ?, ?, ?)`;

    pool.query(insertMovimientoQuery, [id_miembro, fecha, gasto, cantidad, nombre_lugar, tipo], (err, movimientoResult) => {
        if (err) {
            console.error('Error inserting movimiento:', err);
            return res.status(500).send('Error al insertar movimiento');
        }

        const checkReporteQuery = `
            SELECT * FROM Reporte
            WHERE id_miembro = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?`;

        pool.query(checkReporteQuery, [id_miembro, fechaReporte.getMonth() + 1, fechaReporte.getFullYear()], (err, reportes) => {
            if (err) {
                console.error('Error checking reporte:', err);
                return res.status(500).send('Error al chequear reporte');
            }

            if (reportes.length > 0) {
                const reporte = reportes[0];

                let datosActualizados = reporte.datos ? JSON.parse(reporte.datos) : {};
                if (gasto == true) {
                    datosActualizados[tipo] = (datosActualizados[tipo] || 0) + cantidad;
                }

                const updateReporteQuery = `
                    UPDATE Reporte
                    SET total_gastos = IF(? = TRUE, total_gastos + ?, total_gastos), 
                        total_ingresos = IF(? = FALSE, total_ingresos + ?, total_ingresos),
                        resumen = IFNULL(resumen, ''), 
                        datos = ?
                    WHERE id_reporte = ?`;

                pool.query(updateReporteQuery, [gasto, cantidad, gasto, cantidad, JSON.stringify(datosActualizados), reporte.id_reporte], (err, updateResult) => {
                    if (err) {
                        console.error('Error updating reporte:', err);
                        return res.status(500).send('Error al actualizar reporte');
                    }

                    res.send('Movimiento y reporte actualizados correctamente');
                });
            } else {
                const totalGastos = gasto ? cantidad : 0;
                const totalIngresos = !gasto ? cantidad : 0;

                const datosIniciales = {
                    Entretenimiento: 0,
                    Transporte: 0,
                    Varios: 0,
                    Basicos: 0,
                    Restaurante: 0
                };

                if (gasto) {
                    datosIniciales[tipo] = cantidad;
                }

                const insertReporteQuery = `
                    INSERT INTO Reporte (id_miembro, fecha, total_gastos, total_ingresos, resumen, datos)
                    VALUES (?, ?, ?, ?, ?, ?)`;

                pool.query(insertReporteQuery, [id_miembro, fechaReporte, totalGastos, totalIngresos, "", JSON.stringify(datosIniciales)], (err, insertResult) => {
                    if (err) {
                        console.error('Error inserting new reporte:', err);
                        return res.status(500).send('Error al insertar nuevo reporte');
                    }

                    res.send('Movimiento añadido y nuevo reporte creado');
                });
            }
        });
    });
});


// endpoint que regresa los movimientos de un miembro
app.get('/movimientos/:id_miembro', (req, res) => {
    const { id_miembro } = req.params; // Obtiene el id_miembro de los parámetros de la ruta

    // Query para seleccionar todos los movimientos del miembro especificado
    const selectMovimientosQuery = `
        SELECT * FROM Movimientos
        WHERE id_miembro = ?`;

    pool.query(selectMovimientosQuery, [id_miembro], (err, movimientos) => {
        if (err) {
            console.error('Error retrieving movimientos:', err);
            return res.status(500).send('Error al recuperar los movimientos');
        }

        // Si no hay errores, enviar los movimientos encontrados
        res.json(movimientos);
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