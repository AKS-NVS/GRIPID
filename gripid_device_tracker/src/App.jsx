import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; 
import './App.css';

function App() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Search & Filter
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  
  // --- CUSTOM SCANNER STATE ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState(null); // 'SEARCH' or 'AUTOFILL'
  const scannerRef = useRef(null); 

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

  // --- UPDATED: ROBUST SCANNER LOGIC ---
  const startScanner = (mode) => {
    if (isScanning) return;
    setScanMode(mode);
    setIsScanning(true);

    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      // 1. Wide Rectangle Box (Better for SN labels)
      const qrboxSize = window.innerWidth < 600 
        ? { width: 300, height: 150 }  // Mobile
        : { width: 500, height: 200 }; // Desktop

      const config = { 
        fps: 15, // Faster scanning
        qrbox: qrboxSize,
        aspectRatio: window.innerHeight / window.innerWidth,
        // Experimental feature to prefer barcode formats
        experimentalFeatures: { useBarCodeDetectorIfSupported: true } 
      };
      
      // Enable scanning for normal Barcodes (Code 128, etc), not just QR
      const allFormats = [
        0, // QR_CODE
        1, // AZTEC
        2, // CODABAR
        3, // CODE_39 (Standard for SNs)
        4, // CODE_93
        5, // CODE_128 (Standard for IMEIs/Shipping)
        6, // DATA_MATRIX
        7, // MAXICODE
        8, // ITF
        9, // EAN_13
        10, // EAN_8
        11, // PDF_417
        12, // RSS_14
        13, // RSS_EXPANDED
        14, // UPC_A
        15, // UPC_E
      ];

      html5QrCode.start(
        { facingMode: "environment" }, 
        { ...config, formatsToSupport: allFormats }, 
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
      stopScanner(); 
    } else if (mode === 'AUTOFILL') {
      if (cleanText.startsWith("GRIPID")) {
        setFormData(p => ({ ...p, sn_no: cleanText }));
      } else if (/^\d{15}$/.test(cleanText)) {
        setFormData(p => {
          if (!p.imei_1) return { ...p, imei_1: cleanText };
          if (p.imei_1 !== cleanText) return { ...p, imei_2: cleanText };
          return p;
        });
      }
      // Note: Scanner stays open for rapid scanning
    }
  };

  // --- EXPORT/IMPORT LOGIC ---
  const handleExport = () => {
    window.location.href = '/api/export';
  };

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

  const loadHistory = (sn) => {
    setHistory([]); setIsLoadingHistory(true);
    fetch(`/api/devices/${sn}/history`).then(res=>res.json()).then(d=>{
      setHistory(Array.isArray(d)?d:[]); setIsLoadingHistory(false);
    }).catch(e=>setIsLoadingHistory(false));
  };

  // --- NEW INTERACTION FLOW ---

  // 1. User Taps Card -> Opens Details Modal (View Only)
  const handleCardClick = (device) => {
    setSelectedDevice(device);
    setIsEditing(false); 
    loadHistory(device.sn_no);
    // Note: We do NOT open mobileMenuOpen here.
  };

  // 2. User clicks "Edit" inside Modal -> Opens Sidebar
  const handleEditStart = () => {
    if (!selectedDevice) return;
    
    setIsEditing(true);
    setFormData({
      sn_no: selectedDevice.sn_no || '',
      imei_1: selectedDevice.imei_1 || '',
      imei_2: selectedDevice.imei_2 || '',
      status: selectedDevice.current_status || '',
      note: ''
    });
    
    setMobileMenuOpen(true); // Open Sidebar
    setSelectedDevice(null); // Close Details Modal
  };

  // 3. Reset for New Entry
  const resetForm = () => {
    setIsEditing(false); 
    setSelectedDevice(null); 
    setHistory([]);
    setFormData({ sn_no: '', imei_1: '', imei_2: '', status: '', note: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    // If editing, we likely had a selected device before, but we closed the modal.
    // However, we need the ID. If we are editing, we assume formData corresponds to the device being edited.
    // Wait, we need the ID. Let's ensure we store the ID in formData or state when editing starts.
    // Simpler fix: Use the device ID from the list that matches the SN, OR simpler:
    // When handleEditStart runs, we should keep the ID in a separate state or just rely on finding it.
    // Actually, `selectedDevice` is null now. 
    // FIX: Let's find the device ID from the `devices` array using `sn_no` which is unique enough for this flow,
    // OR better, let's just keep `selectedDevice` for the ID reference but hide the modal.
    
    // Better approach implemented below:
    // We will look up the device by SN to get the ID if we are in editing mode.
    let targetId = null;
    if (isEditing) {
        const found = devices.find(d => d.sn_no === formData.sn_no);
        if (found) targetId = found._id;
    }

    const url = isEditing && targetId ? `/api/devices/${targetId}` : '/api/devices';
    
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const updatedDevice = await res.json();
      if (!res.ok) throw new Error(updatedDevice.message);

      if (isEditing) {
        setDevices(prev => prev.map(d => d._id === updatedDevice._id ? updatedDevice : d));
        setFormData(p => ({ ...p, note: '' }));
      } else {
        setDevices(prev => [updatedDevice, ...prev]); 
        resetForm();
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
        
        <button className="btn-scan-mode" onClick={() => startScanner('AUTOFILL')}>
          📷 Scan to Form
        </button>
       
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
            <div key={d._id} className="card" onClick={() => handleCardClick(d)}>
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

      {/* --- NEW: DETAILS SHEET (Replaces History Drawer) --- */}
      {selectedDevice && !mobileMenuOpen && (
        <div className="modal-overlay" onClick={() => setSelectedDevice(null)}>
          <div className="modal-content details-sheet" onClick={e => e.stopPropagation()}>
            
            <div className="sheet-header">
              <h3>Device Details</h3>
              <button className="btn-close-sheet" onClick={() => setSelectedDevice(null)}>✕</button>
            </div>

            <div className="sheet-info">
              <div className="info-row">
                <span className="label">SN:</span> 
                <span className="value">{selectedDevice.sn_no} {renderVersionTag(selectedDevice.sn_no)}</span>
              </div>
              <div className="info-row">
                <span className="label">IMEI 1:</span> <span className="value">{selectedDevice.imei_1 || '--'}</span>
              </div>
              <div className="info-row">
                <span className="label">IMEI 2:</span> <span className="value">{selectedDevice.imei_2 || '--'}</span>
              </div>
              <div className="info-row">
                <span className="label">Status:</span> 
                <span className="value status-badge">{selectedDevice.current_status}</span>
              </div>
            </div>

            <div className="sheet-actions">
              <button className="btn-edit-device" onClick={handleEditStart}>
                ✏️ Edit Device
              </button>
            </div>

            <div className="sheet-history">
              <h4>History Log</h4>
              <div className="history-list">
                {isLoadingHistory ? <p>⏳ Loading...</p> : (
                  history.length > 0 ? history.map((h, i) => (
                    <div key={i} className="history-item">
                      <div className="h-date">{new Date(h.date).toLocaleDateString()}</div>
                      <div className="h-status">{h.status}</div>
                      {h.note && <div className="h-note">{h.note}</div>}
                    </div>
                  )) : <p className="empty-msg">No history recorded.</p>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- CUSTOM SCANNER OVERLAY --- */}
      {isScanning && (
        <div className="scanner-overlay">
          <div className="scanner-modal">
            <div id="reader" className="camera-viewport"></div>
            <div className="scanner-controls">
              <button className="btn-close-scanner" onClick={stopScanner}>Stop Camera</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Results Modal */}
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