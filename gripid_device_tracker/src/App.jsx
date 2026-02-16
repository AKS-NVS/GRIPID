import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; // Import Core Library instead of Scanner
import './App.css';

function App() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Search & Filter
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL"); // New Filter State
  
  // --- CUSTOM SCANNER STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState(null); // 'SEARCH' or 'AUTOFILL'
  const scannerRef = useRef(null); // Keeps track of the camera instance

  const [isEditing, setIsEditing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({ 
    sn_no: '', imei_1: '', imei_2: '', status: '', note: '' 
  });

  const loadDevices = useCallback(() => {
    fetch('/api/devices')
      .then(res => res.json())
      .then(data => setDevices(Array.isArray(data) ? data : []))
      .catch(err => console.error("Fetch error:", err));
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

// --- UPDATED: CUSTOM SCANNER LOGIC ---
  const startScanner = (mode) => {
    if (isScanning) return;
    setScanMode(mode);
    setIsScanning(true);

    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      // 1. rectangular box for long barcodes (SN/IMEI)
      // On mobile, we adjust width to be responsive
      const qrboxSize = window.innerWidth < 400 
        ? { width: 280, height: 150 } 
        : { width: 350, height: 150 };

      const config = { 
        fps: 15, // Higher FPS for faster scanning
        qrbox: qrboxSize,
        aspectRatio: window.innerHeight / window.innerWidth
      };
      
      html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
          handleScanSuccess(decodedText, mode);
        },
        (errorMessage) => {
          // ignore failures
        }
      ).catch(err => {
        console.error("Camera failed", err);
        setIsScanning(false);
        alert("Camera error: " + err);
      });
    }, 300);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Stop failed", err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    setScanMode(null);
  };

  const handleScanSuccess = (text, mode) => {
    const cleanText = text.trim().toUpperCase();

    if (mode === 'SEARCH') {
      setSearch(cleanText);
      stopScanner(); // Stop immediately after search scan
    } else if (mode === 'AUTOFILL') {
      // Smart Auto-Fill Logic
      if (cleanText.startsWith("GRIPID")) {
        setFormData(p => ({ ...p, sn_no: cleanText }));
      } else if (/^\d{15}$/.test(cleanText)) {
        setFormData(p => {
          if (!p.imei_1) return { ...p, imei_1: cleanText };
          if (p.imei_1 !== cleanText) return { ...p, imei_2: cleanText };
          return p;
        });
      }
      // Note: We do NOT close scanner here so you can scan SN then IMEI quickly
    }
  };

  // --- EXPORT LOGIC ---
  const handleExport = () => {
    window.location.href = '/api/export';
  };

  // --- IMPORT LOGIC ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = new FormData();
    data.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: data });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      setUploadResult(result);
      loadDevices();
    } catch (err) { alert("Upload Error: " + err.message); }
    e.target.value = null;
  };

  // --- STANDARD HANDLERS ---
  const loadHistory = (sn) => {
    setHistory([]); setIsLoadingHistory(true);
    fetch(`/api/devices/${sn}/history`).then(res=>res.json()).then(d=>{
      setHistory(Array.isArray(d)?d:[]); setIsLoadingHistory(false);
    }).catch(e=>setIsLoadingHistory(false));
  };

  const handleEditInit = (device) => {
    setIsEditing(true); setSelectedDevice(device);
    setFormData({ sn_no: device.sn_no||'', imei_1: device.imei_1||'', imei_2: device.imei_2||'', status: device.current_status||'', note: '' });
    loadHistory(device.sn_no); setMobileMenuOpen(true);
  };

  const resetForm = () => {
    setIsEditing(false); setSelectedDevice(null); setHistory([]);
    setFormData({ sn_no: '', imei_1: '', imei_2: '', status: '', note: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `/api/devices/${selectedDevice._id}` : '/api/devices';
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const updatedDevice = await res.json();
      if (!res.ok) throw new Error(updatedDevice.message);

      if (isEditing) {
        setDevices(prev => prev.map(d => d._id === updatedDevice._id ? updatedDevice : d));
        setHistory(updatedDevice.history || []); setFormData(p => ({ ...p, note: '' }));
      } else {
        setDevices(prev => [updatedDevice, ...prev]); resetForm();
      }
      if(window.innerWidth < 768) setMobileMenuOpen(false);
    } catch (err) { alert(err.message); }
  };

  const renderVersionTag = (sn) => {
    if (!sn) return null;
    if (sn.toUpperCase().includes("V6")) return <span className="tag V6">V6</span>;
    if (sn.toUpperCase().includes("FAP")) return <span className="tag" style={{backgroundColor: '#e67e22', color: 'white'}}>FAP</span>;
    return null; 
  };

  // --- FILTERING LOGIC ---
  const filtered = devices.filter(d => {
    const matchesSearch = (d.sn_no || "").toUpperCase().includes(search.toUpperCase()) ||
                          (d.imei_1 || "").includes(search) || (d.imei_2 || "").includes(search);
    
    let matchesFilter = true;
    if (filterType === "V6") matchesFilter = (d.sn_no || "").toUpperCase().includes("V6");
    if (filterType === "FAP") matchesFilter = (d.sn_no || "").toUpperCase().includes("FAP");
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="mobile-close-btn" style={{textAlign:'right', display: mobileMenuOpen ? 'block' : 'none'}}>
          <button onClick={() => setMobileMenuOpen(false)} style={{background:'transparent', border:'none', color:'white', fontSize:'24px'}}>✕</button>
        </div>

        <div className="brand">GripID <span className="accent">Pro</span></div>
        
        {isEditing && <button className="btn-new-entry" onClick={resetForm}>➕ New Entry</button>}
        
        {/* NEW: Clean Scanner Button */}
        <button className="btn-scan-mode" onClick={() => startScanner('AUTOFILL')}>
          📷 Scan to Form
        </button>
       
        {/* NEW: Utility Buttons */}
        <div style={{marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #334155', display: 'flex', gap: '5px'}}>
           <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" style={{display: 'none'}} />
           <button className="btn-utility" onClick={() => fileInputRef.current.click()}>📂 Import</button>
           <button className="btn-utility" onClick={handleExport}>⬇ Export</button>
        </div>

        <form className="add-form" onSubmit={handleSave} style={{marginTop: '20px'}}>
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
          <button className="btn-mobile-menu" onClick={() => setMobileMenuOpen(true)}>☰ Add</button>

          {/* NEW: Search & Filter Bar */}
          <div className="search-group">
            <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="ALL">All</option>
              <option value="V6">V6</option>
              <option value="FAP">FAP</option>
            </select>
            <input className="search-bar" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn-scan-search" onClick={() => startScanner('SEARCH')}>📷</button>
          </div>
        </header>

        <div className="grid">
          {filtered.map(d => (
            <div key={d._id} className={`card ${selectedDevice?.sn_no === d.sn_no ? 'active' : ''}`} onClick={() => handleEditInit(d)}>
              <div className="card-sn">{d.sn_no} {renderVersionTag(d.sn_no)}</div>
              <div className="card-imeis">
                <div className="imei-row">I1: {d.imei_1 || '---'}</div>
                <div className="imei-row">I2: {d.imei_2 || '---'}</div>
              </div>
              <div className="card-location">{d.current_status}</div>
            </div>
          ))}
        </div>
      </main>

      {/* History Drawer */}
      {selectedDevice && (
        <section className="history-drawer">
          <div className="drawer-header"><h3>History</h3><button onClick={() => setSelectedDevice(null)}>×</button></div>
          <div className="timeline">
            {isLoadingHistory ? <div className="loading-state"><p>⏳ Loading...</p></div> : (
              history.length > 0 ? history.map((h, i) => (
                <div key={i} className="log-entry">
                  <span className="date">{new Date(h.date).toLocaleDateString()}</span>
                  <p><strong>{h.status}</strong></p>
                  {h.note && <p className="note-text">{h.note}</p>}
                </div>
              )) : <p className="empty-msg">No history.</p>
            )}
          </div>
        </section>
      )}

      {/* --- NEW: CUSTOM CAMERA OVERLAY --- */}
      {isScanning && (
        <div className="scanner-overlay">
          <div className="scanner-modal">
            {/* The library renders the video here */}
            <div id="reader" className="camera-viewport"></div>
            
            <div className="scanner-controls">
              <p>Scanning for {scanMode}...</p>
              <button className="btn-close-scanner" onClick={stopScanner}>Stop Camera</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {uploadResult && (
        <div className="modal-overlay">
           <div className="modal-content">
             <h3>Import Results</h3>
             <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
               <div style={{flex:1, textAlign:'center', background:'#10b981', padding:'10px', borderRadius:'5px'}}>
                  <strong>{uploadResult.added}</strong><br/>Added
               </div>
               <div style={{flex:1, textAlign:'center', background:'#f59e0b', padding:'10px', borderRadius:'5px'}}>
                  <strong>{uploadResult.skipped}</strong><br/>Skipped
               </div>
             </div>
             <button className="btn-save" onClick={() => setUploadResult(null)}>Close</button>
           </div>
        </div>
      )}
      
      {mobileMenuOpen && <div className="overlay-backdrop" onClick={() => setMobileMenuOpen(false)}></div>}
    </div>
  );
}

export default App;