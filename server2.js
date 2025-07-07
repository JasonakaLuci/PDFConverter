const favicon = require('serve-favicon');
const express = require('express');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 2000;

const uploadsPath = path.join(__dirname, 'uploads');
const logFile = path.join(__dirname, 'logs.txt');

// Function to delete all files in the uploads folder
function deleteFilesInUploads() {
  const now = new Date();
  const currentHour = now.getHours();

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

setInterval(deleteFilesInUploads, 3600 * 1000);

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static(__dirname));
app.use(favicon(path.join(__dirname, 'images', 'csv.ico')));

express.static.mime.define({'application/vnd.fdf': ['fdf']});

function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFile(logFile, `${timestamp}: ${message}\n`, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

app.post('/upload-csv', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    logToFile('No file uploaded.');
    return res.status(400).send('No file uploaded.');
  }

  const csvFilePath = req.file.path;
  logToFile(`Received file: ${req.file.originalname} at ${csvFilePath}`);

  const listClientsProcess = spawn('python', [
    path.join(__dirname, 'fdf_converter.py'),
    csvFilePath,
    'list_clients'
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

  logToFile(`Converting client ${clientIndex} from ${csvFilePath} to FDF in directory: ${uploadsPath}`);

  const convertProcess = spawn('python', [
    path.join(__dirname, 'fdf_converter.py'),
    csvFilePath,
    'convert_client',
    uploadsPath,
    clientIndex
  ]);

  let convertOutput = '';
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
        const fdf_filename = pythonResponse.fdf_filename;
        
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

app.post('/download-all-fdfs', (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    logToFile('Missing filename for bulk FDF conversion.');
    return res.status(400).send('Missing filename.');
  }

  const csvFilePath = path.join(uploadsPath, filename);
  if (!fs.existsSync(csvFilePath)) {
    logToFile(`CSV file not found for bulk conversion: ${csvFilePath}`);
    return res.status(404).send('CSV file not found.');
  }

  const zipFilename = `${path.parse(filename).name}_all_fdfs_${Date.now()}.zip`;
  const outputZipPath = path.join(uploadsPath, zipFilename);

  logToFile(`Starting bulk conversion and zipping for ${csvFilePath} to ${outputZipPath}`);

  const convertAllProcess = spawn('python', [
    path.join(__dirname, 'fdf_converter.py'),
    csvFilePath,
    'convert_all_to_zip',
    uploadsPath,
    outputZipPath
  ]);

  let pythonOutput = '';
  let errorOutput = '';

  convertAllProcess.stdout.on('data', (data) => {
    pythonOutput += data.toString();
  });

  convertAllProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
    logToFile(`Python script stderr (convert_all_to_zip): ${data.toString()}`);
  });

  convertAllProcess.on('close', (code) => {
    if (code === 0) {
      logToFile(`Successfully created zip: ${outputZipPath}`);
      res.json({ zip_filename: zipFilename }); 
    } else {
      logToFile(`Python script exited with code ${code} for convert_all_to_zip. Error: ${errorOutput}`);
      res.status(500).send('Error during bulk FDF conversion and zipping.');
    }
  });
});

app.post('/generate-empty-fdf', (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    logToFile('Missing filename for empty FDF generation.');
    return res.status(400).send('Missing filename.');
  }

  const csvFilePath = path.join(uploadsPath, filename);
  if (!fs.existsSync(csvFilePath)) {
    logToFile(`CSV file not found for empty FDF generation: ${csvFilePath}`);
    return res.status(404).send('CSV file not found.');
  }

  logToFile(`Generating empty FDF template from ${csvFilePath}`);

  const emptyFdfProcess = spawn('python', [
    path.join(__dirname, 'fdf_converter.py'),
    csvFilePath,
    'generate_empty_fdf',
    uploadsPath
  ]);

  let pythonOutput = '';
  let errorOutput = '';

  emptyFdfProcess.stdout.on('data', (data) => {
    pythonOutput += data.toString();
  });

  emptyFdfProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
    logToFile(`Python script stderr (generate_empty_fdf): ${data.toString()}`);
  });

  emptyFdfProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const pythonResponse = JSON.parse(pythonOutput.trim());
        const fdf_filename = pythonResponse.fdf_filename;
        
        if (fdf_filename) {
          logToFile(`Successfully created empty FDF: ${fdf_filename}`);
          res.json({ fdf_filename: fdf_filename });
        } else {
          throw new Error("Python did not return an FDF filename for the empty template.");
        }
      } catch (parseError) {
        logToFile(`Error parsing Python empty FDF output JSON: ${parseError.message}. Raw output: ${pythonOutput}`);
        res.status(500).send('Error parsing empty FDF filename from Python script.');
      }
    } else {
      logToFile(`Python script exited with code ${code} for generate_empty_fdf. Error: ${errorOutput}`);
      res.status(500).send('Error generating empty FDF template.');
    }
  });
});


app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    const mimeType = path.extname(req.params.filename).toLowerCase() === '.fdf' ? 'application/vnd.fdf' : 'application/zip';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);

    res.download(filePath, req.params.filename, (err) => {
      if (err) {
        logToFile(`Error serving file: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).send('Error serving file.');
        }
      } else {
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
  deleteFilesInUploads();
});