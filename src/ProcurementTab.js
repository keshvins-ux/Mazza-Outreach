import React, { useState, useEffect } from "react";

const PROCUREMENT_USERS = ["keshvin", "varinder", "yuges", "navin"];
const fmtRM  = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"}) : "—";

// ─── SECONDARY LOGIN GATE ─────────────────────────────────────────────────────
function ProcurementGate({ currentUser, onAuth }) {
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // If user already has procurement access, auto-pass
  useEffect(() => {
    if (currentUser && PROCUREMENT_USERS.includes(currentUser.id)) {
      // Still require re-authentication for security
    }
  }, [currentUser]);

  async function handleAuth() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: currentUser.email, password }),
      });
      const data = await res.json();
      if (data.user) {
        if (!PROCUREMENT_USERS.includes(data.user.id)) {
          setError("Your account does not have access to Procurement.");
        } else {
          onAuth(data.user);
        }
      } else {
        setError("Incorrect password.");
      }
    } catch { setError("Connection error. Please try again."); }
    setLoading(false);
  }

  return (
    <div style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:400, padding:32}}>
      <div style={{background:"#fff", borderRadius:20, padding:"36px 40px", border:"1px solid #E2E8F0", boxShadow:"0 8px 32px rgba(15,36,66,0.10)", width:"100%", maxWidth:400}}>
        <div style={{textAlign:"center", marginBottom:24}}>
          <div style={{fontSize:36, marginBottom:8}}>🔒</div>
          <div style={{fontSize:17, fontWeight:800, color:"#0F172A", marginBottom:4}}>Procurement Access</div>
          <div style={{fontSize:12, color:"#94A3B8"}}>This section requires re-authentication.</div>
          <div style={{fontSize:12, color:"#94A3B8"}}>Authorised: Varinder, Keshvin, Yuges only.</div>
        </div>
        <div style={{marginBottom:8, fontSize:11, color:"#64748B", fontWeight:600}}>Confirm your password</div>
        <input
          type="password" value={password} onChange={e=>setPassword(e.target.value)}
          placeholder="••••••••"
          onKeyDown={e=>e.key==="Enter"&&handleAuth()}
          style={{width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #CBD5E1", fontSize:14, outline:"none", marginBottom:12, boxSizing:"border-box"}}
        />
        {error && <div style={{background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#DC2626", marginBottom:12}}>{error}</div>}
        <button onClick={handleAuth} disabled={loading}
          style={{width:"100%", padding:"12px", background:loading?"#CBD5E1":"#1E3A5F", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:700, cursor:loading?"not-allowed":"pointer"}}>
          {loading ? "Verifying..." : "Enter Procurement →"}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN PROCUREMENT TAB ────────────────────────────────────────────────────
export default function ProcurementTab({ currentUser }) {
  const [authed,  setAuthed]  = useState(false);
  const [view,    setView]    = useState("pos");

  if (!authed) return <ProcurementGate currentUser={currentUser} onAuth={()=>setAuthed(true)} />;

  const tabBtn = (v, label) => (
    <button onClick={()=>setView(v)} style={{
      padding:"7px 18px", borderRadius:99, border:"none", cursor:"pointer",
      fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:700,
      background:view===v?"#1E3A5F":"#F1F5F9",
      color:view===v?"#fff":"#64748B", whiteSpace:"nowrap",
    }}>{label}</button>
  );

  return (
    <div style={{padding:"24px 28px", maxWidth:1280, margin:"0 auto"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:4}}>🛒 Procurement</div>
          <div style={{fontSize:13, color:"#94A3B8"}}>Supplier POs · Goods Received · Stock Adjustments · Payments</div>
        </div>
        <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
          {tabBtn("pos",     "📤 Supplier POs")}
          {tabBtn("grn",     "📦 Log GRN")}
          {tabBtn("stock",   "🔧 Stock Adjustment")}
          {tabBtn("payments","💳 Payments")}
        </div>
      </div>

      {view === "pos"      && <SupplierPOView />}
      {view === "grn"      && <LogGRNView currentUser={currentUser} />}
      {view === "stock"    && <StockAdjView currentUser={currentUser} />}
      {view === "payments" && <PaymentsView />}
    </div>
  );
}

// ─── SUPPLIER POs ─────────────────────────────────────────────────────────────
function SupplierPOView() {
  const [pos,     setPos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("open");
  const [days,    setDays]    = useState(90); // date filter: 30 | 60 | 90 | 0 (all)

  useEffect(() => {
    fetch("/api/prospects?type=po_list")
      .then(r=>r.json())
      .then(d=>{ setPos(d.pos||[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  const cutoff = days > 0 ? new Date(Date.now() - days*24*60*60*1000) : null;

  const filtered = pos.filter(p => {
    const ms = !search || p.id?.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier?.toLowerCase().includes(search.toLowerCase());
    const inDate = !cutoff || !p.date || new Date(p.date) >= cutoff;
    if (filter==="open")     return ms && inDate && p.status!=="Cancelled" && (!p.offsetPct || p.offsetPct < 100);
    if (filter==="partial")  return ms && inDate && p.offsetPct > 0 && p.offsetPct < 100;
    if (filter==="complete") return ms && inDate && p.offsetPct >= 100;
    return ms && inDate;
  });

  const visiblePos = days > 0 ? pos.filter(p => !p.date || new Date(p.date) >= cutoff) : pos;
  const totals = {
    total: visiblePos.length,
    open:  visiblePos.filter(p=>(!p.offsetPct||p.offsetPct<100)&&p.status!=="Cancelled").length,
    value: visiblePos.filter(p=>(!p.offsetPct||p.offsetPct<100)&&p.status!=="Cancelled").reduce((s,p)=>s+(p.amount||0),0),
  };

  if (loading) return <Loader text="Loading supplier POs..." />;

  return (
    <div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
        {[
          {label:`POs (${days>0?`Last ${days} days`:"All time"})`, value:totals.total, color:"#1E3A5F", bg:"#EFF6FF"},
          {label:"Open / Pending GRN", value:totals.open,  color:"#d97706", bg:"#FFFBEB"},
          {label:"Outstanding Value",  value:fmtRM(totals.value), color:"#dc2626", bg:"#FEF2F2"},
        ].map(c=>(
          <KPICard key={c.label} {...c} />
        ))}
      </div>
      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
          <div>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Supplier Purchase Orders</div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>Showing {filtered.length} of {pos.length} total POs</div>
          </div>
          <div style={{display:"flex", gap:6, alignItems:"center", flexWrap:"wrap"}}>
            <div style={{display:"flex", gap:4, background:"#F1F5F9", borderRadius:99, padding:3}}>
              {[[30,"30d"],[60,"60d"],[90,"90d"],[0,"All"]].map(([v,l])=>(
                <button key={v} onClick={()=>setDays(v)} style={{padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:days===v?"#1E3A5F":"transparent", color:days===v?"#fff":"#64748B"}}>{l}</button>
              ))}
            </div>
            <div style={{width:1, height:20, background:"#E2E8F0"}}/>
            {[["all","All"],["open","Open"],["partial","Partial"],["complete","Complete"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} style={{padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:filter===v?"#1E3A5F":"#F1F5F9", color:filter===v?"#fff":"#64748B"}}>{l}</button>
            ))}
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search PO or supplier..."
              style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:160}} />
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead><tr style={{background:"#F8FAFC"}}>
              {["PO Number","Supplier","Date","Amount","Items","Delivery","Received %","Status"].map(h=>(
                <th key={h} style={{padding:"9px 12px", textAlign:["Amount"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={8} style={{padding:32,textAlign:"center",color:"#94A3B8"}}>No POs found</td></tr>}
              {filtered.map((po,i)=>(
                <tr key={po.id} style={{borderTop:"1px solid #F1F5F9", background:i%2===0?"#FAFAFA":"#fff"}}>
                  <td style={{padding:"10px 12px", fontWeight:700, color:"#1E3A5F"}}>{po.id}</td>
                  <td style={{padding:"10px 12px", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{po.supplier}</td>
                  <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{fmtDate(po.date)}</td>
                  <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700}}>{fmtRM(po.amount)}</td>
                  <td style={{padding:"10px 12px", color:"#64748B"}}>{po.itemCount||"—"}</td>
                  <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{fmtDate(po.deliveryDate)}</td>
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex", alignItems:"center", gap:6}}>
                      <div style={{width:50, height:6, background:"#F1F5F9", borderRadius:99, overflow:"hidden"}}>
                        <div style={{height:"100%", width:`${Math.min(po.offsetPct||0,100)}%`, background:(po.offsetPct||0)>=100?"#16a34a":(po.offsetPct||0)>0?"#d97706":"#E2E8F0", borderRadius:99}}/>
                      </div>
                      <span style={{fontSize:11, fontWeight:700, color:(po.offsetPct||0)>=100?"#16a34a":(po.offsetPct||0)>0?"#d97706":"#94A3B8"}}>{(po.offsetPct||0).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 12px"}}>
                    <StatusBadge status={po.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── LOG GRN ─────────────────────────────────────────────────────────────────
function LogGRNView({ currentUser }) {
  const [pos,       setPos]       = useState([]);
  const [selPO,     setSelPO]     = useState("");
  const [items,     setItems]     = useState([]);
  const [grnDate,   setGrnDate]   = useState(new Date().toISOString().slice(0,10));
  const [note,      setNote]      = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const [history,   setHistory]   = useState([]);

  useEffect(() => {
    fetch("/api/prospects?type=po_list")
      .then(r=>r.json())
      .then(d=>{ setPos((d.pos||[]).filter(p=>p.status!=="Cancelled"&&(p.offsetPct||0)<100)); });
    fetch("/api/prospects?type=grn_history")
      .then(r=>r.json())
      .then(d=>setHistory(d.list||[]))
      .catch(()=>{});
  }, []);

  function selectPO(poId) {
    setSelPO(poId);
    setResult(null); setError("");
    const po = pos.find(p=>p.id===poId);
    if (po?.lines) {
      setItems(po.lines.map(l=>({ itemcode:l.itemcode, description:l.description, uom:l.uom, ordered:parseFloat(l.qty||0), received:"", batch:"" })));
    }
  }

  async function submitGRN() {
    if (!selPO) { setError("Please select a PO"); return; }
    const filledItems = items.filter(i=>parseFloat(i.received||0)>0);
    if (!filledItems.length) { setError("Enter at least one received quantity"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/procurement?action=grn", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ poId:selPO, items:filledItems, grnDate, note, submittedBy:currentUser?.name }),
      });
      const data = await res.json();
      if (data.success) { setResult(data); setSelPO(""); setItems([]); setNote(""); }
      else setError(data.error || "Failed to submit GRN");
    } catch(e) { setError(e.message); }
    setSubmitting(false);
  }

  return (
    <div>
      {result && (
        <div style={{background:"#F0FDF4", borderRadius:14, padding:"20px 24px", border:"1px solid #BBF7D0", marginBottom:20}}>
          <div style={{fontSize:15, fontWeight:800, color:"#16a34a", marginBottom:4}}>✅ GRN Submitted — Pending Varinder Approval</div>
          <div style={{fontSize:12, color:"#64748B"}}>GRN Reference: <strong>{result.grnRef}</strong> · Stock will update after approval</div>
          <button onClick={()=>setResult(null)} style={{marginTop:10, padding:"6px 16px", borderRadius:8, border:"1px solid #BBF7D0", background:"#fff", color:"#16a34a", fontSize:12, fontWeight:700, cursor:"pointer"}}>Log Another GRN</button>
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
        {/* GRN Form */}
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", padding:"20px 24px"}}>
          <div style={{fontSize:14, fontWeight:800, color:"#0F172A", marginBottom:16}}>Log Goods Received Note</div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:11, color:"#64748B", fontWeight:600, display:"block", marginBottom:6}}>Select Supplier PO</label>
            <select value={selPO} onChange={e=>selectPO(e.target.value)}
              style={{width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none", background:"#fff"}}>
              <option value="">— Select PO —</option>
              {pos.map(po=><option key={po.id} value={po.id}>{po.id} · {po.supplier} · {fmtRM(po.amount)}</option>)}
            </select>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{fontSize:11, color:"#64748B", fontWeight:600, display:"block", marginBottom:6}}>GRN Date</label>
            <input type="date" value={grnDate} onChange={e=>setGrnDate(e.target.value)}
              style={{width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none"}} />
          </div>

          {items.length > 0 && (
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11, color:"#64748B", fontWeight:600, display:"block", marginBottom:8}}>Items Received</label>
              <div style={{maxHeight:280, overflowY:"auto"}}>
                {items.map((item,i)=>(
                  <div key={item.itemcode} style={{background:i%2===0?"#F8FAFC":"#fff", borderRadius:8, padding:"10px 12px", marginBottom:6, border:"1px solid #E2E8F0"}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6}}>
                      <div>
                        <div style={{fontWeight:700, fontSize:12, color:"#0F172A"}}>{item.itemcode}</div>
                        <div style={{fontSize:11, color:"#64748B"}}>{item.description}</div>
                        <div style={{fontSize:11, color:"#94A3B8"}}>Ordered: {item.ordered} {item.uom}</div>
                      </div>
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                      <div>
                        <div style={{fontSize:10, color:"#94A3B8", marginBottom:3}}>QTY RECEIVED</div>
                        <input type="number" value={item.received} onChange={e=>{const n=[...items];n[i].received=e.target.value;setItems(n);}}
                          placeholder={`max ${item.ordered}`} min="0" max={item.ordered*2}
                          style={{width:"100%", padding:"6px 10px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:12, outline:"none"}} />
                      </div>
                      <div>
                        <div style={{fontSize:10, color:"#94A3B8", marginBottom:3}}>BATCH / LOT NO.</div>
                        <input value={item.batch} onChange={e=>{const n=[...items];n[i].batch=e.target.value;setItems(n);}}
                          placeholder="Optional"
                          style={{width:"100%", padding:"6px 10px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:12, outline:"none"}} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{marginBottom:14}}>
            <label style={{fontSize:11, color:"#64748B", fontWeight:600, display:"block", marginBottom:6}}>Notes (optional)</label>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. 2 bags damaged, short delivery..."
              style={{width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none"}} />
          </div>

          {error && <div style={{background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#DC2626", marginBottom:12}}>{error}</div>}

          <button onClick={submitGRN} disabled={submitting||!selPO}
            style={{width:"100%", padding:"12px", background:submitting||!selPO?"#CBD5E1":"#1E3A5F", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:submitting||!selPO?"not-allowed":"pointer"}}>
            {submitting ? "Submitting..." : "📦 Submit GRN for Approval"}
          </button>
        </div>

        {/* GRN History */}
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", padding:"20px 24px"}}>
          <div style={{fontSize:14, fontWeight:800, color:"#0F172A", marginBottom:16}}>Recent GRNs</div>
          {history.length === 0 ? (
            <div style={{color:"#94A3B8", fontSize:13, textAlign:"center", padding:32}}>No GRNs logged yet</div>
          ) : (
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {history.slice(0,10).map((g,i)=>(
                <div key={i} style={{background:"#F8FAFC", borderRadius:10, padding:"12px 14px", border:"1px solid #E2E8F0"}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700, fontSize:12, color:"#1E3A5F"}}>{g.grnRef || "GRN-"+i}</div>
                      <div style={{fontSize:11, color:"#64748B"}}>PO: {g.poId} · {g.submittedBy}</div>
                      <div style={{fontSize:11, color:"#94A3B8"}}>{fmtDate(g.submittedAt)}</div>
                    </div>
                    <div>
                      {g.approved
                        ? <span style={{fontSize:10, background:"#F0FDF4", color:"#16a34a", padding:"2px 8px", borderRadius:99, fontWeight:700}}>✅ Approved</span>
                        : <span style={{fontSize:10, background:"#FFFBEB", color:"#d97706", padding:"2px 8px", borderRadius:99, fontWeight:700}}>⏳ Pending</span>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STOCK ADJUSTMENT ────────────────────────────────────────────────────────
function StockAdjView({ currentUser }) {
  const [items,     setItems]     = useState([{ itemcode:"", description:"", uom:"KG", bookQty:0, physicalQty:"", reason:"" }]);
  const [adjDate,   setAdjDate]   = useState(new Date().toISOString().slice(0,10));
  const [note,      setNote]      = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const [stockData, setStockData] = useState({});

  useEffect(() => {
    fetch("/api/operations?type=purchase")
      .then(r=>r.json())
      .then(d=>{
        const map = {};
        (d.items||[]).forEach(i=>{ map[i.code]={ balance:i.onHand, uom:i.uom }; });
        setStockData(map);
      }).catch(()=>{});
  }, []);

  function addItem() { setItems([...items, { itemcode:"", description:"", uom:"KG", bookQty:0, physicalQty:"", reason:"" }]); }
  function removeItem(i) { setItems(items.filter((_,idx)=>idx!==i)); }

  function updateItem(i, field, value) {
    const n = [...items];
    n[i][field] = value;
    if (field==="itemcode" && stockData[value]) {
      n[i].bookQty = stockData[value].balance;
      n[i].uom = stockData[value].uom || "KG";
    }
    setItems(n);
  }

  const REASON_OPTIONS = ["Physical Count", "Damaged Goods", "Production Waste", "Sampling", "Data Entry Error", "Other"];

  async function submitAdj() {
    const validItems = items.filter(i=>i.itemcode && i.physicalQty !== "");
    if (!validItems.length) { setError("Enter at least one item with physical qty"); return; }
    if (validItems.some(i=>!i.reason)) { setError("Select a reason for each item"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/procurement?action=stock_adjustment", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ items:validItems, adjDate, note, submittedBy:currentUser?.name }),
      });
      const data = await res.json();
      if (data.success) { setResult(data); setItems([{ itemcode:"", description:"", uom:"KG", bookQty:0, physicalQty:"", reason:"" }]); setNote(""); }
      else setError(data.error || "Failed");
    } catch(e) { setError(e.message); }
    setSubmitting(false);
  }

  return (
    <div>
      {result && (
        <div style={{background:"#F0FDF4", borderRadius:14, padding:"20px 24px", border:"1px solid #BBF7D0", marginBottom:20}}>
          <div style={{fontSize:15, fontWeight:800, color:"#16a34a", marginBottom:4}}>✅ Stock Adjustment Submitted</div>
          <div style={{fontSize:12, color:"#64748B"}}>Reference: <strong>{result.docno}</strong> · Stock updated in SQL Account · Dashboard will refresh in ~1 min</div>
          <button onClick={()=>setResult(null)} style={{marginTop:10, padding:"6px 16px", borderRadius:8, border:"1px solid #BBF7D0", background:"#fff", color:"#16a34a", fontSize:12, fontWeight:700, cursor:"pointer"}}>New Adjustment</button>
        </div>
      )}

      <div style={{background:"#FFFBEB",borderRadius:12,padding:"12px 16px",border:"1px solid #FCD34D",marginBottom:14,fontSize:12,color:"#92400E"}}>
        ℹ️ <strong>When to use:</strong> Only for physical count discrepancies (damaged goods, data entry errors). Routine movements (GRN approvals) update stock automatically.
      </div>
      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", padding:"20px 24px"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <div>
            <div style={{fontSize:14, fontWeight:800, color:"#0F172A"}}>🔧 Manual Stock Correction</div>
            <div style={{fontSize:12, color:"#94A3B8"}}>For physical count discrepancies only — routine stock movements handled automatically via GRN</div>
          </div>
          <input type="date" value={adjDate} onChange={e=>setAdjDate(e.target.value)}
            style={{padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none"}} />
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead><tr style={{background:"#F8FAFC"}}>
              {["Item Code","Description","UOM","Book Qty (SQL)","Physical Count","Variance","Reason",""].map(h=>(
                <th key={h} style={{padding:"8px 10px", textAlign:["Book Qty (SQL)","Physical Count","Variance"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {items.map((item,i)=>{
                const variance = item.physicalQty !== "" ? parseFloat(item.physicalQty||0) - (item.bookQty||0) : null;
                return (
                  <tr key={i} style={{borderTop:"1px solid #F1F5F9"}}>
                    <td style={{padding:"8px 6px"}}>
                      <input value={item.itemcode} onChange={e=>updateItem(i,"itemcode",e.target.value)}
                        placeholder="e.g. CRD-SEED"
                        style={{width:120, padding:"6px 8px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:12, outline:"none"}} />
                    </td>
                    <td style={{padding:"8px 6px"}}>
                      <input value={item.description} onChange={e=>updateItem(i,"description",e.target.value)}
                        placeholder="Description"
                        style={{width:160, padding:"6px 8px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:12, outline:"none"}} />
                    </td>
                    <td style={{padding:"8px 6px"}}>
                      <input value={item.uom} onChange={e=>updateItem(i,"uom",e.target.value)}
                        style={{width:60, padding:"6px 8px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:12, outline:"none"}} />
                    </td>
                    <td style={{padding:"8px 6px", textAlign:"right", fontWeight:600, color:"#64748B"}}>
                      {item.bookQty ? item.bookQty.toLocaleString("en-MY",{maximumFractionDigits:2}) : "—"}
                    </td>
                    <td style={{padding:"8px 6px"}}>
                      <input type="number" value={item.physicalQty} onChange={e=>updateItem(i,"physicalQty",e.target.value)}
                        placeholder="Count"
                        style={{width:90, padding:"6px 8px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:12, outline:"none", textAlign:"right"}} />
                    </td>
                    <td style={{padding:"8px 6px", textAlign:"right", fontWeight:700}}>
                      {variance !== null ? (
                        <span style={{color:variance>0?"#16a34a":variance<0?"#dc2626":"#94A3B8"}}>
                          {variance>0?"+":""}{variance.toLocaleString("en-MY",{maximumFractionDigits:2})}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{padding:"8px 6px"}}>
                      <select value={item.reason} onChange={e=>updateItem(i,"reason",e.target.value)}
                        style={{padding:"6px 8px", borderRadius:6, border:"1px solid #E2E8F0", fontSize:11, outline:"none", background:"#fff"}}>
                        <option value="">— Reason —</option>
                        {REASON_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"8px 6px"}}>
                      <button onClick={()=>removeItem(i)} style={{padding:"4px 8px", borderRadius:6, border:"1px solid #FECACA", background:"#FEF2F2", color:"#dc2626", fontSize:11, cursor:"pointer"}}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, flexWrap:"wrap", gap:10}}>
          <button onClick={addItem} style={{padding:"8px 16px", borderRadius:8, border:"1px dashed #CBD5E1", background:"#F8FAFC", color:"#64748B", fontSize:12, fontWeight:600, cursor:"pointer"}}>
            + Add Item
          </button>
          <div style={{display:"flex", gap:10, alignItems:"center"}}>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes (optional)"
              style={{padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:200}} />
            <button onClick={submitAdj} disabled={submitting}
              style={{padding:"9px 20px", borderRadius:10, border:"none", background:submitting?"#CBD5E1":"#1E3A5F", color:"#fff", fontSize:13, fontWeight:700, cursor:submitting?"not-allowed":"pointer"}}>
              {submitting?"Submitting...":"🔧 Submit to SQL Account"}
            </button>
          </div>
        </div>

        {error && <div style={{background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#DC2626", marginTop:10}}>{error}</div>}
      </div>
    </div>
  );
}

// ─── PAYMENTS ────────────────────────────────────────────────────────────────
function PaymentsView() {
  const [pvs,     setPvs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    fetch("/api/prospects?type=pv_list")
      .then(r=>r.json())
      .then(d=>{ setPvs(d.pvs||[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  const filtered = pvs.filter(p =>
    !search || p.id?.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const totals = pvs.reduce((acc,p)=>({ total:acc.total+(p.amount||0), count:acc.count+1 }),{total:0,count:0});

  if (loading) return <Loader text="Loading payments..." />;

  return (
    <div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
        <KPICard label="Total Payments" value={totals.count} color="#1E3A5F" bg="#EFF6FF" />
        <KPICard label="Total Amount"   value={fmtRM(totals.total)} color="#16a34a" bg="#F0FDF4" />
      </div>
      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Payment Vouchers</div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
            style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:180}} />
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead><tr style={{background:"#F8FAFC"}}>
              {["PV Number","Description","Date","Amount","Method","Journal","Status"].map(h=>(
                <th key={h} style={{padding:"9px 12px", textAlign:["Amount"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={7} style={{padding:32,textAlign:"center",color:"#94A3B8"}}>No payment vouchers found</td></tr>}
              {filtered.map((pv,i)=>(
                <tr key={pv.id} style={{borderTop:"1px solid #F1F5F9", background:i%2===0?"#FAFAFA":"#fff"}}>
                  <td style={{padding:"10px 12px", fontWeight:700, color:"#1E3A5F"}}>{pv.id}</td>
                  <td style={{padding:"10px 12px", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{pv.description}</td>
                  <td style={{padding:"10px 12px", color:"#64748B", whiteSpace:"nowrap"}}>{fmtDate(pv.date)}</td>
                  <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#16a34a"}}>{fmtRM(pv.amount)}</td>
                  <td style={{padding:"10px 12px", color:"#64748B"}}>{pv.paymentMethod||"—"}</td>
                  <td style={{padding:"10px 12px", color:"#64748B"}}>{pv.journal||"—"}</td>
                  <td style={{padding:"10px 12px"}}><StatusBadge status={pv.cancelled?"Cancelled":"Paid"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function KPICard({ label, value, color, bg }) {
  return (
    <div style={{background:bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${color}22`}}>
      <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{label}</div>
      <div style={{fontSize:20, fontWeight:800, color}}>{value}</div>
    </div>
  );
}
function StatusBadge({ status }) {
  const map = {
    "Active":    {bg:"#EFF6FF",color:"#1d4ed8"},
    "Pending":   {bg:"#FFFBEB",color:"#d97706"},
    "Cancelled": {bg:"#FEF2F2",color:"#dc2626"},
    "Complete":  {bg:"#F0FDF4",color:"#16a34a"},
    "Paid":      {bg:"#F0FDF4",color:"#16a34a"},
    "Partial":   {bg:"#FFF7ED",color:"#ea580c"},
  };
  const s = map[status] || {bg:"#F1F5F9",color:"#64748B"};
  return <span style={{fontSize:10, background:s.bg, color:s.color, padding:"2px 8px", borderRadius:99, fontWeight:700, whiteSpace:"nowrap"}}>{status||"—"}</span>;
}
function Loader({ text }) {
  return <div style={{padding:48, textAlign:"center", color:"#94A3B8", fontSize:14}}>{text}</div>;
}
