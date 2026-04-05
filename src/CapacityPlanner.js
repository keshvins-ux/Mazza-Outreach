import React, { useState, useEffect } from "react";

// --- MACHINE DEFINITIONS -----------------------------------------------------
const MACHINES = {
  "WFJ-20":  { name:"WFJ-20",  type:"Fine Grinder",       color:"#1d4ed8", bg:"#EFF6FF", rate:56.0,  batchKg:200 },
  "WFC-500": { name:"WFC-500", type:"Coarse Grinder",      color:"#7c3aed", bg:"#F5F3FF", rate:19.1,  batchKg:200 },
  "LG-60B":  { name:"LG-60B",  type:"Pepper Grinder",      color:"#0891b2", bg:"#E0F2FE", rate:59.9,  batchKg:10  },
  "ROASTED": { name:"ROASTED", type:"Roasting Machine",    color:"#b45309", bg:"#FEF3C7", rate:106.7, batchKg:200 },
  "GS420":   { name:"GS420",   type:"Auto Packer",         color:"#16a34a", bg:"#F0FDF4", rate:600,   batchKg:null },
  "AFM30-T": { name:"AFM30-T", type:"Semi-Auto Packer",    color:"#dc2626", bg:"#FEF2F2", rate:125,   batchKg:null },
};

// Weekly available hours: 24hrs × 6 days = 144hrs
const WEEKLY_HRS = 144;
const CLEANING_HRS = 0.625; // 37.5 min avg

// --- PRODUCT → MACHINE + RATE + PASS mapping ---------------------------------
const PRODUCT_MACHINE_MAP = {
  // WFJ-20 single pass
  "CORIANDER":  { machine:"WFJ-20", rate:38.0,  passes:1, yield:0.95 },
  "TURMERIC":   { machine:"WFJ-20", rate:97.5,  passes:1, yield:0.975 },
  "CUMIN":      { machine:"WFJ-20", rate:46.2,  passes:1, yield:0.925 },
  "FENNEL":     { machine:"WFJ-20", rate:61.7,  passes:1, yield:0.925 },
  "CHILLI_FLAKES":{ machine:"WFJ-20",rate:20.0, passes:1, yield:0.50  },
  "RASAM":      { machine:"WFJ-20", rate:90.0,  passes:1, yield:0.90  },
  "FIVE_SPICES":{ machine:"WFJ-20", rate:72.0,  passes:1, yield:0.939 },
  // WFJ-20 double pass (complex blends)
  "MEAT_CURRY": { machine:"WFJ-20", rate:49.3,  passes:2, yield:0.974 },
  "FISH_CURRY": { machine:"WFJ-20", rate:58.3,  passes:2, yield:0.972 },
  "KURMA":      { machine:"WFJ-20", rate:53.0,  passes:2, yield:0.970 },
  "GARAM_MASALA":{ machine:"WFJ-20",rate:48.3,  passes:2, yield:0.942 },
  "SAMBAR":     { machine:"WFJ-20", rate:55.0,  passes:2, yield:0.971 },
  "TG_888":     { machine:"WFJ-20", rate:39.2,  passes:2, yield:0.891 },
  // WFC-500
  "CHILLI_POWDER":   { machine:"WFC-500", rate:20.0, passes:1, yield:0.834 },
  "TOPOKKI_CHILLI":  { machine:"WFC-500", rate:18.1, passes:1, yield:0.806 },
  // LG-60B
  "BLACK_PEPPER":    { machine:"LG-60B", rate:59.9, passes:1, yield:0.990 },
  "WHITE_PEPPER":    { machine:"LG-60B", rate:59.9, passes:1, yield:0.990 },
  // Roasted
  "RAVA_THOSAI":     { machine:"ROASTED", rate:106.7, passes:1, yield:1.0 },
};

