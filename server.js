const favicon = require('serve-favicon');
const express = require('express');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 3000;
const uploadsPath = path.join(__dirname, 'uploads');
// Create a writable log file
const logFile = path.join(__dirname, 'logs.txt');

// Function to delete all files in the uploads folder
function deleteFilesInUploads() {
  const now = new Date();
  const currentHour = now.getHours();

  // Check if the current time is within working hours (8 AM to 6 PM)
  if (currentHour >= 8 && currentHour <= 18) {
    logToFile(`Deletion check at ${now.toISOString()}: Within working hours. Deleting files.`);

    fs.readdir(uploadsPath, (err, files) => {
      if (err) {
        logToFile(`Error reading uploads folder: ${err.message}`);
        return;
      }

      files.forEach((file) => {
        const filePath = path.join(uploadsPath, file);
        fs.unlink(filePath, (err) => {
          if (err) {
            logToFile(`Error deleting file ${file}: ${err.message}`);
          } else {
            logToFile(`Deleted file: ${file}`);
          }
        });
      });
    });
  } else {
    logToFile(`Deletion check at ${now.toISOString()}: Outside working hours. Skipping deletion.`);
  }
}

// Schedule the cleanup task to run every hour on the hour
const ONE_HOUR = 60 * 60 * 1000;
setInterval(deleteFilesInUploads, ONE_HOUR);

// Function to write logs to the file
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

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

// Optionally, run the cleanup function once when the server starts
deleteFilesInUploads();

// Serve static files and favicon
app.use(express.static(path.join(__dirname, 'images'))); // Serve images folder
app.use(favicon(path.join(__dirname, 'images', 'staff_icon.ico'))); // Ensure favicon is in the "images" folder

