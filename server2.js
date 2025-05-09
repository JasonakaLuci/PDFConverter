const favicon = require('serve-favicon');
const express = require('express');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 3000;
const uploadsPath = path.join(__dirname, 'uploads'); // This is the global uploadsPath
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

// Schedule the deletion check to run every hour
setInterval(deleteFilesInUploads, 3600 * 1000); // Every hour

// Ensure the 'uploads' directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    // Use a unique filename for each upload
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files (like index.html) from the current directory
app.use(express.static(__dirname));

// Explicitly define MIME type for FDF
express.static.mime.define({'application/vnd.fdf': ['fdf']});


// Function to log messages to a file
function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFile(logFile, `${timestamp}: ${message}\n`, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

// Favicon (optional)
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// Endpoint to upload CSV and list clients
app.post('/upload-csv', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    logToFile('No file uploaded.');
    return res.status(400).send('No file uploaded.');
  }

  const csvFilePath = req.file.path;
  logToFile(`Received file: ${req.file.originalname} at ${csvFilePath}`);

  const listClientsProcess = spawn('python', [
    path.join(__dirname, 'fdf_converter.py'), // Path to your Python script
    csvFilePath,
    'list_clients' // New command to list clients
  ]);

  let clientsOutput = '';
  let errorOutput = '';

  listClientsProcess.stdout.on('data', (data) => {
    clientsOutput += data.toString();
  });

  listClientsProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
    logToFile(`Python script stderr (list_clients): ${data.toString()}`);
  });

  listClientsProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const clients = JSON.parse(clientsOutput.trim());
        logToFile(`Successfully listed clients from ${req.file.originalname}.`);
        res.json({ filename: req.file.filename, clients: clients });
      } catch (parseError) {
        logToFile(`Error parsing client list JSON: ${parseError.message}. Raw output: ${clientsOutput}`);
        res.status(500).send('Error parsing client list from Python script.');
      }
    } else {
      logToFile(`Python script exited with code ${code} for list_clients. Error: ${errorOutput}`);
      res.status(500).send('Error processing CSV file for client listing.');
    }
  });
});

// Endpoint to convert selected client to FDF
app.post('/convert-fdf', (req, res) => {
  const { filename, clientIndex } = req.body;

  if (!filename || clientIndex === undefined) {
    logToFile('Missing filename or client index for FDF conversion.');
    return res.status(400).send('Missing filename or client index.');
  }

  const csvFilePath = path.join(uploadsPath, filename);
  if (!fs.existsSync(csvFilePath)) {
    logToFile(`CSV file not found for conversion: ${csvFilePath}`);
    return res.status(404).send('CSV file not found.');
  }

  // Use the already defined global uploadsPath for the output directory
  // No need for a new 'const outputDir = uploadsPath;' here
  logToFile(`Converting client ${clientIndex} from ${csvFilePath} to FDF in directory: ${uploadsPath}`);

  const convertProcess = spawn('python', [
    path.join(__dirname, 'fdf_converter.py'), // sys.argv[0] (script name)
    csvFilePath,                             // sys.argv[1] (<input_csv_path>)
    'convert_client',                        // sys.argv[2] (command: 'convert_client')
    uploadsPath,                             // sys.argv[3] (output_dir) <-- USE GLOBAL uploadsPath HERE
    clientIndex                              // sys.argv[4] (<client_index>)
  ]);

  let convertOutput = ''; // To capture JSON from Python
  let convertErrorOutput = '';

  convertProcess.stdout.on('data', (data) => {
    convertOutput += data.toString();
  });

  convertProcess.stderr.on('data', (data) => {
    convertErrorOutput += data.toString();
    logToFile(`Python script stderr (convert_client): ${data.toString()}`);
  });

  convertProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const pythonResponse = JSON.parse(convertOutput.trim());
        const fdf_filename = pythonResponse.fdf_filename; // Get the filename from Python's JSON output
        
        if (fdf_filename) {
          logToFile(`Successfully converted client ${clientIndex} to FDF: ${fdf_filename}`);
          res.json({ fdf_filename: fdf_filename });
        } else {
          throw new Error("Python did not return an FDF filename.");
        }
      } catch (parseError) {
        logToFile(`Error parsing Python conversion output JSON: ${parseError.message}. Raw output: ${convertOutput}`);
        res.status(500).send('Error parsing FDF filename from Python script.');
      }
    } else {
      logToFile(`Python script exited with code ${code} for convert_client. Error: ${convertErrorOutput}`);
      res.status(500).send('Error converting selected client to FDF.');
    }
  });
});


// Serve and delete the file after it has been accessed
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  // Check if the file exists
  if (fs.existsSync(filePath)) {
    // Ensure the correct MIME type is set.
    res.setHeader('Content-Type', 'application/vnd.fdf'); // Explicit FDF MIME type
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`); // Suggests filename to browser

    res.download(filePath, req.params.filename, (err) => { // req.params.filename as second arg suggests name
      if (err) {
        logToFile(`Error serving file: ${err.message}`);
        // If headers were already sent, we can't send a new response
        if (!res.headersSent) {
          res.status(500).send('Error serving file.');
        }
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
    logToFile(`File ${filePath} not found for download.`);
    res.status(404).send('File not found.');
  }
});

app.listen(PORT, () => {
  logToFile(`Server running on port ${PORT}`);
  console.log(`Server running on http://localhost:${PORT}`);
  // Initial cleanup on server start
  deleteFilesInUploads();
});