// --- BOM item code → product category mapping --------------------------------
const ITEM_TO_CATEGORY = {
  // Meat Curry
  "MCP-001":"MEAT_CURRY","MCP-002":"MEAT_CURRY","MCP-003":"MEAT_CURRY",
  "MCP-004":"MEAT_CURRY","MCP-005":"MEAT_CURRY","MCP-006":"MEAT_CURRY",
  "MCP-TG-001":"TG_888","MCP-TG-002":"TG_888","MCP-TG-003":"TG_888",
  // Fish Curry
  "FCP-001":"FISH_CURRY","FCP-002":"FISH_CURRY","FCP-003":"FISH_CURRY",
  "FCP-004":"FISH_CURRY","FCP-005":"FISH_CURRY",
  // Coriander
  "CRP-001":"CORIANDER","CRP-002":"CORIANDER","CRP-003":"CORIANDER","CRP-008":"CORIANDER",
  "CRS-001":"CORIANDER","CRS-002":"CORIANDER","CRS-003":"CORIANDER","CRS-004":"CORIANDER",
  // Turmeric
  "TP-001":"TURMERIC","TP-002":"TURMERIC","TP-003":"TURMERIC","TP-009":"TURMERIC",
  "TPM-001":"TURMERIC","TPM-002":"TURMERIC","TPM-003":"TURMERIC",
  // Cumin
  "CMP-001":"CUMIN","CMP-002":"CUMIN","CMP-003":"CUMIN","CMP-007":"CUMIN",
  "CMS-001":"CUMIN","CMS-002":"CUMIN","CMS-003":"CUMIN","CMS-004":"CUMIN",
  // Fennel
  "FP-001":"FENNEL","FP-002":"FENNEL","FP-003":"FENNEL","FP-007":"FENNEL","FP-245":"FENNEL",
  "FS-001":"FENNEL","FS-002":"FENNEL","FS-003":"FENNEL","FS-004":"FENNEL",
  // Chilli Powder
  "CP-001":"CHILLI_POWDER","CP-002":"CHILLI_POWDER","CP-003":"CHILLI_POWDER",
  "CP-004":"CHILLI_POWDER","CP-005":"CHILLI_POWDER","CF-002":"CHILLI_POWDER",
  "DC-001":"CHILLI_POWDER","DC-002":"CHILLI_POWDER","DC-003":"CHILLI_POWDER",
  "CYP-001":"CHILLI_POWDER","CYP-002":"CHILLI_POWDER","CYP-003":"CHILLI_POWDER",
  // Chilli Flakes
  "CF-001":"CHILLI_FLAKES",
  // Black Pepper
  "BPC-001":"BLACK_PEPPER","BPC-002":"BLACK_PEPPER","BPC-003":"BLACK_PEPPER","BPC-004":"BLACK_PEPPER",
  "BPP-001":"BLACK_PEPPER","BPP-004":"BLACK_PEPPER","BPP-0012":"BLACK_PEPPER",
  "BPS-001":"BLACK_PEPPER","BPS-002":"BLACK_PEPPER","BPS-003":"BLACK_PEPPER","BPS-004":"BLACK_PEPPER",
  // White Pepper
  "WPC-001":"WHITE_PEPPER","WPP-001":"WHITE_PEPPER","WPP-002":"WHITE_PEPPER",
  "WPP-004":"WHITE_PEPPER","WPS-001":"WHITE_PEPPER","WPS-002":"WHITE_PEPPER",
  // Kurma
  "KCP-001":"KURMA","KCP-002":"KURMA","KCP-003":"KURMA",
  // Garam Masala
  "GMM-001":"GARAM_MASALA","GMM-002":"GARAM_MASALA",
  // Sambar
  "LSM-001":"SAMBAR",
  // Five Spices
  "FSS-001":"FIVE_SPICES","FSS-004":"FIVE_SPICES","FSS-00233":"FIVE_SPICES",
  // Rasam
  "RMP-001":"RASAM","RTF-001":"RASAM",
  // Rava Thosai
  "RTF-001":"RAVA_THOSAI",
};

// Pack size → packing machine
function getPackingMachine(itemCode) {
  const code = itemCode.toUpperCase();
  if (code.includes("100GM") || code.includes("125GM") || code.includes("250GM") || code.includes("500GM")) return "AFM30-T";
  return "GS420";
}

