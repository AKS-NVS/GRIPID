const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Database Schemas
const deviceSchema = new mongoose.Schema({
  sn_no: { type: String, unique: true },
  imei_1: String,
  imei_2: String,
  current_status: String, // This is your Location field
  model_type: String
});

const historySchema = new mongoose.Schema({
  sn_no: String,
  date: { type: Date, default: Date.now },
  status: String, // Location at the time of update
  note: String
});

const Device = mongoose.model('Device', deviceSchema);
const History = mongoose.model('History', historySchema);

// --- API ROUTES ---

// Get all devices
app.get('/api/devices', async (req, res) => {
  const devices = await Device.find();
  res.json(devices);
});

// Get history for a specific device
app.get('/api/devices/:sn/history', async (req, res) => {
  const history = await History.find({ sn_no: req.params.sn }).sort({ date: -1 });
  res.json(history);
});

// Add or Update Device
app.post('/api/devices', async (req, res) => {
  const { sn_no, imei_1, imei_2, status, note } = req.body;
  try {
    const device = await Device.findOneAndUpdate(
      { sn_no },
      { imei_1, imei_2, current_status: status, model_type: sn_no.includes('V6') ? 'V6' : 'FAP20' },
      { upsert: true, new: true }
    );
    // Log change to history
    await History.create({ sn_no, status, note });
    res.json(device);
  } catch (err) { res.status(500).json(err); }
});

// Delete Device and its history
app.delete('/api/devices/:id', async (req, res) => {
  const device = await Device.findByIdAndDelete(req.params.id);
  if (device) await History.deleteMany({ sn_no: device.sn_no });
  res.json({ message: "Deleted successfully" });
});

// Excel Import Logic (Status column only as Location)
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    for (const row of data) {
      const sn = row['SN NO'];
      const loc = row['Status 16/12/25'] || 'Imported';
      await Device.findOneAndUpdate(
        { sn_no: sn },
        { imei_1: row['IMEI 1'], imei_2: row['IMEI 2'], current_status: loc },
        { upsert: true }
      );
    }
    res.json({ message: "Import Successful" });
  } catch (err) { res.status(500).json(err); }
});

// --- PRODUCTION SERVING ---
if (process.env.NODE_ENV === 'production') {
  // Static path to frontend build (adjust based on folder structure)
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));

app.get('/:path*', (req, res) => {
  res.sendFile(path.resolve(frontendPath, 'index.html'));
});
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));