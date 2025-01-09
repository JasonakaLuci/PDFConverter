const favicon = require('serve-favicon');
const express = require('express');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Storage configuration for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '/uploads/');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  }
});

app.use(express.static(path.join(__dirname, 'images')));
app.use(favicon('staff_icon.ico'));

// Serve the root page with a basic form
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/x-icon" href="staff_icon.ico">
        <title>PDF Converter</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f9;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 800px;
                margin: 50px auto;
                text-align: center;
                padding: 20px;
                background: #fff;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            .logo {
                margin-bottom: 20px;
            }
            .logo img {
                width: 217px;
                height: 81.7px;
            }
            h1 {
                font-size: 36px;
                color: #333;
            }
            p.remark {
                margin: 10px 0 30px;
                font-size: 18px;
                color: #666;
            }
            form {
                margin-top: 20px;
            }
            input[type="file"] {
                margin-bottom: 20px;
            }
            button {
                background-color: #007BFF;
                color: white;
                font-size: 16px;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            }
            button:hover {
                background-color: #0056b3;
            }
            footer {
                margin-top: 30px;
                font-size: 14px;
                color: #aaa;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">
                <a href="https://www.adminasialtd.com/landingpage">
                    <img src="Adminasia.png" alt="Adminasia Logo">
                </a>
            </div>
            <h1>PDF Converter</h1>
            <p class="remark">Convert PDF Files to unselectable text</p>
            <form action="/upload" method="POST" enctype="multipart/form-data">
                <input type="file" name="pdfs" accept="application/pdf" multiple required>
                <br>
                <button type="submit">Upload and Convert</button>
            </form>
        </div>
        <footer>
            &copy; ${new Date().getFullYear()} Adminasia Ltd. All Rights Reserved.
        </footer>
    </body>
    </html>
  `);
});

// Endpoint to upload and process multiple PDFs
app.post('/upload', upload.array('pdfs', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded!');
  }

  const convertedFiles = [];

  // Process each uploaded file
  const processFile = (file) => {
    return new Promise((resolve, reject) => {
      const filePath = file.path;
      const outputFileName = `converted_${Date.now()}_${Math.round(Math.random() * 1E9)}.pdf`;
      const outputPath = path.join(__dirname, '/uploads/', outputFileName);

      // Call Python script using subprocess
      const pythonProcess = spawn('python', ['pdf_converter.py', filePath, outputPath]);

      pythonProcess.stdout.on('data', (data) => {
        console.log(`Python script output for ${file.filename}: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python script error for ${file.filename}: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          convertedFiles.push({
            original: file.filename,
            converted: outputFileName,
            link: `http://localhost:${PORT}/download/${outputFileName}`,
          });
          resolve();
        } else {
          reject(new Error(`Python script failed for file ${file.filename}`));
        }
      });
    });
  };

  // Process all files concurrently
  const processFiles = async () => {
    try {
      await Promise.all(req.files.map((file) => processFile(file)));
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Conversion Success</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f9;
                    margin: 0;
                    padding: 0;
                }
                .container {
                    max-width: 800px;
                    margin: 50px auto;
                    text-align: center;
                    padding: 20px;
                    background: #fff;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    font-size: 36px;
                    color: #333;
                }
                ul {
                    list-style: none;
                    padding: 0;
                }
                li {
                    margin: 10px 0;
                    font-size: 18px;
                }
                a {
                    color: #007BFF;
                    text-decoration: none;
                }
                a:hover {
                    text-decoration: underline;
                }
                button {
                    margin-top: 20px;
                    background-color: #007BFF;
                    color: white;
                    font-size: 16px;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                }
                button:hover {
                    background-color: #0056b3;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Files Converted Successfully!</h1>
                <ul>
                  ${convertedFiles.map((file) => `
                    <li>
                      <strong>${file.original}</strong> - 
                      <a href="${file.link}" target="_blank">Download Converted File</a>
                    </li>
                  `).join('')}
                </ul>
                <a href="/" style="display: block; margin-top: 20px;">Convert More PDFs</a>
            </div>
        </body>
        </html>
      `);
    } catch (err) {
      console.error('Error processing files:', err);
      res.status(500).send('Error processing files.');
    }
  };

  processFiles();
});

// Serve and delete the file after it has been accessed
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '/uploads/', req.params.filename);
  
  // Check if the file exists
  if (fs.existsSync(filePath)) {
    res.download(filePath, (err) => {
      if (err) {
        console.error("Error serving file:", err);
      } else {
        // Delete the file after serving
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error("Error deleting file:", err);
          } else {
            console.log(`File ${filePath} deleted successfully.`);
          }
        });
      }
    });
  } else {
    res.status(404).send('File not found!');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});