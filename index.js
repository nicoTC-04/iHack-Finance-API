const express = require('express');
const mysql = require('mysql2');
const pdf = require('pdf-parse');
const fs = require('fs');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require("openai");
const multer = require('multer');


const app = express();
app.use(express.json());
app.use(cors());

const uploadsDirectory = 'tempFile/';

// multer setup
// Set up storage location and filenames for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDirectory); // Ensure this directory exists
    },
    filename: function (req, file, cb) {
      // Use a fixed file name
      cb(null, 'cuenta.pdf');
    }
  });
  
const upload = multer({ storage: storage });


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

const apiKeyPart1 = 'sk-lwCzXtZep0PQLwOPcsQxT3B';
const apiKeyPart2 = 'lbkFJb41wy6oMhnZQicxcxnBd';
const apiKey = apiKeyPart1 + apiKeyPart2;

const openai = new OpenAI({
    apiKey: apiKey,
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





const obtenerResumen = async (miembroId) => {
    const fechaActual = new Date();
    const primerDiaDelMes = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1);
    const ultimoDiaDelMes = new Date(fechaActual.getFullYear(), fechaActual.getMonth() + 1, 0);

    // Primer paso: Obtener los datos de la base de datos
    const query = `SELECT total_gastos, total_ingresos, datos FROM Reporte WHERE id_miembro = ? AND fecha BETWEEN ? AND ?`;
    
    let reporte;

    try {
        const [rows] = await pool.promise().query(query, [miembroId, primerDiaDelMes, ultimoDiaDelMes]);
        if (rows.length > 0) {
            reporte = rows[0];
        } else {
            console.log('No se encontró el reporte para el miembro:', miembroId);
            return null;
        }
    } catch (err) {
        console.error('Error al consultar la base de datos:', err);
        throw err;
    }

    // Preparar el prompt con los datos del reporte
    const prompt = `
    Quiero que me digas en una oracion recomendaciones sobre como usar mejor el dinero a partir de estos datos mensuales.
  
    gastos mensuales: ${reporte.total_gastos}
  
    ingresos mensuales: ${reporte.total_ingresos}
  
    division de gastos por tipos: ${reporte.datos}
    `;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                  role: "system",
                  content: "You are a helpful assistant."
                },
                {
                  role: "user",
                  content: prompt
                }
              ],
        });

        console.log(response.choices[0].message.content);
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error al obtener el resumen de OpenAI:', error);
        throw error;
    }
};





// Endpoint to receive email and return information
app.get('/reportesMiembro', async (req, res) => {
    const miembroId = req.header('id_miembro');
    console.log("miembroId en reportes");
    console.log(miembroId);

    if (!miembroId) {
        return res.status(400).json({ error: 'El id_miembro es requerido' });
    }

    const currentDate = new Date();
    const firstDayCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const firstDayPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const lastDayPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

    try {
        // Suponiendo que esta función realiza una llamada a la API de OpenAI y devuelve un resumen
        const nuevoResumen = await obtenerResumen(miembroId);

        // Actualizar el resumen en el reporte del mes actual
        const updateResumenQuery = `
            UPDATE Reporte
            SET resumen = ?
            WHERE id_miembro = ? AND fecha >= ? AND fecha <= ?`;

        pool.query(updateResumenQuery, [nuevoResumen, miembroId, firstDayCurrentMonth, lastDayCurrentMonth], (err, updateResult) => {
            if (err) {
                console.error('Error updating resumen:', err);
                return res.status(500).send('Error al actualizar el resumen');
            }

            // Continuar con la consulta original
            const query = `
                SELECT r.fecha, r.total_gastos, r.total_ingresos, r.resumen, r.datos 
                FROM Reporte r
                WHERE r.id_miembro = ? AND (
                    (r.fecha >= ? AND r.fecha <= ?) OR 
                    (r.fecha >= ? AND r.fecha <= ?)
                )`;

            pool.query(query, [miembroId, firstDayPreviousMonth, lastDayPreviousMonth, firstDayCurrentMonth, lastDayCurrentMonth], (err, results) => {
                if (err) {
                    console.error('Error performing query:', err);
                    return res.status(500).send('Internal Server Error');
                }

                res.json(results);
            });
        });
    } catch (error) {
        console.error('Error obtaining or updating resumen:', error);
        return res.status(500).send('Internal Server Error');
    }
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




// Function to clear the uploads directory
function clearUploadsDirectory() {
    fs.readdir(uploadsDirectory, (err, files) => {
      if (err) throw err;
  
      for (const file of files) {
        fs.unlink(`${uploadsDirectory}${file}`, err => {
          if (err) throw err;
        });
      }
    });
  }


function readPdf(pdfFilePath) {
    return new Promise((resolve, reject) => {
        let dataBuffer = fs.readFileSync(pdfFilePath);
        pdf(dataBuffer).then(data => {
            resolve(data.text);
        }).catch(error => {
            reject(error);
        });
    });
}


const obtenerMovimientosGPT = async (textoPDF) => {
    // Preparar el prompt con los datos del reporte
    const systemMessage = "Eres un contador financiero que registra los gastos e ingresos a partir de un estado de cuentas"


    const prompt = `
    Te voy a dar la conversion de pdf a texto de un estado de cuenta de una tarjeta de credito NU. quiero que para cada gasto o ingreso (pago de la tarjeta) mostrado en la cuenta me regreses ciertos valores en el siguiente formato. (no agregues el formato en tu respuesta):

    fecha (formato DD-MM-YYYY)%%%gasto/ingreso (escribir si se hizo un gasto o pago a la tarjeta si se hizo un pago escribe ingreso y si se hizo un gasto escribe gasto)%%%cantidad (solamente el numero sin comas pero si decimal)%%%nombre (no del usuario si no de la cuenta a la que se hizo el movimiento)%%%tipo

    SOLAMENTE HAY UNA CIERTA CANTIDAD DE TIPOS QUE PUEDES PONER ESOS SON:

    - Entretenimiento (videojuegos, subscripciones de cosas de ocio como steam o epic games)
    - Transporte (uber, gasolina, oxxo gas, etc.)
    - Varios (Ropa, accesorios, amazon, moneypool, transferencias, oxxo, o comercio electronico T, Office Depot)
    - Basicos (Cosas basicas para vivir, servicios de agua, Supermercado, luz, gas, etc.)
    - Restaurante (gastos en restaurantes como carls jr, r Trompo o dominos especialmente en Mr Trompo)

    Mr Trompo es restaurante y Comercio Electronico T de varios
    NO PUEDES AGREGAR MAS TIPOS DE LOS MENCIONADOS AQUI ARRIBA, SI ALGUNO NO SABES DONDE VA PONLO EN Varios


    NO PUEDES CAMBIAR EL ORDEN DEL FORMATO PASE LO QUE PASE
    El orden debe ser fecha%%%gasto/ingreso%%%cantidad%%%nombre%%%tipo

    Estado de cuenta:
    [
    ${textoPDF}
    ]
    `;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                  role: "system",
                  content: systemMessage
                },
                {
                  role: "user",
                  content: prompt
                }
              ],
            temperature: 0.2,
            max_tokens: 4096,
        });

        console.log(response.choices[0].message.content);
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error al obtener el resumen de OpenAI:', error);
        throw error;
    }
};



