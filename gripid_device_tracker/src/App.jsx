import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './App.css';

function App() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [search, setSearch] = useState("");
  const [isScanningSearch, setIsScanningSearch] = useState(false);
  const [isScanningAutoFill, setIsScanningAutoFill] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- NEW: Excel Import State ---
  const [uploadResult, setUploadResult] = useState(null); // Stores success/error logs
  const fileInputRef = useRef(null); // Reference to hidden file input
  
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

  // --- NEW: Handle Excel Upload ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append('file', file);

    try {
      // Simple loading feedback
      const btn = document.activeElement;
      if(btn) btn.innerText = "⏳ Uploading...";

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: data
      });
      
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.message || "Upload failed");

      setUploadResult(result); // Show the results modal
      loadDevices(); // Refresh the list immediately
      
    } catch (err) {
      alert("Upload Error: " + err.message);
    } finally {
      // Reset input so you can select the same file again if needed
      e.target.value = null; 
      if(document.activeElement) document.activeElement.innerText = "📂 Import Excel";
    }
  };

  const loadHistory = (sn) => {
    setHistory([]);
    setIsLoadingHistory(true);

    fetch(`/api/devices/${sn}/history`)
      .then(res => res.json())
      .then(data => {
        setHistory(Array.isArray(data) ? data : []);
        setIsLoadingHistory(false);
      })
      .catch(err => {
        console.error("History fetch error:", err);
        setIsLoadingHistory(false);
      });
  };

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
    setMobileMenuOpen(true); 
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
    const url = isEditing ? `/api/devices/${selectedDevice._id}` : '/api/devices';
    
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const updatedDevice = await res.json();
      
      if (!res.ok) throw new Error(updatedDevice.message || "Save failed");

      if (isEditing) {
        setDevices(prev => prev.map(d => d._id === updatedDevice._id ? updatedDevice : d));
        setHistory(updatedDevice.history || []); 
        setFormData(p => ({ ...p, note: '' }));
      } else {
        setDevices(prev => [updatedDevice, ...prev]);
        resetForm();
      }
      if(window.innerWidth < 768) setMobileMenuOpen(false);

    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const renderVersionTag = (sn) => {
    if (!sn) return null;
    const upperSn = sn.toUpperCase();
    
    if (upperSn.includes("V6")) {
      return <span className="tag V6">V6</span>;
    } 
    if (upperSn.includes("FAP")) {
      return <span className="tag" style={{backgroundColor: '#e67e22', color: 'white'}}>FAP</span>;
    }
    return null; 
  };

  const filtered = devices.filter(d => 
    (d.sn_no || "").toUpperCase().includes(search.toUpperCase()) ||
    (d.imei_1 || "").includes(search) || (d.imei_2 || "").includes(search)
  );

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        
        <div className="mobile-close-btn" style={{textAlign:'right', marginBottom:'10px', display: mobileMenuOpen ? 'block' : 'none'}}>
          <button 
            onClick={() => setMobileMenuOpen(false)}
            style={{background:'transparent', border:'none', color:'white', fontSize:'24px', cursor:'pointer'}}
          >
            ✕
          </button>
        </div>

        <div className="brand">GripID <span className="accent">Pro</span></div>
        {isEditing && <button className="btn-new-entry" onClick={resetForm}>➕ New Entry</button>}
        
        <button style={{marginBottom:"10px"}} type="button" className={`btn-scan-mode ${isScanningAutoFill ? 'active' : ''}`} onClick={toggleAutoFillScanner}>
          {isScanningAutoFill ? "Stop Scanner" : "📷 Auto-Fill Form"}
        </button>
        {isScanningAutoFill && <div id="form-reader" className="scanner-box"></div>}
       
        {/* --- NEW: Import Excel Button Section --- */}
        <div style={{marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '15px'}}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xlsx, .xls" 
            style={{display: 'none'}} 
          />
          <button 
            className="btn-new-entry" 
            style={{backgroundColor: '#2563eb', fontSize: '13px'}}
            onClick={() => fileInputRef.current.click()}
          >
            📂 Import Excel
          </button>
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
          <button 
            className="btn-mobile-menu" 
            onClick={() => setMobileMenuOpen(true)}
          >
            ☰ Add / Scan
          </button>

          <input className="search-bar" placeholder="Type SN/IMEI..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-scan-search" onClick={scanForSearch}>📷</button>
        </header>

        {isScanningSearch && <div id="search-reader" className="scanner-box-search"></div>}
        
        <div className="grid">
          {filtered.map(d => (
            <div key={d._id} className={`card ${selectedDevice?.sn_no === d.sn_no ? 'active' : ''}`} onClick={() => handleEditInit(d)}>
              <div className="card-sn">
                {d.sn_no} 
                {renderVersionTag(d.sn_no)}
              </div>
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
          <div className="drawer-header">
            <h3>History</h3>
            <button onClick={() => setSelectedDevice(null)}>×</button>
          </div>
          
          <div className="timeline">
            {isLoadingHistory ? (
              <div className="loading-state">
                <p>⏳ Loading history...</p>
              </div>
            ) : (
              <>
                {history.length > 0 ? history.map((h, i) => (
                  <div key={i} className="log-entry">
                    <span className="date">{new Date(h.date).toLocaleDateString()}</span>
                    <p><strong>{h.status}</strong></p>
                    {h.note && <p className="note-text">{h.note}</p>}
                  </div>
                )) : <p className="empty-msg">No history found for this device.</p>}
              </>
            )}
          </div>
        </section>
      )}

      {/* --- NEW: Upload Results Modal --- */}
      {uploadResult && (
        <div style={{
          position:'fixed', top:0, left:0, width:'100%', height:'100%', 
          background:'rgba(0,0,0,0.8)', zIndex:2000, 
          display:'flex', justifyContent:'center', alignItems:'center'
        }}>
          <div style={{
            background:'#1e293b', padding:'20px', borderRadius:'10px', 
            width:'90%', maxWidth:'500px', maxHeight:'80vh', overflowY:'auto',
            border: '1px solid #334155'
          }}>
            <h3 style={{color:'white', marginTop:0, marginBottom:'15px'}}>Import Results</h3>
            
            {/* Summary Counters */}
            <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
              <div style={{background:'#10b981', padding:'10px', borderRadius:'5px', flex:1, textAlign:'center'}}>
                <div style={{fontSize:'24px', fontWeight:'bold', color:'white'}}>{uploadResult.added}</div>
                <div style={{fontSize:'12px', color:'#ecfdf5'}}>Added</div>
              </div>
              <div style={{background:'#f59e0b', padding:'10px', borderRadius:'5px', flex:1, textAlign:'center'}}>
                <div style={{fontSize:'24px', fontWeight:'bold', color:'white'}}>{uploadResult.skipped}</div>
                <div style={{fontSize:'12px', color:'#fffbeb'}}>Skipped</div>
              </div>
            </div>
            
            {/* Detailed Logs */}
            <h4 style={{color:'#94a3b8', margin:'0 0 10px 0', fontSize:'14px'}}>Details:</h4>
            <div style={{background:'#0f172a', padding:'10px', borderRadius:'5px', maxHeight:'200px', overflowY:'auto'}}>
              {uploadResult.logs.filter(l => l.status !== "Success").length === 0 ? (
                <p style={{color:'#94a3b8', fontSize:'13px', margin:0}}>✅ All rows processed successfully.</p>
              ) : (
                uploadResult.logs.filter(l => l.status !== "Success").map((l, i) => (
                  <div key={i} style={{borderBottom:'1px solid #334155', padding:'8px 0', fontSize:'12px', color:'#ef4444'}}>
                    <strong>Row {l.row}:</strong> {l.reason} <br/>
                    <span style={{color:'#64748b'}}>SN: {l.sn || 'N/A'}</span>
                  </div>
                ))
              )}
            </div>

            <button 
              onClick={() => setUploadResult(null)}
              style={{
                marginTop:'20px', width:'100%', padding:'12px', 
                background:'#3b82f6', color:'white', border:'none', 
                borderRadius:'8px', cursor:'pointer', fontWeight:'bold'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Backdrop for Mobile Menu */}
      {mobileMenuOpen && (
        <div className="overlay-backdrop" onClick={() => setMobileMenuOpen(false)}></div>
      )}
    </div>
  );
}

export default App;