// --- SCHEDULING ENGINE --------------------------------------------------------
function scheduleProduction(products, bom) {
  const machineJobs = { "WFJ-20":[], "WFC-500":[], "LG-60B":[], "ROASTED":[], "GS420":[], "AFM30-T":[] };
  const productionQueue = [];

  products.forEach(p => {
    const category = ITEM_TO_CATEGORY[p.itemCode];
    const machineSpec = category ? PRODUCT_MACHINE_MAP[category] : null;
    const bomEntry = bom[p.itemCode];

    if (!machineSpec || !bomEntry) {
      productionQueue.push({ ...p, scheduled:false, reason: !machineSpec ? "No machine mapping" : "No BOM" });
      return;
    }

    const { machine, rate, passes, yield: yieldRate } = machineSpec;
    const machineInfo = MACHINES[machine];
    const batchKg = machineInfo.batchKg || 200;

    // For blends: each BOM component needs separate grinding
    // For single spices: the finished product KG is what's ground
    const isBlend = passes === 2 || bomEntry.components.length > 2;

    let totalGrindingHrs = 0;
    let componentJobs = [];
    let numCleanings = 0;

    if (isBlend) {
      // Each component ground separately
      const significantComponents = bomEntry.components.filter(c => c.qty * p.totalQty * (machine === "WFJ-20" ? 10 : 1) >= 1);
      significantComponents.forEach((comp, idx) => {
        const totalKgNeeded = comp.qty * p.totalQty;
        const batches = Math.ceil(totalKgNeeded / batchKg);
        const totalKgToGrind = batches * batchKg;
        const compCategory = Object.keys(PRODUCT_MACHINE_MAP).find(k =>
          ["CRD-SEED","CM-SEED","TR","FN-SEED","CL-YD","BP-SEED","WP-SEED"].includes(comp.code)
        );
        const compRate = rate; // use product rate as approximation
        const grindHrs = (totalKgToGrind / compRate) * passes;
        const cleanHrs = idx < significantComponents.length - 1 ? CLEANING_HRS : 0;
        totalGrindingHrs += grindHrs + cleanHrs;
        if (cleanHrs > 0) numCleanings++;
        componentJobs.push({ code:comp.code, kgNeeded:totalKgNeeded, batches, totalKgToGrind, grindHrs, passes, surplus:totalKgToGrind - totalKgNeeded });
      });
    } else {
      // Single spice — grind the finished product quantity directly
      const totalKgNeeded = p.totalQty; // rough: 1 unit = ~1 kg for most
      const batches = Math.ceil(totalKgNeeded / batchKg);
      const totalKgToGrind = batches * batchKg;
      const grindHrs = (totalKgToGrind / rate) * passes;
      totalGrindingHrs = grindHrs;
      componentJobs.push({ code:p.itemCode, kgNeeded:totalKgNeeded, batches, totalKgToGrind, grindHrs, passes, surplus:totalKgToGrind - totalKgNeeded });
    }

    // Packing time
    const packMachine = getPackingMachine(p.itemCode);
    const packRate = MACHINES[packMachine]?.rate || 600;
    const packHrs = p.totalQty / packRate;

    // Delivery date
    const orders = p.orders || [];
    const dates = orders.map(o=>o.deliveryDate||o.delivery||'').filter(d=>d.match(/\d{4}-\d{2}-\d{2}/)).sort();
    const nextDelivery = dates[0] || null;
    const daysLeft = nextDelivery ? Math.floor((new Date(nextDelivery)-new Date())/(1000*60*60*24)) : null;
    const customers = [...new Set(orders.map(o=>o.customer||o.customerName).filter(Boolean))];

    // Can we make it?
    const totalHrs = totalGrindingHrs + packHrs;
    const canMakeIt = daysLeft === null ? true : (daysLeft * 24) >= totalHrs;

    machineJobs[machine].push({ itemCode:p.itemCode, description:p.description, hrs:totalGrindingHrs, category });
    machineJobs[packMachine].push({ itemCode:p.itemCode, description:p.description, hrs:packHrs, category });

    productionQueue.push({
      ...p,
      scheduled:       true,
      category,
      machine,
      machineSpec,
      componentJobs,
      totalGrindingHrs,
      packMachine,
      packHrs,
      totalHrs,
      numCleanings,
      nextDelivery,
      daysLeft,
      customers,
      canMakeIt,
      passes,
    });
  });

  // Sort by urgency
  productionQueue.sort((a,b) => {
    if (!a.canMakeIt && b.canMakeIt) return -1;
    if (a.canMakeIt && !b.canMakeIt) return 1;
    if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
    if (a.daysLeft !== null) return -1;
    if (b.daysLeft !== null) return 1;
    return 0;
  });

  // Machine utilisation
  const utilisation = {};
  Object.entries(machineJobs).forEach(([m, jobs]) => {
    const totalHrs = jobs.reduce((s,j)=>s+j.hrs, 0);
    const pct = Math.min((totalHrs / WEEKLY_HRS) * 100, 999);
    utilisation[m] = { totalHrs, pct, jobs: jobs.length };
  });

  return { productionQueue, utilisation, machineJobs };
}

// --- MAIN COMPONENT -----------------------------------------------------------
// --- BENGALI TRANSLATIONS ----------------------------------------------------
const BN = {
  title:          "ক্যাপাসিটি পরিকল্পনা",
  subtitle:       "উৎপাদন সময়সূচী · সক্রিয় SO এর উপর ভিত্তি করে",
  queue:          "উৎপাদন সারি",
  machines:       "মেশিন ভিউ",
  totalJobs:      "মোট কাজ",
  atRisk:         "ঝুঁকিতে",
  onTrack:        "সময়মতো",
  grindHrs:       "গ্রাইন্ডিং সময়",
  packHrs:        "প্যাকিং সময়",
  weekCap:        "সাপ্তাহিক ক্ষমতা",
  nowProduce:     "এখন উৎপাদন করুন",
  upNext:         "পরবর্তী কাজ",
  markDone:       "সম্পন্ন করুন ✅",
  reportIssue:    "সমস্যা জানান ⚠️",
  cleaning:       "পরিষ্কার করুন 🧹",
  twoPass:        "দুই পাস প্রয়োজন",
  component:      "উপাদান",
  batches:        "ব্যাচ",
  grindTime:      "গ্রাইন্ডিং সময়",
  surplus:        "অতিরিক্ত সংরক্ষণ",
  delivery:       "ডেলিভারি তারিখ",
  daysLeft:       "দিন বাকি",
  overdue:        "দিন বিলম্বিত",
  today:          "আজকে",
  atRiskBadge:    "🚨 ঝুঁকিতে",
  urgentBadge:    "⚠️ জরুরি",
  okBadge:        "✅ ঠিক আছে",
  noDate:         "তারিখ নেই",
  machine:        "মেশিন",
  product:        "পণ্য",
  customer:       "গ্রাহক",
  qty:            "পরিমাণ",
  sortByDate:     "ডেলিভারি তারিখ অনুযায়ী সাজানো",
  cleaningBetween:"পণ্য পরিবর্তনের মধ্যে পরিষ্কার",
  batchSize:      "200 কেজি ব্যাচ",
};