// Serve the root page with a basic form
// Serve the root page with a basic form
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/x-icon" href="/pdf.ico">
        <title>PDF Converter</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f9;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 1000px;
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
                text-align: left;
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
            #loading {
                display: none;
                margin-top: 20px;
                font-size: 18px;
                color: #007BFF;
            }
            #error {
                display: none;
                margin-top: 20px;
                font-size: 18px;
                color: red;
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
            <div style="text-align: center;">
            <div style="display: inline-block; text-align: left;">
            <p class="remark">Remarks:<br>
            1.Upload file and convert pdf text to unselectable<br>
            2.Usage: Click Choose file, upload file and Click Upload and Convert<br>
            3.If the download bar shows "Insecure download blocked", click "keep".<br>
            4.Version 02/25: Files with Japanese name bug now fixed</p>
            </div>
            </div>
            <form id="uploadForm" action="/upload" method="POST" enctype="multipart/form-data">
                <input type="file" name="pdf" accept="application/pdf" required>
                <br>
                <button type="submit">Upload and Convert</button>
            </form>
            <div id="loading">Uploading and converting your files... Please wait.</div>
            <div id="error">Something went wrong. Please check your internet connection or try again later.</div>
        </div>
        <div style="text-align: center;">
        <footer>
            &copy; ${new Date().getFullYear()} Adminasia Ltd. All Rights Reserved.
        </footer>
        </div>
        <script>
            const form = document.getElementById('uploadForm');
            const loadingIndicator = document.getElementById('loading');
            const errorIndicator = document.getElementById('error');

            form.addEventListener('submit', (event) => {
                event.preventDefault(); // Prevent default form submission
                loadingIndicator.style.display = 'block'; // Show the loading message
                errorIndicator.style.display = 'none'; // Hide the error message

                const formData = new FormData(form);

                // Set a timeout for the request (e.g., 30 seconds)
                const timeout = setTimeout(() => {
                    loadingIndicator.style.display = 'none';
                    errorIndicator.style.display = 'block';
                }, 30000); // 30 seconds

                fetch('/upload', {
                    method: 'POST',
                    body: formData
                })
                .then((response) => {
                    clearTimeout(timeout); 
                    if (!response.ok) {
                        return response.text().then(text => {
                            let serverMessage = text;
                            try {
                                const errJson = JSON.parse(text);
                                serverMessage = errJson.message || errJson.error || text;
                            } catch (e) {
                                // If not JSON or parsing fails, use the raw text
                            }
                            // ESCAPE client-side template literals
                            throw new Error(\`Server error: \${response.status} \${response.statusText}. \${serverMessage}\`);
                        });
                    }

                    const contentDisposition = response.headers.get('Content-Disposition');
                    // *** Default filename with .pdf extension ***
                    let filenameToUse = 'converted_output.pdf'; 

                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
                        if (filenameMatch && filenameMatch.length > 1 && filenameMatch[1]) {
                            filenameToUse = filenameMatch[1];
                        }
                    } else {
                        const originalNameHeader = response.headers.get('X-Original-File-Name');
                        if (originalNameHeader) {
                            const baseOriginalName = originalNameHeader.includes('.') ? originalNameHeader.substring(0, originalNameHeader.lastIndexOf('.')) : originalNameHeader;
                            // ESCAPE client-side template literals AND use .pdf extension
                            filenameToUse = \`\${baseOriginalName}_converted.pdf\`;
                        }
                    }
                    
                    return response.blob().then(blob => ({ blob, filename: filenameToUse }));
                })
                .then(({ blob, filename }) => {
                    loadingIndicator.style.display = 'none';
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = filename; // Use the filename determined from the server's response
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a); 
                })
                .catch((error) => {
                    clearTimeout(timeout); 
                    loadingIndicator.style.display = 'none';
                    // ESCAPE client-side template literal for error message display
                    errorIndicator.textContent = \`Upload Failed: \${error.message}\`; 
                    errorIndicator.style.display = 'block';
                    console.error('Fetch Error (pdf_converter.js):', error);
                });
            });
        </script>
    </body>
    </html>
  `);
});
// Endpoint to upload and process multiple PDFs
// Endpoint to upload and process a single PDF
app.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded!');
  }

  // Process the uploaded file
  const processFile = (file) => {
    return new Promise((resolve, reject) => {
        const filePath = file.path;
        const outputFileName = `converted_${Date.now()}_${Math.round(Math.random() * 1E9)}.pdf`;
        const outputPath = path.join(__dirname, '/uploads/', outputFileName);

        // Explicitly set the Python command
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

        // Call the Python script using spawn
        const pythonProcess = spawn(pythonCommand, ['pdf_converter.py', filePath, outputPath], {
            stdio: 'pipe', // Use 'pipe' to capture stdout and stderr
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' } // Ensure UTF-8 encoding
        });

        // Check if the process failed to spawn
        if (!pythonProcess) {
            reject(new Error('Failed to spawn Python process.'));
            return;
        }

        // Capture Python script output
        pythonProcess.stdout.on('data', (data) => {
            logToFile(`Python script output for ${file.filename}: ${data.toString()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            logToFile(`Python script error for ${file.filename}: ${data.toString()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath); // Successfully processed
            } else {
                logToFile(`Python script failed for ${file.filename} with exit code ${code}`);
                reject(new Error(`Python script failed for file ${file.filename}`));
            }
        });

        pythonProcess.on('error', (err) => {
            logToFile(`Error spawning Python process: ${err.message}`);
            reject(new Error('Error spawning Python process.'));
        });
    });
};

  // Process the file and send the response
  const processUploadedFile = async () => {
    try {
      if (!req.file) {
        logToFile('processUploadedFile: No file available in req.file.');
        if (!res.headersSent) {
            return res.status(400).send('No file uploaded or file processing failed early.');
        }
        return;
      }

      // 1. Call your existing processFile function (which runs pdf_converter.py)
      const convertedFilePath = await processFile(req.file); // This is the path to the converted .pdf file

      // 2. Determine the desired download filename
      const originalFileName = req.file.originalname; // e.g., "mydocument.pdf"
      const baseName = path.parse(originalFileName).name; // e.g., "mydocument"
      // *** Ensure the extension is .pdf as requested ***
      const downloadFileName = `${baseName}_converted.pdf`; // e.g., "mydocument_converted.pdf"

      // (Optional but good practice) Set X-Original-File-Name header
      res.setHeader('X-Original-File-Name', originalFileName);

      // 3. Send the file for download with the new filename
      res.download(convertedFilePath, downloadFileName, (err) => {
        if (err) {
          logToFile(`Error sending file "${downloadFileName}" for download: ${err.message}`);
        } else {
          logToFile(`File "${downloadFileName}" sent successfully to the client.`);
        }
        // Clean up the server-side temporary file after download attempt
        fs.unlink(convertedFilePath, (unlinkErr) => {
          if (unlinkErr) {
            logToFile(`Error deleting server-side temp file ${convertedFilePath}: ${unlinkErr.message}`);
          } else {
            logToFile(`Server-side temp file ${convertedFilePath} deleted successfully.`);
          }
        });
      });
    } catch (err) {
      logToFile(`Error in processUploadedFile (pdf_converter.js): ${err.message}`);
      if (!res.headersSent) {
        res.status(500).send('Error processing file.');
      }
    }
  };
  processUploadedFile();
});
// Serve and delete the file after it has been accessed
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '/uploads/', req.params.filename);
  
  // Check if the file exists
  if (fs.existsSync(filePath)) {
    res.download(filePath, (err) => {
      if (err) {
        logToFile(`Error serving file: ${err.message}`);
      } else {
        // Delete the file after serving
        fs.unlink(filePath, (err) => {
          if (err) {
            logToFile(`Error deleting file: ${err.message}`);
          } else {
            logToFile(`File ${filePath} deleted successfully.`);
          }
        });
      }
    });
  } else {
    logToFile(`File ${filePath} `);
    res.status(404).send('File not found!');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  logToFile(`Server started on port ${PORT}`);
});