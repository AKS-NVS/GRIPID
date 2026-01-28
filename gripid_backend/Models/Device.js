const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  sn_no: { type: String, required: true, unique: true },
  imei_1: String,
  imei_2: String,
  model_type: String, // V6 or FAP20
  current_status: String,
}, { timestamps: true });

module.exports = mongoose.model('Device', DeviceSchema);