function insertarMovimiento({ id_miembro, fecha, gasto, cantidad, nombre_lugar, tipo }, callback) {

    const fechaMovimiento = new Date(fecha.split('-').reverse().join('-'));
    const fechaReporte = new Date(fechaMovimiento.getFullYear(), fechaMovimiento.getMonth(), 1);

    const insertMovimientoQuery = `
        INSERT INTO Movimientos (id_miembro, fecha, gasto, cantidad, nombre_lugar, tipo)
        VALUES (?, ?, ?, ?, ?, ?)`;

    pool.query(insertMovimientoQuery, [id_miembro, fechaMovimiento, gasto, cantidad, nombre_lugar, tipo], (err, movimientoResult) => {
        if (err) {
            console.error('Error inserting movimiento:', err);
            return callback(err, null);
        }

        const checkReporteQuery = `
            SELECT * FROM Reporte
            WHERE id_miembro = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?`;

        pool.query(checkReporteQuery, [id_miembro, fechaReporte.getMonth() + 1, fechaReporte.getFullYear()], (err, reportes) => {
            if (err) {
                console.error('Error chequeando reporte:', err);
                return callback(err, null);
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
                        return callback(err, null);
                    }
                });

                callback(null, 'Movimiento y reporte actualizados correctamente');
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
                        console.error('Error al insertar nuevo reporte ', err);
                        return callback(err, null);
                    }

                    callback(null, 'Movimiento añadido y nuevo reporte creado');
                });
            }
        });
    });
}



app.post('/movimientoPDF', upload.single('pdf'), async (req, res) => {
    console.log(req.file); // Uploaded file details
    // Optionally process the file here
    const pdfFilePath = `${uploadsDirectory}cuenta.pdf`;

    const { id_miembro } = req.body; // Extrae id_miembro del cuerpo de la solicitud

    // Verifica si el id_miembro está presente
    if (!id_miembro) {
        return res.status(400).send('El id_miembro es requerido.');
    }

    try {
        const pdfText = await readPdf(pdfFilePath);
        //console.log(pdfText); // Optionally do something with the text

        // Suponiendo que esta función realiza una llamada a la API de OpenAI y devuelve un resumen
        const datos = await obtenerMovimientosGPT(pdfText);

        // Parsea los datos para obtener cada línea como un movimiento
        const movimientos = datos.split('\n').filter(line => line.trim() !== ''); // Asegura que no hay líneas vacías

        for (const movimiento of movimientos) {
            // Separa los datos del movimiento
            const [fecha, tipoMov, cantidad, nombre_lugar, tipo] = movimiento.split('%%%');
            const gasto = tipoMov === 'gasto';

            // Aquí insertas cada movimiento en la base de datos
            await new Promise((resolve, reject) => {
                insertarMovimiento({ id_miembro, fecha, gasto, cantidad, nombre_lugar, tipo }, (err, result) => {
                    if (err) {
                        console.error('Error insertando movimiento:', err);
                        reject(err);
                    } else {
                        console.log(result);
                        resolve(result);
                    }
                });
            });
        }

        // Clear the directory after processing
        clearUploadsDirectory();

        res.send('PDF file uploaded and directory cleared successfully!');
    } catch (error) {
        console.error("Error processing PDF: ", error);
        res.status(500).send("Error processing PDF");
    }
});



app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});