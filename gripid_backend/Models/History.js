const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
  device_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  sn_no: String, // Kept for easy searching
  date: { type: Date, default: Date.now },
  status: String,
  note: String
});

module.exports = mongoose.model('History', HistorySchema);