import React, { useState, useEffect } from "react";
import PurchasePlanView from "./PurchasePlanView";
import CapacityPlanner from "./CapacityPlanner";
import FloorDisplay from "./FloorDisplay";

const fmtRM  = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtQty = (n,u) => `${Number(n||0).toLocaleString("en-MY",{maximumFractionDigits:2})} ${u||""}`.trim();

export default function DemandTab({ soData, ivData, currentUser, initialView }) {
  const [view, setView] = useState(initialView||"schedule");

  const tabBtn = (v,label) => (
    <button onClick={()=>setView(v)} style={{
      padding:"7px 18px", borderRadius:99, border:"none", cursor:"pointer",
      fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:700,
      background: view===v ? "#1E3A5F" : "#F1F5F9",
      color: view===v ? "#fff" : "#64748B",
      whiteSpace:"nowrap", flexShrink:0,
    }}>{label}</button>
  );

  return (
    <div style={{padding:"24px 28px", maxWidth:1280, margin:"0 auto"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:4}}>🏭 Production</div>
          <div style={{fontSize:13, color:"#94A3B8"}}>Production schedule · Stock gap · Real-time purchase requirements</div>
        </div>
        <div style={{display:"flex", gap:6, overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:4}}>
          {tabBtn("schedule", "🏭 Production Schedule")}
          {tabBtn("gap",      "📦 Gap Analysis")}
          {tabBtn("purchase", "🛒 Purchase List")}
          {tabBtn("capacity", "⚙️ Capacity Planner")}
          {tabBtn("floor",    "🖥️ Floor Display")}
        </div>
      </div>

      {view === "schedule" && <ProductionScheduleView />}
      {view === "gap"      && <GapAnalysisView />}
      {view === "purchase" && <PurchaseListView />}
      {view === "capacity" && <CapacityPlanner />}
      {view === "floor"    && <FloorDisplay />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────
function ProductionScheduleView() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch("/api/operations?type=production")
      .then(r=>r.json())
      .then(d=>{ setData(d); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  if (loading) return <Loader text="Building production schedule..." />;
  if (!data)   return <Err text="Failed to load production schedule" />;

  const { products, totals, phasedOut, meta } = data;

  // Sort by delivery date, no date goes last ranked by customer frequency
  const sorted = [...products].sort((a,b) => {
    const da = earliestDelivery(a.orders);
    const db = earliestDelivery(b.orders);
    if (da && db) return new Date(da) - new Date(db);
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  const filtered = sorted.filter(p =>
    !search ||
    p.description.toLowerCase().includes(search.toLowerCase()) ||
    p.itemCode.toLowerCase().includes(search.toLowerCase()) ||
    (p.orders||[]).some(o=>(o.customer||'').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* KPI strip */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
        {[
          {label:"Products to Make",  value:products.length,              color:"#1E3A5F", bg:"#EFF6FF"},
          {label:"Total Revenue",      value:fmtRM(totals.revenue),        color:"#1d4ed8", bg:"#EFF6FF"},
          {label:"Raw Mat Cost",       value:fmtRM(totals.rawCost),        color:"#dc2626", bg:"#FEF2F2"},
          {label:"Gross Profit",       value:fmtRM(totals.grossProfit),    color:"#16a34a", bg:"#F0FDF4"},
          {label:"Margin",             value:`${(totals.margin||0).toFixed(1)}%`, color:totals.margin>30?"#16a34a":totals.margin>15?"#d97706":"#dc2626", bg:"#F8FAFC"},
          {label:"Phased Out",         value:phasedOut?.length||0,         color:"#94A3B8", bg:"#F8FAFC"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${c.color}22`}}>
            <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:18, fontWeight:800, color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
          <div>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Production Schedule — sorted by delivery date</div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>
              {meta?.snapshotActive||0} from backlog · {meta?.fromPoIntake||0} from PO intake · click row for ingredient details
            </div>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product or customer..."
            style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:220}} />
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                {["Priority","Product","Customer(s)","Qty","Revenue","Raw Cost","Margin","Delivery","Days","Source",""].map(h=>(
                  <th key={h} style={{padding:"9px 12px", textAlign:["Revenue","Raw Cost","Margin"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i) => {
                const isExp = expanded === p.itemCode;
                const delivery = earliestDelivery(p.orders);
                const daysLeft = delivery ? Math.floor((new Date(delivery)-new Date())/(1000*60*60*24)) : null;
                const customers = [...new Set((p.orders||[]).map(o=>o.customer||o.customerName).filter(Boolean))];
                const urgent = daysLeft !== null && daysLeft <= 3;
                const overdue = daysLeft !== null && daysLeft < 0;
                return (
                  <React.Fragment key={p.itemCode}>
                    <tr onClick={()=>setExpanded(isExp?null:p.itemCode)}
                      style={{borderTop:"1px solid #F1F5F9", background:overdue?"#FFF5F5":urgent?"#FFFBEB":isExp?"#F0F9FF":i%2===0?"#FAFAFA":"#fff", cursor:"pointer"}}>
                      <td style={{padding:"10px 12px"}}>
                        <div style={{width:26, height:26, borderRadius:"50%", background:overdue?"#EF4444":urgent?"#F59E0B":"#1E3A5F", color:"#fff", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center"}}>{i+1}</div>
                      </td>
                      <td style={{padding:"10px 12px"}}>
                        <div style={{fontWeight:700, color:"#0F172A"}}>{p.description}</div>
                        <div style={{fontSize:10, color:"#94A3B8", marginTop:2, display:"flex", gap:5, alignItems:"center"}}>
                          <code style={{background:"#F1F5F9", padding:"1px 5px", borderRadius:3}}>{p.itemCode}</code>
                          <span>· {p.soCount} SO{p.soCount>1?"s":""}</span>
                        </div>
                      </td>
                      <td style={{padding:"10px 12px", maxWidth:180, fontSize:11}}>
                        {customers.slice(0,2).map(c=>(
                          <div key={c} style={{fontWeight:500, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{c}</div>
                        ))}
                        {customers.length>2 && <div style={{fontSize:10, color:"#94A3B8"}}>+{customers.length-2} more</div>}
                      </td>
                      <td style={{padding:"10px 12px", fontWeight:700}}>{(p.totalQty||0).toLocaleString()}</td>
                      <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#1d4ed8"}}>{fmtRM(p.revenue)}</td>
                      <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:p.bomMissing?"#94A3B8":"#dc2626"}}>
                        {p.bomMissing ? "—" : fmtRM(p.totalRawCost)}
                      </td>
                      <td style={{padding:"10px 12px", textAlign:"right"}}>
                        {p.bomMissing ? <span style={{color:"#94A3B8"}}>—</span> :
                          <span style={{fontWeight:700, color:p.margin>30?"#16a34a":p.margin>15?"#d97706":"#dc2626"}}>{p.margin?.toFixed(1)}%</span>}
                      </td>
                      <td style={{padding:"10px 12px", whiteSpace:"nowrap", color:overdue?"#dc2626":urgent?"#d97706":"#64748B", fontWeight:overdue||urgent?700:400}}>
                        {delivery ? new Date(delivery).toLocaleDateString("en-MY",{day:"2-digit",month:"short"}) : <span style={{color:"#CBD5E1"}}>No date</span>}
                      </td>
                      <td style={{padding:"10px 12px"}}>
                        {daysLeft!==null ? (
                          <span style={{fontSize:11, fontWeight:700, color:overdue?"#dc2626":urgent?"#d97706":"#64748B"}}>
                            {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft===0 ? "Today" : `${daysLeft}d`}
                          </span>
                        ) : <span style={{color:"#CBD5E1", fontSize:11}}>—</span>}
                      </td>
                      <td style={{padding:"10px 12px"}}>
                        {p.source==='po_intake' && <span style={{background:"#DBEAFE", color:"#1d4ed8", padding:"2px 7px", borderRadius:99, fontSize:9, fontWeight:700}}>PO INTAKE</span>}
                        {p.source==='snapshot' && <span style={{background:"#F1F5F9", color:"#64748B", padding:"2px 7px", borderRadius:99, fontSize:9, fontWeight:700}}>BACKLOG</span>}
                        {p.source==='both' && <span style={{background:"#F0FDF4", color:"#16a34a", padding:"2px 7px", borderRadius:99, fontSize:9, fontWeight:700}}>MERGED</span>}
                      </td>
                      <td style={{padding:"10px 12px", color:"#94A3B8", fontSize:11}}>{isExp?"▲":"▼"}</td>
                    </tr>
                    {isExp && (
                      <tr><td colSpan={11} style={{padding:"0 0 12px 50px", background:"#F8FAFC"}}>
                        {p.bomMissing ? (
                          <div style={{padding:"12px", color:"#94A3B8", fontSize:12}}>⚠️ No BOM found for {p.itemCode} — cannot calculate ingredient requirements</div>
                        ) : (
                          <div style={{paddingTop:10}}>
                            <div style={{fontSize:11, fontWeight:700, color:"#475569", marginBottom:8}}>
                              Ingredients needed for {(p.totalQty||0).toLocaleString()} × {p.description}
                              {p.multiplier>1 && <span style={{color:"#d97706", marginLeft:8, fontWeight:400}}>(1 {p.orderedUom} = {p.multiplier} BOM units → {(p.bomUnits||0).toLocaleString()} total)</span>}
                            </div>
                            <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
                              <thead><tr style={{background:"#F1F5F9"}}>
                                {["Ingredient","Qty per Unit","Total Needed","Ref Cost/Unit","Total Cost"].map(h=>(
                                  <th key={h} style={{padding:"6px 10px", textAlign:["Total Needed","Ref Cost/Unit","Total Cost"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase"}}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {(p.rawMaterials||[]).sort((a,b)=>b.totalCost-a.totalCost).map((r,ri)=>(
                                  <tr key={ri} style={{borderTop:"1px solid #E2E8F0", background:ri%2===0?"#fff":"#FAFAFA"}}>
                                    <td style={{padding:"6px 10px"}}><code style={{background:"#E2E8F0", padding:"1px 5px", borderRadius:3}}>{r.code}</code></td>
                                    <td style={{padding:"6px 10px"}}>{fmtQty(r.qtyPerUnit, r.uom)}</td>
                                    <td style={{padding:"6px 10px", textAlign:"right", fontWeight:600}}>{fmtQty(r.totalQty, r.uom)}</td>
                                    <td style={{padding:"6px 10px", textAlign:"right", color:"#64748B"}}>RM {(r.refCostPerUnit||0).toFixed(3)}</td>
                                    <td style={{padding:"6px 10px", textAlign:"right", fontWeight:700, color:"#dc2626"}}>{fmtRM(r.totalCost)}</td>
                                  </tr>
                                ))}
                                <tr style={{borderTop:"2px solid #E2E8F0", background:"#FEF2F2"}}>
                                  <td colSpan={4} style={{padding:"8px 10px", fontWeight:800}}>Total Raw Material Cost</td>
                                  <td style={{padding:"8px 10px", textAlign:"right", fontWeight:800, color:"#dc2626", fontSize:13}}>{fmtRM(p.totalRawCost)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        {/* Orders breakdown */}
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:11, fontWeight:700, color:"#475569", marginBottom:6}}>SOs included in this production run:</div>
                          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                            {(p.orders||[]).map((o,oi)=>(
                              <div key={oi} style={{background:"#fff", border:"1px solid #E2E8F0", borderRadius:8, padding:"6px 10px", fontSize:11}}>
                                <div style={{fontWeight:700, color:"#1E3A5F"}}>{o.soNo||o.customer}</div>
                                <div style={{color:"#94A3B8"}}>{o.customer} · {(o.qty||0).toLocaleString()} {o.uom}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phased out */}
      {phasedOut?.length > 0 && (
        <div style={{marginTop:12, background:"#F8FAFC", borderRadius:12, padding:"12px 16px", border:"1px solid #E2E8F0"}}>
          <div style={{fontSize:11, fontWeight:700, color:"#94A3B8", marginBottom:6}}>✅ {phasedOut.length} products phased out (all SOs completed in SQL Account)</div>
          <div style={{fontSize:11, color:"#CBD5E1"}}>{phasedOut.map(p=>p.itemCode).join(" · ")}</div>
        </div>
      )}

      {meta && (
        <div style={{marginTop:8, padding:"10px 14px", background:"#F8FAFC", borderRadius:10, fontSize:11, color:"#94A3B8", display:"flex", gap:16, flexWrap:"wrap"}}>
          <span>🔄 {new Date(meta.updatedAt).toLocaleString("en-MY")}</span>
          <span>📦 Backlog: {meta.snapshotActive} active · {meta.snapshotPhasedOut} phased out</span>
          <span>📥 PO Intake: {meta.fromPoIntake} products</span>
          <span>🔗 Total: {meta.merged} in plan</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GAP ANALYSIS — Finished Goods vs Stock
// ─────────────────────────────────────────────────────────────────────────────
function GapAnalysisView() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [tab,      setTab]      = useState("fg"); // fg | rm

  useEffect(() => {
    fetch("/api/operations?type=gap")
      .then(r=>r.json())
      .then(d=>{ setData(d); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  if (loading) return <Loader text="Analysing stock vs demand..." />;
  if (!data)   return <Err text="Failed to load gap analysis" />;

  const { fgGap, rmGap, summary } = data;

  const subBtn = (v,label) => (
    <button onClick={()=>setTab(v)} style={{
      padding:"6px 16px", borderRadius:99, border:"none", cursor:"pointer",
      fontSize:11, fontWeight:700,
      background:tab===v?"#1E3A5F":"#F1F5F9",
      color:tab===v?"#fff":"#64748B",
    }}>{label}</button>
  );

  return (
    <div>
      {/* KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
        {[
          {label:"Products Required",  value:summary.totalFG,       color:"#1E3A5F", bg:"#EFF6FF"},
          {label:"Can Fulfil",          value:summary.canFulfil,     color:"#16a34a", bg:"#F0FDF4"},
          {label:"Cannot Fulfil",       value:summary.cannotFulfil,  color:"#dc2626", bg:"#FEF2F2"},
          {label:"Raw Mat Shortages",   value:summary.rmShort,       color:"#d97706", bg:"#FFFBEB"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${c.color}22`}}>
            <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:24, fontWeight:800, color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex", gap:8, marginBottom:12}}>
        {subBtn("fg", `📦 Finished Goods Gap (${fgGap.length})`)}
        {subBtn("rm", `🧪 Raw Material Gap (${rmGap.length})`)}
      </div>

      {/* Finished Goods Gap */}
      {tab==="fg" && (
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
          <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9", background:"#FFFBEB"}}>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Finished Goods — Required vs Stock</div>
            <div style={{fontSize:11, color:"#92400E", marginTop:2}}>
              Stock from SQL Account · Updated: {summary.stockUpdatedAt ? new Date(summary.stockUpdatedAt).toLocaleString("en-MY") : "—"}
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["Product","Customer(s)","Required","In Stock","Gap","Coverage","Delivery","Status",""].map(h=>(
                    <th key={h} style={{padding:"9px 12px", textAlign:["Required","In Stock","Gap","Coverage"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fgGap.map((p,i) => {
                  const isExp = expanded===p.itemCode;
                  return (
                    <React.Fragment key={p.itemCode}>
                      <tr onClick={()=>setExpanded(isExp?null:p.itemCode)}
                        style={{borderTop:"1px solid #F1F5F9", background:!p.canFulfil?"#FFF5F5":i%2===0?"#FAFAFA":"#fff", cursor:"pointer"}}>
                        <td style={{padding:"10px 12px"}}>
                          <div style={{fontWeight:700}}>{p.description}</div>
                          <code style={{fontSize:10, color:"#94A3B8", background:"#F1F5F9", padding:"1px 4px", borderRadius:3}}>{p.itemCode}</code>
                        </td>
                        <td style={{padding:"10px 12px", fontSize:11, maxWidth:180}}>
                          {p.customers.slice(0,2).map(c=><div key={c} style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{c}</div>)}
                          {p.customers.length>2 && <div style={{color:"#94A3B8"}}>+{p.customers.length-2} more</div>}
                        </td>
                        <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700}}>{p.required.toLocaleString()}</td>
                        <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:p.onHand<0?"#dc2626":p.onHand>0?"#16a34a":"#94A3B8"}}>
                          {p.onHand.toLocaleString()}
                        </td>
                        <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:p.gap>0?"#dc2626":"#16a34a"}}>
                          {p.gap>0 ? `-${p.gap.toLocaleString()}` : "✓"}
                        </td>
                        <td style={{padding:"10px 12px", textAlign:"right"}}>
                          <div style={{display:"flex", alignItems:"center", justifyContent:"flex-end", gap:6}}>
                            <div style={{width:50, height:6, background:"#F1F5F9", borderRadius:99, overflow:"hidden"}}>
                              <div style={{height:"100%", borderRadius:99, background:p.pct>=100?"#16a34a":p.pct>=50?"#d97706":"#dc2626", width:`${Math.min(p.pct,100)}%`}}/>
                            </div>
                            <span style={{fontSize:11, fontWeight:700, color:p.pct>=100?"#16a34a":p.pct>=50?"#d97706":"#dc2626"}}>{p.pct}%</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 12px", fontSize:11, color:p.daysLeft<0?"#dc2626":p.daysLeft<=3?"#d97706":"#64748B", fontWeight:p.daysLeft<=3?700:400, whiteSpace:"nowrap"}}>
                          {p.nextDelivery ? new Date(p.nextDelivery).toLocaleDateString("en-MY",{day:"2-digit",month:"short"}) : "—"}
                          {p.daysLeft!==null && <span style={{marginLeft:4}}>({p.daysLeft<0?`${Math.abs(p.daysLeft)}d overdue`:p.daysLeft===0?"today":`${p.daysLeft}d`})</span>}
                        </td>
                        <td style={{padding:"10px 12px"}}>
                          {p.canFulfil
                            ? <span style={{fontSize:10, background:"#F0FDF4", color:"#16a34a", padding:"2px 8px", borderRadius:99, fontWeight:700}}>✅ OK</span>
                            : <span style={{fontSize:10, background:"#FEF2F2", color:"#dc2626", padding:"2px 8px", borderRadius:99, fontWeight:700}}>❌ Produce</span>
                          }
                        </td>
                        <td style={{padding:"10px 12px", color:"#94A3B8", fontSize:11}}>{isExp?"▲":"▼"}</td>
                      </tr>
                      {isExp && (
                        <tr><td colSpan={9} style={{padding:"8px 40px 12px", background:"#F8FAFC", fontSize:11, color:"#475569"}}>
                          <strong>{p.orders} SO{p.orders>1?"s":""}</strong> · Revenue: <strong>{fmtRM(p.revenue)}</strong>
                          {p.gap>0 && <span style={{color:"#dc2626", marginLeft:8}}>Need to produce <strong>{p.gap.toLocaleString()}</strong> units</span>}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw Material Gap */}
      {tab==="rm" && (
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
          <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9", background:"#FFF5F5"}}>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Raw Materials — Required to Produce vs Stock</div>
            <div style={{fontSize:11, color:"#dc2626", marginTop:2}}>Only shows materials needed for products that cannot be fulfilled from finished goods stock</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["Raw Material","Needed","In Stock","Gap to Buy","Coverage","Est. Cost","Used In","Status"].map(h=>(
                    <th key={h} style={{padding:"9px 12px", textAlign:["Needed","In Stock","Gap to Buy","Coverage","Est. Cost"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rmGap.map((r,i)=>(
                  <tr key={r.code} style={{borderTop:"1px solid #F1F5F9", background:r.status==="short"?"#FFF5F5":r.status==="low"?"#FFFBEB":i%2===0?"#FAFAFA":"#fff"}}>
                    <td style={{padding:"10px 12px"}}><code style={{background:"#F1F5F9", padding:"2px 7px", borderRadius:4, fontWeight:700}}>{r.code}</code></td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700}}>{fmtQty(r.needed, r.uom)}</td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:r.onHand<0?"#dc2626":r.onHand>0?"#16a34a":"#94A3B8"}}>{fmtQty(r.onHand, r.uom)}</td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:r.status==="short"?"#dc2626":"#16a34a"}}>
                      {r.status==="short" ? fmtQty(r.gap, r.uom) : "—"}
                    </td>
                    <td style={{padding:"10px 12px", textAlign:"right"}}>
                      <span style={{fontWeight:700, color:r.pct>=100?"#16a34a":r.pct>=50?"#d97706":"#dc2626"}}>{Math.min(r.pct,100)}%</span>
                    </td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#dc2626"}}>{r.status==="short"?fmtRM(r.totalCost):"—"}</td>
                    <td style={{padding:"10px 12px", fontSize:11, color:"#64748B"}}>{r.usedIn.slice(0,3).join(", ")}{r.usedIn.length>3?` +${r.usedIn.length-3}`:""}</td>
                    <td style={{padding:"10px 12px"}}>
                      {r.status==="short" && <span style={{fontSize:10, background:"#FEF2F2", color:"#dc2626", padding:"2px 8px", borderRadius:99, fontWeight:700}}>🚨 Short</span>}
                      {r.status==="low"   && <span style={{fontSize:10, background:"#FFFBEB", color:"#d97706", padding:"2px 8px", borderRadius:99, fontWeight:700}}>⚠️ Low</span>}
                      {r.status==="ok"    && <span style={{fontSize:10, background:"#F0FDF4", color:"#16a34a", padding:"2px 8px", borderRadius:99, fontWeight:700}}>✅ OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE LIST — Real-time, net of stock
// ─────────────────────────────────────────────────────────────────────────────
function PurchaseListView() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("all"); // all | buy | sufficient

  useEffect(() => {
    fetch("/api/operations?type=purchase")
      .then(r=>r.json())
      .then(d=>{ setData(d); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  if (loading) return <Loader text="Calculating purchase requirements..." />;
  if (!data)   return <Err text="Failed to load purchase list" />;

  const { items, totals, stockUpdatedAt } = data;

  const filtered = items.filter(item => {
    const matchSearch = !search || item.code.toLowerCase().includes(search.toLowerCase());
    if (filter==="buy")       return matchSearch && item.status!=="sufficient";
    if (filter==="sufficient") return matchSearch && item.status==="sufficient";
    return matchSearch;
  });

  const statusColor = s => s==="critical"?"#dc2626":s==="buy"?"#d97706":"#16a34a";
  const statusBg    = s => s==="critical"?"#FEF2F2":s==="buy"?"#FFFBEB":"#F0FDF4";
  const statusLabel = s => s==="critical"?"🚨 Critical":s==="buy"?"⚠️ Buy":"✅ Sufficient";

  return (
    <div>
      {/* KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
        {[
          {label:"Total Raw Materials", value:totals.totalItems,                    color:"#1E3A5F", bg:"#EFF6FF"},
          {label:"🚨 Critical",          value:totals.critical,                      color:"#dc2626", bg:"#FEF2F2"},
          {label:"⚠️ Need to Buy",       value:totals.toBuy,                         color:"#d97706", bg:"#FFFBEB"},
          {label:"Est. Purchase Cost",   value:fmtRM(totals.estTotalCost),           color:"#dc2626", bg:"#FEF2F2"},
          {label:"✅ Sufficient",         value:totals.sufficient,                    color:"#16a34a", bg:"#F0FDF4"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${c.color}22`}}>
            <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:18, fontWeight:800, color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{padding:"12px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
          <div>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Real-time Purchase Requirements</div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>
              BOM exploded from all active SOs · Net of current stock · Stock as at: {stockUpdatedAt ? new Date(stockUpdatedAt).toLocaleString("en-MY") : "—"}
            </div>
          </div>
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <div style={{display:"flex", gap:4}}>
              {[["all","All"],["buy","Need to Buy"],["sufficient","Sufficient"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFilter(v)} style={{padding:"5px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:filter===v?"#1E3A5F":"#F1F5F9", color:filter===v?"#fff":"#64748B"}}>{l}</button>
              ))}
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
              style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:160}} />
          </div>
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                {["#","Raw Material","Required","In Stock","Net to Buy","Coverage","Est. Cost","Used In","Status"].map(h=>(
                  <th key={h} style={{padding:"9px 12px", textAlign:["Required","In Stock","Net to Buy","Coverage","Est. Cost"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item,i)=>(
                <tr key={item.code} style={{borderTop:"1px solid #F1F5F9", background:item.status==="critical"?"#FFF5F5":item.status==="buy"?"#FFFDF0":i%2===0?"#FAFAFA":"#fff"}}>
                  <td style={{padding:"10px 12px", color:"#94A3B8", fontWeight:700, fontSize:11}}>{i+1}</td>
                  <td style={{padding:"10px 12px"}}>
                    <code style={{background:"#F1F5F9", padding:"2px 7px", borderRadius:4, fontWeight:700, fontSize:12}}>{item.code}</code>
                    <span style={{fontSize:10, color:"#94A3B8", marginLeft:6}}>{item.uom}</span>
                  </td>
                  <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700}}>{fmtQty(item.needed, item.uom)}</td>
                  <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:item.onHand<0?"#dc2626":item.onHand>0?"#16a34a":"#94A3B8"}}>
                    {fmtQty(item.onHand, item.uom)}
                    {item.onHand<0 && <span style={{fontSize:10, marginLeft:4, color:"#dc2626"}}>(over-committed)</span>}
                  </td>
                  <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:statusColor(item.status), fontSize:13}}>
                    {item.status==="sufficient" ? "—" : fmtQty(item.netBuy, item.uom)}
                  </td>
                  <td style={{padding:"10px 12px", textAlign:"right"}}>
                    <div style={{display:"flex", alignItems:"center", justifyContent:"flex-end", gap:6}}>
                      <div style={{width:50, height:6, background:"#F1F5F9", borderRadius:99, overflow:"hidden"}}>
                        <div style={{height:"100%", background:item.coverage>=100?"#16a34a":item.coverage>=50?"#d97706":"#dc2626", width:`${item.coverage}%`, borderRadius:99}}/>
                      </div>
                      <span style={{fontSize:11, fontWeight:700, color:item.coverage>=100?"#16a34a":item.coverage>=50?"#d97706":"#dc2626"}}>{item.coverage}%</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:item.status==="sufficient"?"#94A3B8":"#dc2626"}}>
                    {item.status==="sufficient" ? "—" : fmtRM(item.estCost)}
                  </td>
                  <td style={{padding:"10px 12px", fontSize:11, color:"#64748B"}}>
                    {item.usedIn.slice(0,3).join(", ")}{item.usedIn.length>3?` +${item.usedIn.length-3}`:""}
                  </td>
                  <td style={{padding:"10px 12px"}}>
                    <span style={{fontSize:10, background:statusBg(item.status), color:statusColor(item.status), padding:"2px 8px", borderRadius:99, fontWeight:700, whiteSpace:"nowrap"}}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{background:"#FEF2F2", borderTop:"2px solid #FECACA"}}>
                <td colSpan={6} style={{padding:"10px 12px", fontWeight:800, fontSize:13}}>TOTAL ESTIMATED PURCHASE COST</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#dc2626", fontSize:14}}>{fmtRM(totals.estTotalCost)}</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{marginTop:8, fontSize:11, color:"#94A3B8"}}>
        * Stock balances from SQL Account via stockanalysis · Updated every 30 minutes · Negative balance = over-committed beyond receipts
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function earliestDelivery(orders) {
  if (!orders?.length) return null;
  const dates = orders
    .map(o => o.deliveryDate || o.delivery || '')
    .filter(d => d && d.match(/\d{4}-\d{2}-\d{2}/))
    .sort();
  return dates[0] || null;
}

function Loader({ text }) {
  return <div style={{padding:48, textAlign:"center", color:"#94A3B8", fontSize:14}}>{text || "Loading..."}</div>;
}
function Err({ text }) {
  return <div style={{padding:48, textAlign:"center", color:"#EF4444", fontSize:14}}>❌ {text}</div>;
}

// Keep PRODUCT_SNAPSHOT for fallback
const PRODUCT_SNAPSHOT = [];
