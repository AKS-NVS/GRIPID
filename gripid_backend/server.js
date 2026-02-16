const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const xlsx = require('xlsx'); // Required for Excel
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

// 1. Device Schema
const DeviceSchema = new mongoose.Schema({
  sn_no: String,
  imei_1: String,
  imei_2: String,
  current_status: String
});
const Device = mongoose.model('Device', DeviceSchema);

// 2. History Schema
const HistorySchema = new mongoose.Schema({
  device_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  sn_no: String,
  status: String,
  note: String,
  date: { type: Date, default: Date.now }
}, { collection: 'histories' }); 

const History = mongoose.model('History', HistorySchema);

// --- API ROUTES ---

// GET All Devices (With Pagination)
app.get('/api/devices', async (req, res) => {
  try {
    // 1. Get page number from URL (default to 1)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // 50 items per page
    const skip = (page - 1) * limit;

    // 2. Fetch specific chunk
    const devices = await Device.find()
      .sort({ _id: -1 }) // Newest first
      .skip(skip)
      .limit(limit);

    // 3. Count total for "Page 1 of X" calculation
    const total = await Device.countDocuments();

    // 4. Return structured response
    res.json({
      data: devices,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalDevices: total
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET Single Device History
app.get('/api/devices/:sn/history', async (req, res) => {
  try {
    const rawSn = req.params.sn.trim();
    const logs = await History.find({ 
      sn_no: { $regex: new RegExp(`^${rawSn}$`, 'i') } 
    }).sort({ date: -1 });

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST New Device (Manual Entry - Checks Duplicates)
app.post('/api/devices', async (req, res) => {
  try {
    const { sn_no, imei_1, imei_2, status, note } = req.body;
    
    // 1. Check if SN already exists
    const existing = await Device.findOne({ sn_no: sn_no });
    if (existing) {
      return res.status(400).json({ message: "A device with this Serial Number already exists!" });
    }

    // 2. Create Device
    const newDevice = new Device({
      sn_no, imei_1, imei_2, current_status: status
    });
    const savedDevice = await newDevice.save();

    // 3. Create Initial History Entry
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

// PUT Update Device
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
        sn_no: updatedDevice.sn_no, 
        status: status,
        note: note || '',
        date: new Date()
      });
      await newHistory.save();
    }

    res.json(updatedDevice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- EXCEL UPLOAD ROUTE ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // 1. Read Excel File
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; 
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let addedCount = 0;
    let skippedCount = 0;
    const logs = [];

    // 2. Loop through every row
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];

      // Flexible Column Names
      const sn = (row.sn_no || row.SN || row.Serial || row.sn || "").toString().trim();
      const imei1 = (row.imei_1 || row.IMEI1 || row.imei1 || "").toString().trim();
      const imei2 = (row.imei_2 || row.IMEI2 || row.imei2 || "").toString().trim();
      const status = row.status || row.Status || "In Stock";
      const note = row.note || row.Note || "Imported from Excel";

      if (!sn) {
        logs.push({ row: i + 2, status: "Failed", reason: "Missing Serial Number" });
        continue;
      }

      // 3. BUILD DUPLICATE CHECK QUERY
      const duplicateConditions = [{ sn_no: sn }];
      if (imei1) duplicateConditions.push({ imei_1: imei1 });
      if (imei2) duplicateConditions.push({ imei_2: imei2 });

      const existingDevice = await Device.findOne({ $or: duplicateConditions });

      if (existingDevice) {
        skippedCount++;
        let reason = "Duplicate Data";
        if (existingDevice.sn_no === sn) reason = "SN already exists";
        else reason = "IMEI already exists";
        
        logs.push({ row: i + 2, sn: sn, status: "Skipped", reason: reason });
      } else {
        // 4. ADD NEW DEVICE
        const newDevice = new Device({ sn_no: sn, imei_1: imei1, imei_2: imei2, current_status: status });
        const saved = await newDevice.save();
        
        // 5. ADD HISTORY ENTRY
        const hist = new History({
          device_id: saved._id,
          sn_no: sn,
          status: status,
          note: note,
          date: new Date()
        });
        await hist.save();

        addedCount++;
        logs.push({ row: i + 2, sn: sn, status: "Success", reason: "Added" });
      }
    }

    // 6. Delete the temp file
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: "Import Complete", 
      added: addedCount, 
      skipped: skippedCount, 
      logs: logs 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// --- EXCEL EXPORT ROUTE ---
app.get('/api/export', async (req, res) => {
  try {
    const devices = await Device.find().sort({ _id: -1 });

    const data = devices.map(d => ({
      "SN": d.sn_no,
      "IMEI 1": d.imei_1,
      "IMEI 2": d.imei_2,
      "Status": d.current_status,
      "Added On": d._id.getTimestamp() 
    }));

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Inventory");

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="GripID_Inventory.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).send("Export failed");
  }
});

// --- PRODUCTION SERVING ---
if (process.env.NODE_ENV === 'production') {
  const frontendRoot = path.join(__dirname, '../gripid_device_tracker');
  let frontendPath = path.join(frontendRoot, 'dist');
  
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