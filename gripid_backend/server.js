const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs'); 
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB Error:', err));

// Schema
const DeviceSchema = new mongoose.Schema({
  sn_no: String,
  imei_1: String,
  imei_2: String,
  current_status: String,
  history: [{
    status: String,
    date: { type: Date, default: Date.now },
    note: String
  }]
});
const Device = mongoose.model('Device', DeviceSchema);

// --- API ROUTES ---

// GET All Devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ _id: -1 });
    res.json(devices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET Single Device History (Improved Search)
app.get('/api/devices/:sn/history', async (req, res) => {
  try {
    const rawSn = req.params.sn.trim(); // Remove spaces from URL param

    // 1. Search using a Case-Insensitive Regex
    // This finds "gripid123", "GRIPID123", or "GripID123"
    const device = await Device.findOne({ 
      sn_no: { $regex: new RegExp(`^${rawSn}$`, 'i') } 
    });

    if (!device) {
      console.log(`Device not found for SN: ${rawSn}`);
      return res.json([]); // Return empty array if not found
    }

    res.json(device.history);
  } catch (err) {
    console.error("History Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// POST New Device
app.post('/api/devices', async (req, res) => {
  try {
    const { sn_no, imei_1, imei_2, status, note } = req.body;
    const newDevice = new Device({
      sn_no, imei_1, imei_2, current_status: status,
      history: [{ status, note }]
    });
    await newDevice.save();
    res.json(newDevice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT Update Device (FIXED: Saves Notes Correctly)
app.put('/api/devices/:id', async (req, res) => {
  try {
    const { status, note, ...otherData } = req.body;
    
    // Create the history entry
    const newHistoryItem = {
      status: status,
      note: note || '', // Ensure note is saved
      date: new Date()
    };

    const updatedDevice = await Device.findByIdAndUpdate(
      req.params.id,
      {
        ...otherData,
        current_status: status,
        $push: { history: newHistoryItem } // Push to history array
      },
      { new: true } // Return updated doc immediately
    );

    res.json(updatedDevice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- PRODUCTION SERVING CONFIGURATION ---
if (process.env.NODE_ENV === 'production') {
  // 1. Define Root Path
  const frontendRoot = path.join(__dirname, '../gripid_device_tracker');
  
  // 2. Auto-Detect 'dist' vs 'build'
  let frontendPath = path.join(frontendRoot, 'dist');
  if (!fs.existsSync(frontendPath)) {
    console.log("Could not find 'dist', looking for 'build'...");
    frontendPath = path.join(frontendRoot, 'build');
  }

  console.log(`Serving static files from: ${frontendPath}`);
  
  // 3. Serve Static Files
  app.use(express.static(frontendPath));

  // 4. Catch-All Route (Using Regex to bypass Express 5 strictness)
  app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));