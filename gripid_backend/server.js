const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
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

// --- SCHEMAS ---

// 1. Device Schema (Keeps only current status)
const DeviceSchema = new mongoose.Schema({
  sn_no: String,
  imei_1: String,
  imei_2: String,
  current_status: String
  // Removed 'history' array because you use a separate collection
});
const Device = mongoose.model('Device', DeviceSchema);

// 2. History Schema (Connects to your existing 'histories' collection)
const HistorySchema = new mongoose.Schema({
  device_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  sn_no: String,
  status: String,
  note: String,
  date: { type: Date, default: Date.now }
}, { collection: 'histories' }); // <--- CRITICAL: Links to your specific collection name

const History = mongoose.model('History', HistorySchema);

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

// GET Single Device History (Reads from 'histories' collection)
app.get('/api/devices/:sn/history', async (req, res) => {
  try {
    const rawSn = req.params.sn.trim();
    
    // Search the 'histories' collection for this SN (Case Insensitive)
    const logs = await History.find({ 
      sn_no: { $regex: new RegExp(`^${rawSn}$`, 'i') } 
    }).sort({ date: -1 }); // Show newest first

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST New Device
app.post('/api/devices', async (req, res) => {
  try {
    const { sn_no, imei_1, imei_2, status, note } = req.body;
    
    // 1. Create Device
    const newDevice = new Device({
      sn_no, imei_1, imei_2, current_status: status
    });
    const savedDevice = await newDevice.save();

    // 2. Create Initial History Entry in separate collection
    const firstHistory = new History({
      device_id: savedDevice._id,
      sn_no: sn_no,
      status: status,
      note: note || 'Initial Entry',
      date: new Date()
    });
    await firstHistory.save();

    res.json(savedDevice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT Update Device (Updates Device + Adds to History Collection)
app.put('/api/devices/:id', async (req, res) => {
  try {
    const { status, note, sn_no, ...otherData } = req.body;

    // 1. Update the Main Device Card
    const updatedDevice = await Device.findByIdAndUpdate(
      req.params.id,
      { ...otherData, current_status: status },
      { new: true }
    );

    // 2. Create a NEW Document in 'histories' collection
    if (updatedDevice) {
      const newHistory = new History({
        device_id: updatedDevice._id,
        sn_no: updatedDevice.sn_no, // Use the SN from the device to ensure linking
        status: status,
        note: note || '',
        date: new Date()
      });
      await newHistory.save();
    }

    // 3. Return the device (Frontend will fetch history separately)
    res.json(updatedDevice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- PRODUCTION SERVING ---
if (process.env.NODE_ENV === 'production') {
  const frontendRoot = path.join(__dirname, '../gripid_device_tracker');
  let frontendPath = path.join(frontendRoot, 'dist');
  
  // Auto-detect folder name
  if (!fs.existsSync(frontendPath)) {
    frontendPath = path.join(frontendRoot, 'build');
  }

  console.log(`Serving static files from: ${frontendPath}`);
  app.use(express.static(frontendPath));

  app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(frontendPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));