export default function CapacityPlanner() {
  const [planData,  setPlanData]  = useState(null);
  const [bomData,   setBomData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [viewMode,  setViewMode]  = useState("queue"); // queue | machines
  const [schedule,  setSchedule]  = useState(null);
  const [lang, setLang] = useState("en"); // en | bn
  const t = (en, bn) => lang==="bn" ? bn : en;

  useEffect(() => {
    Promise.all([
      fetch("/api/operations?type=production").then(r=>r.json()),
      fetch("/api/sync-bom").then(r=>r.json()).catch(()=>({})),
    ]).then(([plan, bomResp]) => {
      setPlanData(plan);
      // BOM comes from operations, extract it
      setBomData(bomResp.bom || {});
      setLoading(false);
    }).catch(()=>setLoading(false));

    // Also fetch BOM directly from Redis via a dedicated call
    fetch("/api/operations?type=production").then(r=>r.json()).then(plan => {
      // Extract BOM from production plan products
      const bom = {};
      (plan.products||[]).forEach(p => {
        if (p.rawMaterials?.length) {
          bom[p.itemCode] = { components: p.rawMaterials.map(r=>({ code:r.code, qty:r.qtyPerUnit, uom:r.uom, refCost:r.refCostPerUnit })) };
        }
      });
      setPlanData(plan);
      setBomData(bom);
      const sched = scheduleProduction(plan.products||[], bom);
      setSchedule(sched);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const fmtHrs = h => {
    if (h < 1) return `${Math.round(h*60)}m`;
    const hrs = Math.floor(h);
    const mins = Math.round((h-hrs)*60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };
  const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  if (loading) return <div style={{padding:48,textAlign:"center",color:"#94A3B8",fontSize:14}}>Building production schedule...</div>;
  if (!schedule) return <div style={{padding:48,textAlign:"center",color:"#EF4444"}}>Failed to load capacity planner</div>;

  const { productionQueue, utilisation } = schedule;
  const atRisk    = productionQueue.filter(p=>!p.canMakeIt && p.daysLeft !== null);
  const onTrack   = productionQueue.filter(p=>p.canMakeIt);
  const noDate    = productionQueue.filter(p=>p.daysLeft === null);
  const totalHrsNeeded = productionQueue.reduce((s,p)=>s+(p.totalHrs||0),0);

  return (
    <div style={{padding:"24px 28px", maxWidth:1280, margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:4}}>🏭 Capacity Planner</div>
          <div style={{fontSize:13, color:"#94A3B8"}}>
            Production schedule based on active SOs · 24hrs/day · 6 days/week · 144 hrs available
          </div>
        </div>
        <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
          {[["queue","📋 Production Queue"],["machines","⚙️ Machine View"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:"8px 16px", borderRadius:99, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, background:viewMode===v?"#1E3A5F":"#F1F5F9", color:viewMode===v?"#fff":"#64748B"}}>{l}</button>
          ))}
          <div style={{display:"flex", gap:4, marginLeft:8}}>
            {[["en","EN"],["bn","বাংলা"]].map(([v,l])=>(
              <button key={v} onClick={()=>setLang(v)} style={{padding:"6px 14px", borderRadius:99, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, background:lang===v?"#7c3aed":"#F1F5F9", color:lang===v?"#fff":"#64748B"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Item #15 — How this works */}
      <details style={{marginBottom:16, background:"#EFF6FF", borderRadius:10, border:"1px solid #BFDBFE", overflow:"hidden"}}>
        <summary style={{padding:"10px 16px", fontSize:13, fontWeight:700, color:"#1E3A5F", cursor:"pointer", listStyle:"none", display:"flex", alignItems:"center", gap:8}}>
          <span>ℹ️</span> How does this planner work?
        </summary>
        <div style={{padding:"12px 16px 14px", borderTop:"1px solid #BFDBFE", fontSize:12, color:"#1e40af", lineHeight:1.8}}>
          <strong>What it calculates:</strong> Machine time needed to fulfil all active Sales Orders, based on BOM data and machine run rates.<br/>
          <strong>Batch size:</strong> Each production run = 200 kg per batch.<br/>
          <strong>Machine rates:</strong> Defined per machine type in the MACHINES config (kg/hour). Ensure SQL BOM entries are up to date.<br/>
          <strong>Cleaning buffer:</strong> 30 min added between different product runs.<br/>
          <strong>Double-pass items:</strong> Blended spices require 2 machine passes — grinding + blending.<br/>
          <strong>Utilisation %:</strong> Machine hours used ÷ available hours per shift.<br/>
          <strong>Data source:</strong> SQL Account Sales Orders → OCC sync every 30 min. Click 🔄 to force refresh.
        </div>
      </details>
      {/* KPI Strip */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:20}}>
        {[
          {label:"Total Jobs",          value:productionQueue.filter(p=>p.scheduled).length, color:"#1E3A5F", bg:"#EFF6FF"},
          {label:"🚨 At Risk",           value:atRisk.length,    color:"#dc2626", bg:"#FEF2F2"},
          {label:"✅ On Track",           value:onTrack.length,   color:"#16a34a", bg:"#F0FDF4"},
          {label:"Total Grinding Hrs",  value:fmtHrs(productionQueue.reduce((s,p)=>s+(p.totalGrindingHrs||0),0)), color:"#d97706", bg:"#FFFBEB"},
          {label:"Total Packing Hrs",   value:fmtHrs(productionQueue.reduce((s,p)=>s+(p.packHrs||0),0)),         color:"#7c3aed", bg:"#F5F3FF"},
          {label:"Week Capacity Used",  value:`${Math.min(Math.round((totalHrsNeeded/WEEKLY_HRS)*100),999)}%`,   color:"#0891b2", bg:"#E0F2FE"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${c.color}22`}}>
            <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:20, fontWeight:800, color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* -- MACHINE VIEW -- */}
      {viewMode === "machines" && (
        <div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:14, marginBottom:20}}>
            {Object.entries(utilisation).map(([mId, util]) => {
              const m = MACHINES[mId];
              if (!m) return null;
              const pct = Math.min(util.pct, 100);
              const overCapacity = util.pct > 100;
              const barColor = util.pct > 90 ? "#dc2626" : util.pct > 70 ? "#d97706" : "#16a34a";
              return (
                <div key={mId} style={{background:"#fff", borderRadius:16, padding:"18px 20px", border:`2px solid ${overCapacity?"#dc262633":m.bg}`, boxShadow:"0 1px 8px rgba(0,0,0,0.05)"}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12}}>
                    <div>
                      <div style={{fontSize:16, fontWeight:800, color:m.color}}>{m.name}</div>
                      <div style={{fontSize:11, color:"#94A3B8"}}>{m.type}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:20, fontWeight:800, color:overCapacity?"#dc2626":barColor}}>{util.pct.toFixed(0)}%</div>
                      <div style={{fontSize:10, color:"#94A3B8"}}>{fmtHrs(util.totalHrs)} / {WEEKLY_HRS}h</div>
                    </div>
                  </div>
                  <div style={{height:10, background:"#F1F5F9", borderRadius:99, overflow:"hidden", marginBottom:10}}>
                    <div style={{height:"100%", width:`${Math.min(pct,100)}%`, background:barColor, borderRadius:99, transition:"width 0.5s"}}/>
                  </div>
                  {overCapacity && (
                    <div style={{background:"#FEF2F2", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#dc2626", fontWeight:700, marginBottom:8}}>
                      ⚠️ Over capacity by {(util.pct-100).toFixed(0)}% — {fmtHrs(util.totalHrs - WEEKLY_HRS)} overtime needed
                    </div>
                  )}
                  <div style={{fontSize:11, color:"#64748B"}}>
                    <div>{util.jobs} production job{util.jobs!==1?"s":""}</div>
                    {mId !== "GS420" && mId !== "AFM30-T" && <div>Rate: {m.rate} kg/hr · Batch: {m.batchKg}kg</div>}
                    {(mId === "GS420" || mId === "AFM30-T") && <div>Rate: {m.rate} kg/hr · {mId==="GS420"?"1kg+ packs":"100g–500g packs"}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weekly capacity summary */}
          <div style={{background:"#1E293B", borderRadius:16, padding:"18px 20px", border:"1px solid #334155"}}>
            <div style={{fontSize:13, fontWeight:800, color:"#E2E8F0", marginBottom:12}}>Weekly Capacity Summary</div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:10}}>
              {[
                {m:"WFJ-20",  label:"Fine Grinder",    maxKg:8064,  color:"#60a5fa"},
                {m:"WFC-500", label:"Coarse Grinder",  maxKg:2750,  color:"#c4b5fd"},
                {m:"LG-60B",  label:"Pepper Grinder",  maxKg:8626,  color:"#67e8f9"},
                {m:"GS420",   label:"Auto Packer",     maxKg:86400, color:"#86efac"},
                {m:"AFM30-T", label:"Semi-Auto Packer",maxKg:18000, color:"#fca5a5"},
              ].map(({m,label,maxKg,color})=>{
                const used = (utilisation[m]?.totalHrs || 0) * MACHINES[m]?.rate || 0;
                return (
                  <div key={m} style={{background:"#0F172A", borderRadius:10, padding:"12px 14px"}}>
                    <div style={{fontSize:11, fontWeight:700, color, marginBottom:4}}>{m} — {label}</div>
                    <div style={{fontSize:12, color:"#94A3B8"}}>Max: {(maxKg/1000).toFixed(0)}t/week</div>
                    <div style={{fontSize:11, color:"#475569", marginTop:2}}>
                      {fmtHrs(utilisation[m]?.totalHrs||0)} scheduled this week
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* -- PRODUCTION QUEUE -- */}
      {viewMode === "queue" && (
        <div>
          {atRisk.length > 0 && (
            <div style={{background:"#FEF2F2", borderRadius:12, padding:"12px 16px", border:"2px solid #FECACA", marginBottom:14}}>
              <div style={{fontSize:13, fontWeight:800, color:"#dc2626", marginBottom:4}}>
                🚨 {atRisk.length} product{atRisk.length>1?"s":""} at risk — production time exceeds delivery window
              </div>
              <div style={{fontSize:12, color:"#EF4444"}}>
                {atRisk.map(p=>p.description).join(" · ")}
              </div>
            </div>
          )}

          <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
            <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9"}}>
              <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Production Queue — sorted by delivery date</div>
              <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>Click any row to see component grinding schedule · 200kg batch sizes · cleaning buffer between product changes</div>
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
                <thead>
                  <tr style={{background:"#F8FAFC"}}>
                    {["#","Product","Customer(s)","Qty","Machine","Grinding","Packing","Total Hrs","Delivery","Days","Status",""].map(h=>(
                      <th key={h} style={{padding:"9px 12px", textAlign:["Grinding","Packing","Total Hrs"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productionQueue.filter(p=>p.scheduled).map((p,i) => {
                    const isExp = expanded === p.itemCode;
                    const m = MACHINES[p.machine];
                    const overdue  = p.daysLeft !== null && p.daysLeft < 0;
                    const urgent   = p.daysLeft !== null && p.daysLeft <= 3 && p.daysLeft >= 0;
                    const rowBg    = !p.canMakeIt ? "#FFF5F5" : overdue ? "#FFF5F5" : urgent ? "#FFFBEB" : isExp ? "#F0F9FF" : i%2===0 ? "#FAFAFA" : "#fff";

                    return (
                      <React.Fragment key={p.itemCode}>
                        <tr onClick={()=>setExpanded(isExp?null:p.itemCode)} style={{borderTop:"1px solid #F1F5F9", background:rowBg, cursor:"pointer"}}>
                          <td style={{padding:"10px 12px"}}>
                            <div style={{width:26,height:26,borderRadius:"50%",background:!p.canMakeIt?"#EF4444":urgent?"#F59E0B":"#1E3A5F",color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{i+1}</div>
                          </td>
                          <td style={{padding:"10px 12px"}}>
                            <div style={{fontWeight:700, color:"#0F172A"}}>{p.description}</div>
                        {lang==="bn" && <div style={{fontSize:11, color:"#7c3aed", fontWeight:500}}>{BN.product}: {p.itemCode}</div>}
                            <div style={{fontSize:10, color:"#94A3B8", marginTop:2, display:"flex", gap:5}}>
                              <code style={{background:"#F1F5F9",padding:"1px 4px",borderRadius:3}}>{p.itemCode}</code>
                              <span style={{background:m?.bg,color:m?.color,padding:"1px 6px",borderRadius:99,fontWeight:700,fontSize:9}}>{p.machine}</span>
                              {p.passes===2 && <span style={{background:"#FEF3C7",color:"#92400E",padding:"1px 6px",borderRadius:99,fontWeight:700,fontSize:9}}>2-PASS</span>}
                            </div>
                          </td>
                          <td style={{padding:"10px 12px", fontSize:11, maxWidth:160}}>
                            {(p.customers||[]).slice(0,2).map(c=>(
                              <div key={c} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>{c}</div>
                            ))}
                            {(p.customers||[]).length>2 && <div style={{color:"#94A3B8"}}>+{p.customers.length-2} more</div>}
                          </td>
                          <td style={{padding:"10px 12px",fontWeight:700}}>{(p.totalQty||0).toLocaleString()}</td>
                          <td style={{padding:"10px 12px"}}>
                            <span style={{background:m?.bg,color:m?.color,padding:"3px 8px",borderRadius:6,fontWeight:700,fontSize:11}}>{p.machine}</span>
                          </td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:"#d97706"}}>{fmtHrs(p.totalGrindingHrs)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:"#7c3aed"}}>{fmtHrs(p.packHrs)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:!p.canMakeIt?"#dc2626":"#0F172A"}}>{fmtHrs(p.totalHrs)}</td>
                          <td style={{padding:"10px 12px",whiteSpace:"nowrap",color:overdue?"#dc2626":urgent?"#d97706":"#64748B",fontWeight:overdue||urgent?700:400}}>
                            {p.nextDelivery ? new Date(p.nextDelivery).toLocaleDateString("en-MY",{day:"2-digit",month:"short"}) : <span style={{color:"#CBD5E1"}}>No date</span>}
                          </td>
                          <td style={{padding:"10px 12px"}}>
                            {p.daysLeft !== null ? (
                              <span style={{fontSize:11,fontWeight:700,color:overdue?"#dc2626":urgent?"#d97706":"#64748B"}}>
                                {overdue ? `${Math.abs(p.daysLeft)}d late` : p.daysLeft===0 ? "Today" : `${p.daysLeft}d`}
                              </span>
                            ) : <span style={{color:"#CBD5E1",fontSize:11}}>—</span>}
                          </td>
                          <td style={{padding:"10px 12px"}}>
                            {!p.canMakeIt
                              ? <span style={{fontSize:10,background:"#FEF2F2",color:"#dc2626",padding:"2px 8px",borderRadius:99,fontWeight:700}}>🚨 At Risk</span>
                              : p.daysLeft!==null && p.daysLeft<=3
                              ? <span style={{fontSize:10,background:"#FFFBEB",color:"#d97706",padding:"2px 8px",borderRadius:99,fontWeight:700}}>⚠️ Urgent</span>
                              : <span style={{fontSize:10,background:"#F0FDF4",color:"#16a34a",padding:"2px 8px",borderRadius:99,fontWeight:700}}>✅ OK</span>
                            }
                          </td>
                          <td style={{padding:"10px 12px",color:"#94A3B8",fontSize:11}}>{isExp?"▲":"▼"}</td>
                        </tr>

                        {/* Expanded: component grinding schedule */}
                        {isExp && (
                          <tr><td colSpan={12} style={{padding:"0 0 16px 48px",background:"#F8FAFC"}}>
                            <div style={{paddingTop:12}}>
                              <div style={{fontSize:12,fontWeight:800,color:"#475569",marginBottom:10}}>
                                Component Grinding Schedule — {p.machine} · {p.passes===2?"Double pass (2×)":"Single pass"} · 200kg batches
                              </div>
                              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,maxWidth:700}}>
                                <thead>
                                  <tr style={{background:"#F1F5F9"}}>
                                    {["Component","Qty Needed","Batches","Batch KG","Passes","Grind Time","Surplus",""].map(h=>(
                                      <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(p.componentJobs||[]).map((comp,ci)=>(
                                    <React.Fragment key={ci}>
                                      <tr style={{borderTop:"1px solid #E2E8F0",background:ci%2===0?"#fff":"#FAFAFA"}}>
                                        <td style={{padding:"7px 10px"}}><code style={{background:"#E2E8F0",padding:"1px 6px",borderRadius:3,fontWeight:700}}>{comp.code}</code></td>
                                        <td style={{padding:"7px 10px",fontWeight:600}}>{comp.kgNeeded.toFixed(2)} kg</td>
                                        <td style={{padding:"7px 10px"}}>{comp.batches} × 200kg</td>
                                        <td style={{padding:"7px 10px",color:"#64748B"}}>{comp.totalKgToGrind.toFixed(0)} kg</td>
                                        <td style={{padding:"7px 10px"}}>
                                          <span style={{background:comp.passes===2?"#FEF3C7":"#F1F5F9",color:comp.passes===2?"#92400E":"#64748B",padding:"1px 6px",borderRadius:99,fontWeight:700,fontSize:10}}>
                                            {comp.passes}×
                                          </span>
                                        </td>
                                        <td style={{padding:"7px 10px",fontWeight:700,color:"#d97706"}}>{fmtHrs(comp.grindHrs)}</td>
                                        <td style={{padding:"7px 10px",color:comp.surplus>0?"#16a34a":"#94A3B8"}}>
                                          {comp.surplus > 0 ? `+${comp.surplus.toFixed(0)} kg banked` : "—"}
                                        </td>
                                        <td style={{padding:"7px 10px",fontSize:10,color:"#94A3B8"}}>
                                          {ci < (p.componentJobs||[]).length-1 ? "🧹 clean" : ""}
                                        </td>
                                      </tr>
                                    </React.Fragment>
                                  ))}
                                  <tr style={{borderTop:"2px solid #E2E8F0",background:"#FFFBEB"}}>
                                    <td colSpan={5} style={{padding:"8px 10px",fontWeight:800}}>
                                      Total · {p.numCleanings} cleaning{p.numCleanings!==1?"s":""} ({fmtHrs(p.numCleanings * CLEANING_HRS)} lost)
                                    </td>
                                    <td style={{padding:"8px 10px",fontWeight:800,color:"#d97706"}}>{fmtHrs(p.totalGrindingHrs)}</td>
                                    <td colSpan={2}/>
                                  </tr>
                                </tbody>
                              </table>

                              {/* Packing info */}
                              <div style={{marginTop:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                                <div style={{background:"#fff",borderRadius:8,padding:"10px 14px",border:"1px solid #E2E8F0",fontSize:11}}>
                                  <div style={{fontWeight:700,color:"#7c3aed",marginBottom:2}}>📦 Packing: {p.packMachine}</div>
                                  <div style={{color:"#64748B"}}>{MACHINES[p.packMachine]?.type} · {MACHINES[p.packMachine]?.rate} kg/hr</div>
                                  <div style={{fontWeight:700,color:"#7c3aed",marginTop:2}}>{fmtHrs(p.packHrs)} packing time</div>
                                </div>
                                <div style={{background:"#fff",borderRadius:8,padding:"10px 14px",border:"1px solid #E2E8F0",fontSize:11}}>
                                  <div style={{fontWeight:700,color:"#0F172A",marginBottom:2}}>⏱ Total Production Time</div>
                                  <div style={{color:"#64748B"}}>Grinding: {fmtHrs(p.totalGrindingHrs)} + Packing: {fmtHrs(p.packHrs)}</div>
                                  <div style={{fontWeight:800,color:!p.canMakeIt?"#dc2626":"#16a34a",marginTop:2,fontSize:13}}>{fmtHrs(p.totalHrs)} total</div>
                                </div>
                                {p.nextDelivery && (
                                  <div style={{background:!p.canMakeIt?"#FEF2F2":"#F0FDF4",borderRadius:8,padding:"10px 14px",border:`1px solid ${!p.canMakeIt?"#FECACA":"#BBF7D0"}`,fontSize:11}}>
                                    <div style={{fontWeight:700,color:!p.canMakeIt?"#dc2626":"#16a34a",marginBottom:2}}>
                                      {!p.canMakeIt ? "🚨 Cannot meet deadline" : "✅ Can meet deadline"}
                                    </div>
                                    <div style={{color:"#64748B"}}>Delivery: {new Date(p.nextDelivery).toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"})}</div>
                                    <div style={{fontWeight:700,color:!p.canMakeIt?"#dc2626":"#16a34a"}}>
                                      {p.daysLeft !== null ? `${p.daysLeft < 0 ? `${Math.abs(p.daysLeft)} days overdue` : `${p.daysLeft} days · ${p.daysLeft*24} hrs available`}` : ""}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Unscheduled */}
                  {productionQueue.filter(p=>!p.scheduled).map((p,i)=>(
                    <tr key={p.itemCode} style={{borderTop:"1px solid #F1F5F9",background:"#FAFAFA",opacity:0.6}}>
                      <td style={{padding:"10px 12px",color:"#94A3B8"}}>—</td>
                      <td style={{padding:"10px 12px"}}>
                        <div style={{fontWeight:600,color:"#94A3B8"}}>{p.description}</div>
                        <div style={{fontSize:10,color:"#CBD5E1"}}>{p.reason}</div>
                      </td>
                      <td colSpan={10} style={{padding:"10px 12px",fontSize:11,color:"#94A3B8"}}>No machine mapping — manual scheduling required</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* No-date items */}
          {noDate.filter(p=>p.scheduled).length > 0 && (
            <div style={{marginTop:12,background:"#F8FAFC",borderRadius:12,padding:"12px 16px",border:"1px solid #E2E8F0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>📅 {noDate.filter(p=>p.scheduled).length} products with no delivery date — ranked by customer order frequency</div>
              <div style={{fontSize:11,color:"#CBD5E1"}}>{noDate.filter(p=>p.scheduled).map(p=>p.description).join(" · ")}</div>
            </div>
          )}
        </div>
      )}

      <div style={{marginTop:8,fontSize:11,color:"#94A3B8"}}>
        * Grinding times based on actual production data · 200kg batch sizes · 37.5 min cleaning between product changes · Packing runs parallel to grinding
      </div>
    </div>
  );
}
