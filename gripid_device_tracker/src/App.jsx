import React, { useState, useEffect, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './App.css';

function App() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState("");
  const [isScanningSearch, setIsScanningSearch] = useState(false);
  const [isScanningAutoFill, setIsScanningAutoFill] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ 
    sn_no: '', imei_1: '', imei_2: '', status: '', note: '' 
  });

  // UPDATED: Use relative path '/api/devices'
  const loadDevices = useCallback(() => {
    fetch('/api/devices')
      .then(res => res.json())
      .then(data => setDevices(Array.isArray(data) ? data : []))
      .catch(err => console.error("Fetch error:", err));
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // UPDATED: Removed localhost for history fetch
  const loadHistory = (sn) => {
    fetch(`/api/devices/${sn}/history`)
      .then(res => res.json())
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(err => console.error("History fetch error:", err));
  };

  // One-Shot Search Scanner
  const scanForSearch = () => {
    setIsScanningSearch(true);
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner("search-reader", { fps: 10, qrbox: 250 });
      scanner.render((text) => {
        setSearch(text.trim().toUpperCase());
        scanner.clear();
        setIsScanningSearch(false);
      }, () => {});
    }, 100);
  };

  // Sticky Registration Scanner
  const toggleAutoFillScanner = () => {
    setIsScanningAutoFill(!isScanningAutoFill);
    if (!isScanningAutoFill) {
      setTimeout(() => {
        const scanner = new Html5QrcodeScanner("form-reader", { fps: 20, qrbox: { width: 250, height: 150 } });
        scanner.render((text) => {
          const cleanText = text.trim().toUpperCase();
          if (cleanText.startsWith("GRIPID")) setFormData(p => ({ ...p, sn_no: cleanText }));
          else if (/^\d{15}$/.test(cleanText)) {
            setFormData(p => {
              if (!p.imei_1) return { ...p, imei_1: cleanText };
             if (p.imei_1 !== cleanText) return { ...p, imei_2: cleanText };
              return p;
            });
          }
        });
      }, 100);
    }
  };

  const handleEditInit = (device) => {
    setIsEditing(true);
    setSelectedDevice(device);
    setFormData({
      sn_no: device.sn_no || '',
      imei_1: device.imei_1 || '',
      imei_2: device.imei_2 || '',
      status: device.current_status || '',
      note: ''
    });
    loadHistory(device.sn_no); 
  };

  const resetForm = () => {
    setIsEditing(false);
    setSelectedDevice(null);
    setHistory([]);
    setFormData({ sn_no: '', imei_1: '', imei_2: '', status: '', note: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    // UPDATED: Removed localhost for save/update
    const url = isEditing 
      ? `/api/devices/${selectedDevice._id}` 
      : '/api/devices';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    resetForm();
    loadDevices();
  };

  const filtered = devices.filter(d => 
    (d.sn_no || "").toUpperCase().includes(search.toUpperCase()) ||
    (d.imei_1 || "").includes(search) || (d.imei_2 || "").includes(search)
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">GripID <span className="accent">Pro</span></div>
        {isEditing && <button className="btn-new-entry" onClick={resetForm}>➕ New Entry</button>}
        
        <button style={{marginBottom:"10px"}} type="button" className={`btn-scan-mode ${isScanningAutoFill ? 'active' : ''}`} onClick={toggleAutoFillScanner}>
          {isScanningAutoFill ? "Stop Scanner" : "📷 Auto-Fill Form"}
        </button>
        {isScanningAutoFill && <div id="form-reader" className="scanner-box"></div>}
       
        <form className="add-form" onSubmit={handleSave}>
          <div className="input-group"><label>SN Number</label><input value={formData.sn_no} onChange={e => setFormData({...formData, sn_no: e.target.value})} required /></div>
          <div className="input-group"><label>IMEI 1</label><input value={formData.imei_1} onChange={e => setFormData({...formData, imei_1: e.target.value})} /></div>
          <div className="input-group"><label>IMEI 2</label><input value={formData.imei_2} onChange={e => setFormData({...formData, imei_2: e.target.value})} /></div>
          <div className="input-group"><label>Location</label><input value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} /></div>
          <textarea placeholder="New Note..." value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} rows="2" />
          <button type="submit" className="btn-save">{isEditing ? "Update" : "Save"}</button>
        </form>
      </aside>

      <main className="content">
        <header className="top-bar">
          <input className="search-bar" placeholder="Type SN/IMEI..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-scan-search" onClick={scanForSearch}>📷 Scan Search</button>
        </header>
        {isScanningSearch && <div id="search-reader" className="scanner-box-search"></div>}
        <div className="grid">
          {filtered.map(d => (
            <div key={d._id} className={`card ${selectedDevice?.sn_no === d.sn_no ? 'active' : ''}`} onClick={() => handleEditInit(d)}>
              <div className="card-sn">{d.sn_no} <span className="tag V6">V6</span></div>
              <div className="card-imeis">
                <div className="imei-row">I1: {d.imei_1 || '---'}</div>
                <div className="imei-row">I2: {d.imei_2 || '---'}</div>
              </div>
              <div className="card-location">{d.current_status}</div>
            </div>
          ))}
        </div>
      </main>

      {selectedDevice && (
        <section className="history-drawer">
          <div className="drawer-header">
            <h3>History</h3>
            <button onClick={resetForm}>×</button>
          </div>
          <div className="timeline">
            {history.length > 0 ? history.map((h, i) => (
              <div key={i} className="log-entry">
                <span className="date">{new Date(h.date).toLocaleDateString()}</span>
                <p><strong>{h.status}</strong></p>
                {h.note && <p className="note-text">{h.note}</p>}
              </div>
            )) : <p className="empty-msg">No history found for this device.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

export default App;