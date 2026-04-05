import React, { useState, useEffect } from "react";

const fmtRM  = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtQty = (n,u) => `${Number(n||0).toLocaleString("en-MY",{maximumFractionDigits:3})} ${u||""}`.trim();

export default function PurchasePlanView() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [tab,      setTab]      = useState("rawmat");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch("/api/purchase-plan")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <Centered><Spinner /><p style={{color:"#94A3B8",marginTop:12}}>Loading purchase plan...</p></Centered>;
  if (error)   return <Centered><p style={{color:"#EF4444"}}>❌ {error}</p></Centered>;
  if (!data || data.empty) return (
    <Centered>
      <p style={{fontSize:32}}>📋</p>
      <p style={{color:"#475569",fontWeight:600}}>No purchase plan data yet</p>
      <p style={{fontSize:13,color:"#94A3B8"}}>Run <code>node seedPurchasePlan.js</code> on the server to load data.</p>
    </Centered>
  );

  const { rawMaterials, customerSummary, totals, meta } = data;

  const filteredRM = (rawMaterials||[]).filter(r =>
    !search ||
    r.RM_Code.toLowerCase().includes(search.toLowerCase()) ||
    (r.RM_Description||"").toLowerCase().includes(search.toLowerCase())
  );

  const filteredCust = (customerSummary||[]).filter(r =>
    !search || (r.Customer||"").toLowerCase().includes(search.toLowerCase())
  );

  const subBtn = (v, label) => (
    <button onClick={()=>setTab(v)} style={{
      padding:"6px 16px", borderRadius:99, border:"none", cursor:"pointer",
      fontSize:11, fontWeight:700,
      background: tab===v ? "#1E3A5F" : "#F1F5F9",
      color: tab===v ? "#fff" : "#64748B",
    }}>{label}</button>
  );

  return (
    <div>
      {/* Item #9 — RM price note */}
      <div style={{padding:"10px 16px", background:"#FFFBEB", borderRadius:10,
        border:"1px solid #FCD34D", fontSize:12, color:"#92400E", marginBottom:14,
        display:"flex", alignItems:"center", gap:8}}>
        <span>ℹ️</span>
        <span><strong>Reference prices only.</strong> Raw material costs shown are seeded manually in the BOM
        and do <strong>not</strong> auto-update when new supplier POs are raised.
        To update a price, edit the BOM component cost in SQL Account.</span>
      </div>
      {/* -- KPI strip -- */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:16}}>
        {[
          { label:"Outstanding SOs",    value: totals.SO_Count || 20,                     color:"#1E3A5F", bg:"#EFF6FF" },
          { label:"Total Revenue",       value: fmtRM(totals.Total_Revenue),               color:"#1d4ed8", bg:"#EFF6FF" },
          { label:"Total Purchase Cost", value: fmtRM(totals.Total_Purchase_Cost),         color:"#dc2626", bg:"#FEF2F2" },
          { label:"Gross Profit",        value: fmtRM(totals.Total_Gross_Profit),          color:"#16a34a", bg:"#F0FDF4" },
          { label:"Gross Margin",        value: `${Number(totals.Overall_Margin_pct||0).toFixed(1)}%`,
            color: totals.Overall_Margin_pct>30?"#16a34a":totals.Overall_Margin_pct>15?"#d97706":"#dc2626",
            bg:"#F8FAFC" },
        ].map(c=>(
          <div key={c.label} style={{background:c.bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${c.color}22`}}>
            <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:18, fontWeight:800, color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* -- Sub-tabs + search -- */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <div style={{display:"flex", gap:6, overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:2, flexShrink:0}}>
          {subBtn("rawmat",  `🧪 Purchase List (${(rawMaterials||[]).length})`)}
          {subBtn("byso",    `👤 By Customer (${(customerSummary||[]).length})`)}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          {meta && <span style={{fontSize:11, color:"#94A3B8"}}>As at: {new Date(meta.updatedAt).toLocaleDateString("en-MY")} · {meta.fileName}</span>}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..."
            style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:180}} />
        </div>
      </div>

      {/* -- PURCHASE LIST TAB -- */}
      {tab === "rawmat" && (
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
          <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9", background:"#FFFBEB", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <div>
              <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>🧪 Raw Materials to Purchase</div>
              <div style={{fontSize:11, color:"#92400E", marginTop:2}}>
                Consolidated across all 20 SOs · sorted by spend · assumes zero starting stock
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11, color:"#94A3B8"}}>Total to spend</div>
              <div style={{fontSize:18, fontWeight:800, color:"#dc2626"}}>{fmtRM(totals.Total_Purchase_Cost)}</div>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["#","Code","Description","Total Qty","UOM","Cost per Unit","Total Cost"].map(h=>(
                    <th key={h} style={{
                      padding:"9px 14px",
                      textAlign:["Total Qty","Cost per Unit","Total Cost"].includes(h)?"right":"left",
                      fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase",
                      letterSpacing:"0.06em", whiteSpace:"nowrap"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRM.map((r,i) => {
                  const refCost = r.Total_Qty > 0 ? r.Total_Cost / r.Total_Qty : 0;
                  const isZero  = r.Total_Cost === 0;
                  return (
                    <tr key={r.RM_Code + i}
                      style={{borderTop:"1px solid #F1F5F9", background: isZero?"#FFFBEB": i%2===0?"#FAFAFA":"#fff"}}>
                      <td style={{padding:"9px 14px", color:"#94A3B8", fontSize:11, fontWeight:700}}>{i+1}</td>
                      <td style={{padding:"9px 14px"}}>
                        <code style={{background:"#F1F5F9", padding:"2px 7px", borderRadius:4, fontSize:11, fontWeight:700}}>{r.RM_Code}</code>
                      </td>
                      <td style={{padding:"9px 14px", color:"#0F172A"}}>{r.RM_Description}</td>
                      <td style={{padding:"9px 14px", textAlign:"right", fontWeight:800, fontSize:13, color:"#1E3A5F"}}>
                        {Number(r.Total_Qty||0).toLocaleString("en-MY",{maximumFractionDigits:3})}
                      </td>
                      <td style={{padding:"9px 14px"}}>
                        <span style={{background:"#E2E8F0", padding:"2px 8px", borderRadius:99, fontSize:11}}>{r.RM_UOM}</span>
                      </td>
                      <td style={{padding:"9px 14px", textAlign:"right", color:"#64748B"}}>
                        {isZero ? <span style={{color:"#F59E0B"}}>⚠️ No cost</span> : `RM ${refCost.toFixed(3)}`}
                      </td>
                      <td style={{padding:"9px 14px", textAlign:"right", fontWeight:700,
                        color: isZero ? "#F59E0B" : "#dc2626", fontSize: 13}}>
                        {isZero ? "—" : fmtRM(r.Total_Cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{background:"#FEF2F2", borderTop:"2px solid #FECACA"}}>
                  <td colSpan={6} style={{padding:"10px 14px", fontWeight:800, color:"#0F172A", fontSize:13}}>
                    TOTAL PURCHASE COST
                  </td>
                  <td style={{padding:"10px 14px", textAlign:"right", fontWeight:800, color:"#dc2626", fontSize:15}}>
                    {fmtRM(totals.Total_Purchase_Cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* -- BY CUSTOMER TAB -- */}
      {tab === "byso" && (
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
          <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9"}}>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>👤 Profitability by Customer</div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>Revenue, purchase cost and gross profit per customer</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["Customer","Revenue","Purchase Cost","Gross Profit","Margin"].map(h=>(
                    <th key={h} style={{
                      padding:"9px 14px",
                      textAlign:["Revenue","Purchase Cost","Gross Profit","Margin"].includes(h)?"right":"left",
                      fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase",
                      letterSpacing:"0.06em", whiteSpace:"nowrap"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCust.sort((a,b)=>b.Revenue-a.Revenue).map((r,i)=>{
                  const margin = r.Margin_pct || (r.Revenue > 0 ? ((r.Revenue - r.Purchase_Cost)/r.Revenue*100) : 0);
                  const profit = r.Gross_Profit || (r.Revenue - r.Purchase_Cost);
                  return (
                    <tr key={r.Customer}
                      style={{borderTop:"1px solid #F1F5F9", background:i%2===0?"#FAFAFA":"#fff"}}>
                      <td style={{padding:"10px 14px", fontWeight:600, maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                        {r.Customer}
                      </td>
                      <td style={{padding:"10px 14px", textAlign:"right", fontWeight:700, color:"#1d4ed8"}}>
                        {fmtRM(r.Revenue)}
                      </td>
                      <td style={{padding:"10px 14px", textAlign:"right", fontWeight:700, color:"#dc2626"}}>
                        {fmtRM(r.Purchase_Cost)}
                      </td>
                      <td style={{padding:"10px 14px", textAlign:"right", fontWeight:700,
                        color:profit>=0?"#16a34a":"#dc2626"}}>
                        {fmtRM(profit)}
                      </td>
                      <td style={{padding:"10px 14px", textAlign:"right"}}>
                        <span style={{
                          fontWeight:700, fontSize:13,
                          color:margin>40?"#16a34a":margin>20?"#d97706":"#dc2626"
                        }}>{Number(margin).toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{background:"#F0FDF4", borderTop:"2px solid #BBF7D0"}}>
                  <td style={{padding:"10px 14px", fontWeight:800, fontSize:13}}>TOTAL</td>
                  <td style={{padding:"10px 14px", textAlign:"right", fontWeight:800, color:"#1d4ed8", fontSize:13}}>{fmtRM(totals.Total_Revenue)}</td>
                  <td style={{padding:"10px 14px", textAlign:"right", fontWeight:800, color:"#dc2626", fontSize:13}}>{fmtRM(totals.Total_Purchase_Cost)}</td>
                  <td style={{padding:"10px 14px", textAlign:"right", fontWeight:800, color:"#16a34a", fontSize:13}}>{fmtRM(totals.Total_Gross_Profit)}</td>
                  <td style={{padding:"10px 14px", textAlign:"right", fontWeight:800, color:"#16a34a", fontSize:13}}>{Number(totals.Overall_Margin_pct||0).toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Centered({children}) {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:60,textAlign:"center"}}>{children}</div>;
}
function Spinner() {
  return <div style={{width:28,height:28,border:"3px solid #E2E8F0",borderTop:"3px solid #2563eb",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />;
}
