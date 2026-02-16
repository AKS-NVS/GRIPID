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
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState(null);
  const scannerRef = useRef(null); 

  // UI State
  const [isEditing, setIsEditing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({ 
    sn_no: '', imei_1: '', imei_2: '', status: '', note: '' 
  });

  // --- FETCH DEVICES (With Pagination) ---
  const loadDevices = useCallback((pageNo = 1) => {
    // Add timestamp to prevent caching issues
    fetch(`/api/devices?page=${pageNo}&limit=50&_t=${Date.now()}`)
      .then(res => res.json())
      .then(response => {
        if (response.data) {
          setDevices(response.data);
          setPage(response.currentPage);
          setTotalPages(response.totalPages);
          setTotalCount(response.totalDevices);
        } else {
          // Fallback if backend sends old array format
          setDevices(Array.isArray(response) ? response : []);
        }
      })
      .catch(err => console.error("Fetch error:", err));
  }, []);

  useEffect(() => { loadDevices(page); }, [loadDevices, page]);

  // --- SCANNER LOGIC ---
  const startScanner = (mode) => {
    if (isScanning) return;
    setScanMode(mode);
    setIsScanning(true);

    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      // Responsive Scan Box (Wide for Barcodes)
      const qrboxSize = window.innerWidth < 600 
        ? { width: 300, height: 150 } 
        : { width: 500, height: 200 };

      const config = { 
        fps: 15, 
        qrbox: qrboxSize,
        aspectRatio: window.innerHeight / window.innerWidth,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true } 
      };
      
      const allFormats = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]; // All barcode types

      html5QrCode.start(
        { facingMode: "environment" }, 
        { ...config, formatsToSupport: allFormats }, 
        (decodedText) => { handleScanSuccess(decodedText, mode); },
        () => {} // Ignore errors
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
      } catch (err) {}
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
    }
  };

  // --- IMPORT / EXPORT ---
  const handleExport = () => { window.location.href = '/api/export'; };

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
      loadDevices(page); // Refresh current page
    } catch (err) { alert("Upload Error: " + err.message); }
    e.target.value = null;
  };

  // --- VIEW & EDIT FLOW ---
  const loadHistory = (sn) => {
    setHistory([]); setIsLoadingHistory(true);
    fetch(`/api/devices/${sn}/history`).then(res=>res.json()).then(d=>{
      setHistory(Array.isArray(d)?d:[]); setIsLoadingHistory(false);
    }).catch(e=>setIsLoadingHistory(false));
  };

  const handleCardClick = (device) => {
    setSelectedDevice(device);
    setIsEditing(false); 
    loadHistory(device.sn_no);
  };

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
    setMobileMenuOpen(true); 
    setSelectedDevice(null); 
  };

  const resetForm = () => {
    setIsEditing(false); setSelectedDevice(null); setHistory([]);
    setFormData({ sn_no: '', imei_1: '', imei_2: '', status: '', note: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    
    // Logic to find ID if editing
    let targetId = null;
    if (isEditing) {
        // We find the device in the current list that matches the SN we started editing
        // This is safe because we populate formData from selectedDevice
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
        // Add new device to top of list
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

  // --- FILTERING ---
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

        {/* PAGINATION CONTROLS */}
        <div className="pagination-bar" style={{display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px', padding: '20px', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155'}}>
          <button 
            className="btn-page" 
            style={{background: page === 1 ? '#334155' : '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: page === 1 ? 'not-allowed' : 'pointer'}}
            disabled={page === 1} 
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          
          <span className="page-info" style={{textAlign: 'center', color: 'white', fontWeight: 'bold'}}>
            Page {page} of {totalPages} <br/>
            <small style={{color: '#94a3b8', fontWeight: 'normal'}}>({totalCount} Items)</small>
          </span>
          
          <button 
            className="btn-page" 
            style={{background: page >= totalPages ? '#334155' : '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: page >= totalPages ? 'not-allowed' : 'pointer'}}
            disabled={page >= totalPages} 
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>

      </main>

      {/* --- NEW: MODERN DETAILS SHEET --- */}
      {selectedDevice && !mobileMenuOpen && (
        <div className="modal-overlay" onClick={() => setSelectedDevice(null)}>
          <div className="modal-content details-sheet" onClick={e => e.stopPropagation()}>
            
            {/* Drag Handle */}
            <div className="sheet-handle-bar" onClick={() => setSelectedDevice(null)}>
              <div className="sheet-handle"></div>
            </div>

            {/* Header */}
            <div className="sheet-header-modern">
              <div className="sheet-title-row">
                <h2>{selectedDevice.sn_no}</h2>
                {renderVersionTag(selectedDevice.sn_no)}
              </div>
              <div className={`status-pill ${selectedDevice.current_status === 'In Stock' ? 'status-green' : 'status-blue'}`}>
                {selectedDevice.current_status}
              </div>
            </div>

            <div className="sheet-scroll-content">
              {/* Data Grid */}
              <div className="data-grid">
                <div className="data-box">
                  <span className="label">IMEI 1</span>
                  <span className="value">{selectedDevice.imei_1 || '---'}</span>
                </div>
                <div className="data-box">
                  <span className="label">IMEI 2</span>
                  <span className="value">{selectedDevice.imei_2 || '---'}</span>
                </div>
              </div>

              {/* Timeline */}
              <div className="timeline-section">
                <h4>Activity Log</h4>
                <div className="timeline-container">
                  {isLoadingHistory ? <p className="loading-text">⏳ Loading history...</p> : (
                    history.length > 0 ? history.map((h, i) => (
                      <div key={i} className="timeline-item">
                        <div className="timeline-dot"></div>
                        <div className="timeline-content">
                          <div className="t-header">
                            <span className="t-status">{h.status}</span>
                            <span className="t-date">{new Date(h.date).toLocaleDateString()}</span>
                          </div>
                          {h.note && <div className="t-note">{h.note}</div>}
                        </div>
                      </div>
                    )) : <p className="empty-msg">No history found.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sheet-footer">
              <button className="btn-edit-action" onClick={handleEditStart}>
                ✏️ Edit / Update
              </button>
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
           <div className="modal-content" style={{padding: '25px', borderRadius: '15px'}}>
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