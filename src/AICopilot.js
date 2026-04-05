import React, { useState, useEffect } from "react";

const STATUS_COLORS = {
  "Overdue":   { bg:"#FEF2F2", text:"#991B1B", dot:"#EF4444" },
  "Follow up": { bg:"#FFFBEB", text:"#92400E", dot:"#F59E0B" },
  "Reactivate":{ bg:"#EFF6FF", text:"#1E40AF", dot:"#3B82F6" },
  "Close now": { bg:"#F0FDF4", text:"#14532D", dot:"#10B981" },
  "Upsell":    { bg:"#FAF5FF", text:"#581C87", dot:"#8B5CF6" },
};

function ActionBadge({ type }) {
  const c = STATUS_COLORS[type] || STATUS_COLORS["Follow up"];
  return (
    <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99,background:c.bg,color:c.text,whiteSpace:"nowrap"}}>
      {type}
    </span>
  );
}

export default function SeriRasaAI({ prospects, soData, ivData, currentUser, stockItems, customers }) {
  const [activeSection, setActiveSection] = useState("today");
  const [selected, setSelected] = useState([]);
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState({}); // { prospectId: { summary, suggestedProducts, message } }
  const [generating, setGenerating] = useState(false);
  const [batchMessages, setBatchMessages] = useState([]);
  const [copied, setCopied] = useState(null);
  const [expandedResearch, setExpandedResearch] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndustry, setSearchIndustry] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchHistory, setSearchHistory] = useState([]);

  const inp = { padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none", background:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif" };

  // ── Today's Actions ──────────────────────────────────────────
  function buildTodayActions() {
    const actions = [];
    const now = new Date();

    prospects.forEach(p => {
      const daysSince = p.lastContacted ? Math.floor((now - new Date(p.lastContacted)) / 86400000) : 999;

      if (p.status === "Hot Lead") {
        actions.push({ ...p, actionType: "Close now", priority: 1, reason: "Hot lead — close this week" });
      } else if (daysSince >= 21 && p.status !== "Win-Back Needed") {
        actions.push({ ...p, actionType: "Overdue", priority: 2, reason: `${daysSince} days no contact` });
      } else if (p.status === "Contacted / Waiting" && daysSince >= 7) {
        actions.push({ ...p, actionType: "Follow up", priority: 3, reason: `Awaiting reply ${daysSince} days` });
      } else if (p.status === "Win-Back Needed") {
        actions.push({ ...p, actionType: "Reactivate", priority: 4, reason: "Needs reactivation" });
      }
    });

    // Reactivation from SQL invoices — customers inactive 60+ days
    const activeCustomerNames = new Set(prospects.map(p => p.company.toLowerCase()));
    const invoiceMap = {};
    (ivData || []).forEach(inv => {
      const name = (inv.companyname || inv.branchname || "").toLowerCase();
      const date = new Date(inv.docdate);
      if (!invoiceMap[name] || date > invoiceMap[name].date) {
        invoiceMap[name] = { date, docno: inv.docno, amount: inv.docamt, name: inv.companyname || inv.branchname };
      }
    });

    Object.values(invoiceMap).forEach(inv => {
      const daysSince = Math.floor((now - inv.date) / 86400000);
      if (daysSince >= 60 && daysSince <= 365) {
        actions.push({
          id: `inv-${inv.name}`, company: inv.name, actionType: "Reactivate",
          priority: 4, reason: `Last ordered ${daysSince} days ago — RM ${(inv.amount||0).toLocaleString()}`,
          industry: "Existing Customer", agent: currentUser?.name, isExistingCustomer: true,
          lastOrderAmt: inv.amount,
        });
      }
    });

    return actions.sort((a,b) => a.priority - b.priority).slice(0, 8);
  }

  const todayActions = buildTodayActions();

  // ── Research + Message Generation ───────────────────────────
  async function researchAndGenerate() {
    if (!selected.length) return;
    setResearching(true);
    setResearch({});
    setBatchMessages([]);

    const stockContext = (stockItems || []).slice(0,100).map(s => `${s.code}|${s.description}`).join("\n");

    const results = {};
    for (const p of selected) {
      try {
        // Step 1: Web search for company intelligence
        const searchRes = await fetch("/api/generate", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            system: `You are a B2B sales intelligence analyst for Seri Rasa, a Malaysian Halal OEM spice and condiment manufacturer in Rawang, Selangor. Research the given company deeply using all available public information — company website, LinkedIn, news, food industry directories, SSM records, and social media. Return a structured Apollo.io-style intelligence card with as much real detail as possible. Return JSON only:
{
  "summary": "2-3 sentence company overview — what they make, their scale, market position",
  "companySize": "estimated headcount e.g. 50-200 employees",
  "estimatedRevenue": "estimated annual revenue e.g. RM 5-20M",
  "website": "company website URL if known, or null",
  "decisionMakerName": "actual name of the procurement/purchasing/R&D contact if findable from LinkedIn or website, or null",
  "decisionMakerTitle": "their job title e.g. Procurement Manager, Head of R&D, Operations Director",
  "decisionMakerEmail": "their direct email if findable, or educated guess based on company email format e.g. name@company.com, or null",
  "decisionMakerLinkedIn": "their LinkedIn URL if findable, or null",
  "companyPhone": "company main phone number if known, or null",
  "recentTrigger": "any recent news, expansion, new product launch, job posting, or event that creates a sales opportunity — or null",
  "ingredientNeeds": "specific spice/ingredient types they likely procure based on what they produce",
  "suggestedProducts": ["top 3 Seri Rasa stock items that match their needs"],
  "pitchAngle": "one sentence on the sharpest angle to approach them",
  "approachTiming": "best time/reason to reach out now",
  "language": "bm or en — BM for local SMEs/Malay-owned, EN for chains/MNCs/international brands",
  "confidenceScore": "high/medium/low — how confident you are in the decision maker details found"
}`,
            userMessage: `Company: ${p.company}\nIndustry: ${p.industry}\nStatus: ${p.status}\nNotes: ${p.notes || "none"}\n\nOur stock items (code|description):\n${stockContext}\n\nProvide intelligence brief and suggest top 3 most relevant stock items from our list.`
          })
        });
        const searchData = await searchRes.json();
        let intel = {};
        try { intel = JSON.parse(searchData.text.replace(/```json|```/g,"").trim()); } catch(e) { intel = { summary: searchData.text, suggestedProducts: [], pitchAngle: "", language: "bm" }; }

        // Step 2: Generate WhatsApp message using intelligence
        const msgRes = await fetch("/api/generate", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            system: `You are Jasmine, a friendly and professional sales executive at Seri Rasa — a Malaysian Halal OEM spice and condiment manufacturer in Rawang, Selangor. Write a short, natural WhatsApp outreach message (max 4 sentences) in ${intel.language === "bm" ? "Bahasa Malaysia mixed with some English (Manglish style)" : "professional English"}. Be warm, specific, and reference what the company actually does. End with a clear call to action. Do not use emojis excessively — max 1-2.`,
            userMessage: `Prospect: ${p.company} (${p.industry})\nIntelligence: ${intel.summary}\nBest pitch angle: ${intel.pitchAngle}\nSuggested products: ${(intel.suggestedProducts||[]).join(", ")}\nStatus: ${p.status}\nNotes: ${p.notes || "none"}\n\nWrite the WhatsApp message.`
          })
        });
        const msgData = await msgRes.json();
        results[p.id] = { ...intel, message: msgData.text, prospect: p };
      } catch(e) {
        results[p.id] = { summary: "Could not fetch intelligence", suggestedProducts: [], pitchAngle: "", message: "Error generating message", prospect: p };
      }
    }

    setResearch(results);
    setBatchMessages(Object.values(results));
    setResearching(false);
  }

  async function generateTodayMessages() {
    const toGenerate = todayActions.slice(0,5);
    setSelected(toGenerate);
    setActiveSection("batch");
    setTimeout(() => researchAndGenerate(), 100);
  }

  function copyMessage(id, text) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  const sectionBtn = (s) => ({
    padding:"8px 18px", borderRadius:99, border:"none", cursor:"pointer",
    fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:600,
    background: activeSection===s ? "#1E3A5F" : "#F1F5F9",
    color: activeSection===s ? "#fff" : "#64748B",
    transition:"all 0.2s"
  });

  async function searchProspect() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError("");
    try {
      const stockContext = (stockItems||[]).slice(0,80).map(s=>`${s.code}|${s.description}`).join("\n");
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          system: `You are a B2B sales intelligence analyst for Seri Rasa, a Malaysian Halal OEM spice and condiment manufacturer in Rawang, Selangor. Research the given company deeply using all available public information — company website, LinkedIn, news articles, food industry directories, SSM records, and social media. Return a detailed Apollo.io-style intelligence card. Return JSON only:
{
  "companyName": "full official company name",
  "summary": "2-3 sentence overview — what they make, scale, market position",
  "companySize": "estimated headcount",
  "estimatedRevenue": "estimated annual revenue in RM",
  "website": "website URL or null",
  "companyPhone": "main phone number or null",
  "companyAddress": "office address or null",
  "industry": "industry classification",
  "contacts": [
    {
      "name": "actual person name if findable",
      "title": "job title",
      "email": "direct email or educated guess",
      "linkedin": "LinkedIn URL or null",
      "phone": "direct number or null"
    }
  ],
  "recentTrigger": "recent news, expansion, new product, job posting, or sales opportunity — or null",
  "ingredientNeeds": "specific spices/ingredients they likely procure",
  "suggestedProducts": ["top 3 matching Seri Rasa products"],
  "pitchAngle": "sharpest one-sentence approach",
  "approachTiming": "best reason to reach out now",
  "language": "bm or en",
  "confidenceScore": "high/medium/low"
}`,
          userMessage: `Company: ${searchQuery.trim()}
Industry hint: ${searchIndustry||"Food & Beverage / Manufacturing"}
Location: Malaysia

Our stock items:
${stockContext}

Research this company thoroughly and return the full intelligence card.`
        })
      });
      const data = await res.json();
      const clean = (data.text||"{}").replace(/\`\`\`json|\`\`\`/g,"").trim();
      const result = JSON.parse(clean);
      setSearchResult(result);
      setSearchHistory(prev => [{query:searchQuery, result, timestamp:new Date().toISOString()}, ...prev].slice(0,10));
    } catch(e) {
      setSearchError("Search failed: "+e.message);
    }
    setSearching(false);
  }

  async function addToProspects(result) {
    alert(`To add ${result.companyName} to your prospects list, go to the Pipeline tab and click "+ Add Prospect".`);
  }

  function openWhatsApp(phone, message) {
    const clean = (phone||"").replace(/[^0-9]/g,"");
    const num = clean.startsWith("60") ? clean : clean.startsWith("0") ? "6"+clean : "60"+clean;
    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  function openWhatsAppNoNum(message) {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div style={{padding:"24px 28px", maxWidth:1100, margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20}}>
        <div>
          <div style={{fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:4}}>SeriRasa AI</div>
          <div style={{fontSize:13, color:"#94A3B8"}}>Research prospects, generate targeted outreach, and track pipeline momentum</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button style={sectionBtn("today")} onClick={()=>setActiveSection("today")}>Today's Actions</button>
          <button style={sectionBtn("batch")} onClick={()=>setActiveSection("batch")}>Batch Outreach</button>
          <button style={sectionBtn("radar")} onClick={()=>setActiveSection("radar")}>Reactivation Radar</button>
          <button style={sectionBtn("velocity")} onClick={()=>setActiveSection("velocity")}>Pipeline Intel</button>
          <button style={sectionBtn("search")} onClick={()=>setActiveSection("search")}>🔍 Prospect Search</button>
        </div>
      </div>

      {/* ── TODAY'S ACTIONS ── */}
      {activeSection === "today" && (
        <div>
          <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden", marginBottom:14}}>
            <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Today's priority contacts</div>
                <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>AI-ranked by urgency — {new Date().toLocaleDateString("en-MY", {weekday:"long", day:"numeric", month:"long"})}</div>
              </div>
              <button onClick={generateTodayMessages} style={{padding:"8px 18px", borderRadius:10, border:"none", background:"#1E3A5F", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer"}}>
                ✨ Generate all messages
              </button>
            </div>
            {todayActions.length === 0 ? (
              <div style={{padding:"32px", textAlign:"center", color:"#94A3B8", fontSize:13}}>No priority actions today — pipeline is healthy!</div>
            ) : todayActions.map((a,i) => (
              <div key={a.id || i} style={{padding:"12px 18px", borderBottom:"1px solid #F8FAFC", display:"flex", alignItems:"center", gap:12}}>
                <div style={{width:8, height:8, borderRadius:"50%", background:STATUS_COLORS[a.actionType]?.dot||"#94A3B8", flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:600, color:"#0F172A"}}>{a.company}</div>
                  <div style={{fontSize:11, color:"#94A3B8"}}>{a.industry} · {a.agent} · {a.reason}</div>
                </div>
                <ActionBadge type={a.actionType} />
                <button onClick={()=>{ setSelected([a]); setActiveSection("batch"); setTimeout(researchAndGenerate,100); }}
                  style={{padding:"6px 14px", borderRadius:8, border:"1px solid #E2E8F0", background:"#F8FAFC", color:"#1E3A5F", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap"}}>
                  ✨ Generate
                </button>
              </div>
            ))}
          </div>

          {/* Pipeline velocity summary */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12}}>
            {[
              { label:"To contact", value: prospects.filter(p=>p.status==="To Contact").length, color:"#1E3A5F" },
              { label:"Hot leads", value: prospects.filter(p=>p.status==="Hot Lead").length, color:"#EF4444" },
              { label:"Awaiting reply", value: prospects.filter(p=>p.status==="Contacted / Waiting").length, color:"#F59E0B" },
              { label:"Total pipeline", value: prospects.length, color:"#94A3B8" },
            ].map(s => (
              <div key={s.label} style={{background:"#fff", borderRadius:12, border:"1px solid #EEF2F7", padding:"16px 18px"}}>
                <div style={{fontSize:11, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>{s.label}</div>
                <div style={{fontSize:28, fontWeight:800, color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BATCH OUTREACH ── */}
      {activeSection === "batch" && (
        <div style={{display:"grid", gridTemplateColumns:"340px 1fr", gap:16}}>
          {/* Prospect selector */}
          <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden", height:"fit-content"}}>
            <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Select prospects</div>
              <span style={{fontSize:11, color:"#94A3B8"}}>{selected.length} selected</span>
            </div>
            <div style={{maxHeight:480, overflowY:"auto"}}>
              {prospects.filter(p => p.status === 'To Contact').map(p => {
                const isSel = selected.find(s=>s.id===p.id);
                return (
                  <div key={p.id} onClick={()=> setSelected(isSel ? selected.filter(s=>s.id!==p.id) : [...selected, p])}
                    style={{padding:"10px 14px", borderBottom:"1px solid #F8FAFC", cursor:"pointer", display:"flex", alignItems:"center", gap:10, background:isSel?"#EFF6FF":"#fff"}}>
                    <div style={{width:16, height:16, borderRadius:4, border:`1.5px solid ${isSel?"#1E3A5F":"#CBD5E1"}`, background:isSel?"#1E3A5F":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                      {isSel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:12, fontWeight:600, color:"#0F172A", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{p.company}</div>
                      <div style={{fontSize:10, color:"#94A3B8"}}>{p.industry} · {p.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{padding:"12px 14px", borderTop:"1px solid #F1F5F9"}}>
              <button onClick={researchAndGenerate} disabled={!selected.length || researching}
                style={{width:"100%", padding:"10px", borderRadius:10, border:"none", background:(!selected.length||researching)?"#CBD5E1":"#1E3A5F", color:"#fff", fontSize:13, fontWeight:700, cursor:(!selected.length||researching)?"not-allowed":"pointer"}}>
                {researching ? "🔍 Researching..." : `✨ Research & Generate (${selected.length})`}
              </button>
            </div>
          </div>

          {/* Generated messages */}
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            {researching && (
              <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", padding:"32px", textAlign:"center"}}>
                <div style={{fontSize:32, marginBottom:14}}>🔍</div>
                <div style={{fontSize:15, fontWeight:700, color:"#0F172A", marginBottom:6}}>Researching {selected.length} companies...</div>
                <div style={{fontSize:12, color:"#94A3B8"}}>Analysing each company and crafting personalised messages</div>
              </div>
            )}
            {!researching && batchMessages.length === 0 && (
              <div style={{background:"#F8FAFC", borderRadius:16, border:"1px dashed #E2E8F0", padding:"48px", textAlign:"center"}}>
                <div style={{fontSize:32, marginBottom:12}}>✨</div>
                <div style={{fontSize:14, fontWeight:600, color:"#64748B", marginBottom:6}}>Select prospects and click Research & Generate</div>
                <div style={{fontSize:12, color:"#94A3B8"}}>AI will research each company and write a personalised WhatsApp message</div>
              </div>
            )}
            {batchMessages.map((r,i) => (
              <div key={i} style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
                {/* Company header */}
                <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>{r.prospect?.company}</div>
                    <div style={{fontSize:11, color:"#94A3B8"}}>{r.prospect?.industry} · {r.prospect?.status}</div>
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={()=>setExpandedResearch(expandedResearch===i?null:i)}
                      style={{padding:"5px 12px", borderRadius:8, border:"1px solid #E2E8F0", background:"#F8FAFC", color:"#64748B", fontSize:11, cursor:"pointer", fontWeight:600}}>
                      {expandedResearch===i?"Hide":"🔍 Intel"}
                    </button>
                    <button onClick={()=>copyMessage(i, r.message)}
                      style={{padding:"5px 14px", borderRadius:8, border:"none", background: copied===i?"#10B981":"#1E3A5F", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer"}}>
                      {copied===i ? "✓ Copied!" : "Copy"}
                    </button>
                    <button onClick={()=>{
                      const phone = r.prospect?.phone || (r.contacts?.[0]?.phone) || "";
                      if(phone) openWhatsApp(phone, r.message);
                      else openWhatsAppNoNum(r.message);
                    }} style={{padding:"5px 14px", borderRadius:8, border:"none", background:"#25D366", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer"}}>
                      WhatsApp ↗
                    </button>
                  </div>
                </div>

                {/* Apollo-style enrichment card */}
                {expandedResearch===i && (
                  <div style={{padding:"16px 18px", background:"#F8FAFC", borderBottom:"1px solid #F1F5F9"}}>
                    <div style={{fontSize:11, fontWeight:700, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12}}>SeriRasa AI — Company Intelligence</div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12}}>
                      {[
                        {label:"Company size", value:r.companySize},
                        {label:"Est. revenue", value:r.estimatedRevenue},
                        {label:"Website", value:r.website, link:r.website},
                        {label:"Company phone", value:r.companyPhone},
                      ].filter(f=>f.value).map((f,j)=>(
                        <div key={j} style={{background:"#fff", borderRadius:8, padding:"10px 12px", border:"1px solid #E2E8F0"}}>
                          <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{f.label}</div>
                          {f.link ? <a href={f.link} target="_blank" rel="noreferrer" style={{fontSize:12, fontWeight:600, color:"#1E40AF", textDecoration:"none"}}>{f.value}</a>
                            : <div style={{fontSize:12, fontWeight:600, color:"#0F172A"}}>{f.value}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Decision maker card */}
                    {(r.decisionMakerName || r.decisionMakerTitle) && (
                      <div style={{background:"#F0FDF4", borderRadius:10, padding:"12px 14px", marginBottom:12, border:"1px solid #BBF7D0"}}>
                        <div style={{fontSize:10, color:"#166534", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8, fontWeight:700}}>Decision maker</div>
                        <div style={{display:"flex", alignItems:"flex-start", gap:12}}>
                          <div style={{width:36, height:36, borderRadius:"50%", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0}}>
                            {(r.decisionMakerName||r.decisionMakerTitle||"?")[0].toUpperCase()}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13, fontWeight:700, color:"#0F172A"}}>{r.decisionMakerName || "—"}</div>
                            <div style={{fontSize:11, color:"#64748B", marginBottom:6}}>{r.decisionMakerTitle}</div>
                            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                              {r.decisionMakerEmail && (
                                <a href={`mailto:${r.decisionMakerEmail}`} style={{fontSize:11, color:"#1E40AF", textDecoration:"none", background:"#EFF6FF", padding:"2px 8px", borderRadius:99}}>
                                  ✉️ {r.decisionMakerEmail}
                                </a>
                              )}
                              {r.decisionMakerLinkedIn && (
                                <a href={r.decisionMakerLinkedIn} target="_blank" rel="noreferrer" style={{fontSize:11, color:"#0077B5", textDecoration:"none", background:"#E7F3FB", padding:"2px 8px", borderRadius:99}}>
                                  LinkedIn ↗
                                </a>
                              )}
                            </div>
                          </div>
                          {r.confidenceScore && (
                            <span style={{fontSize:10, padding:"3px 8px", borderRadius:99, fontWeight:700,
                              background: r.confidenceScore==="high"?"#DCFCE7":r.confidenceScore==="medium"?"#FFFBEB":"#F1F5F9",
                              color: r.confidenceScore==="high"?"#166534":r.confidenceScore==="medium"?"#92400E":"#64748B"}}>
                              {r.confidenceScore} confidence
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div style={{fontSize:12, color:"#374151", lineHeight:1.7, marginBottom:10}}>{r.summary}</div>
                    {r.ingredientNeeds && (
                      <div style={{fontSize:12, color:"#374151", marginBottom:8}}>
                        <span style={{fontWeight:600, color:"#64748B"}}>Ingredient needs: </span>{r.ingredientNeeds}
                      </div>
                    )}
                    {r.recentTrigger && (
                      <div style={{background:"#FFFBEB", borderRadius:8, padding:"8px 12px", marginBottom:10, border:"1px solid #FDE68A"}}>
                        <span style={{fontSize:11, fontWeight:700, color:"#92400E"}}>🔔 Trigger: </span>
                        <span style={{fontSize:12, color:"#78350F"}}>{r.recentTrigger}</span>
                      </div>
                    )}
                    {r.approachTiming && (
                      <div style={{fontSize:12, color:"#6366F1", marginBottom:8}}>
                        <span style={{fontWeight:600}}>⏰ Best time to reach out: </span>{r.approachTiming}
                      </div>
                    )}
                    {r.suggestedProducts?.length > 0 && (
                      <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:8, alignItems:"center"}}>
                        <span style={{fontSize:11, color:"#64748B", fontWeight:600}}>Suggested products:</span>
                        {r.suggestedProducts.map((sp,j) => (
                          <span key={j} style={{fontSize:11, background:"#EFF6FF", color:"#1E40AF", padding:"3px 10px", borderRadius:99, fontWeight:500}}>{sp}</span>
                        ))}
                      </div>
                    )}
                    {r.pitchAngle && <div style={{fontSize:12, color:"#6366F1", fontStyle:"italic", borderTop:"1px solid #E2E8F0", paddingTop:8, marginTop:4}}>💡 {r.pitchAngle}</div>}
                  </div>
                )}

                {/* Message */}
                <div style={{padding:"14px 18px"}}>
                  <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8, fontWeight:700}}>WhatsApp message</div>
                  <textarea defaultValue={r.message} rows={4}
                    style={{...inp, width:"100%", resize:"vertical", lineHeight:1.7, fontSize:13, boxSizing:"border-box"}}
                    onChange={e=>{ const updated=[...batchMessages]; updated[i]={...updated[i],message:e.target.value}; setBatchMessages(updated); }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── REACTIVATION RADAR ── */}
      {activeSection === "radar" && (
        <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
          <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9"}}>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Reactivation radar</div>
            <div style={{fontSize:11, color:"#94A3B8", marginTop:2}}>Existing customers who haven't ordered in 60+ days</div>
          </div>
          {(() => {
            const now = new Date();
            const invoiceMap = {};
            (ivData||[]).forEach(inv => {
              const name = (inv.companyname||inv.branchname||"").trim();
              if (!name) return;
              const date = new Date(inv.docdate);
              if (!invoiceMap[name] || date > invoiceMap[name].lastDate) {
                invoiceMap[name] = { name, lastDate: date, lastDocno: inv.docno, totalAmt: (invoiceMap[name]?.totalAmt||0) + (inv.docamt||0) };
              } else {
                invoiceMap[name].totalAmt = (invoiceMap[name].totalAmt||0) + (inv.docamt||0);
              }
            });
            const lapsed = Object.values(invoiceMap)
              .filter(c => { const days = Math.floor((now-c.lastDate)/86400000); return days>=60 && days<=400; })
              .sort((a,b) => b.totalAmt - a.totalAmt)
              .slice(0, 20);
            if (!lapsed.length) return <div style={{padding:"32px", textAlign:"center", color:"#94A3B8"}}>No lapsed customers found</div>;
            return (
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
                <thead>
                  <tr style={{background:"#F8FAFC"}}>
                    {["Customer","Last Order","Days Lapsed","Total Revenue",""].map(h=>(
                      <th key={h} style={{padding:"9px 14px", textAlign:"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lapsed.map((c,i) => {
                    const days = Math.floor((now-c.lastDate)/86400000);
                    return (
                      <tr key={i} style={{borderTop:"1px solid #F1F5F9"}}>
                        <td style={{padding:"10px 14px", fontWeight:600, color:"#0F172A"}}>{c.name}</td>
                        <td style={{padding:"10px 14px", color:"#64748B"}}>{c.lastDate.toLocaleDateString("en-MY")}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{color: days>120?"#EF4444":days>90?"#F59E0B":"#64748B", fontWeight:700}}>{days}d</span>
                        </td>
                        <td style={{padding:"10px 14px", fontWeight:700, color:"#0F172A"}}>RM {(c.totalAmt||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td style={{padding:"10px 14px"}}>
                          <button onClick={()=>{ setSelected([{id:`r-${i}`,company:c.name,industry:"Existing Customer",status:"Win-Back Needed",notes:`Last ordered ${days} days ago. Total revenue RM ${(c.totalAmt||0).toLocaleString()}`}]); setActiveSection("batch"); setTimeout(researchAndGenerate,100); }}
                            style={{padding:"5px 12px", borderRadius:8, border:"none", background:"#1E3A5F", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap"}}>
                            ✨ Reactivate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* ── PROSPECT SEARCH ── */}
      {activeSection === "search" && (
        <div style={{display:"flex", flexDirection:"column", gap:16}}>
          {/* Search box */}
          <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", padding:"20px 24px"}}>
            <div style={{fontSize:13, fontWeight:800, color:"#0F172A", marginBottom:4}}>Prospect search</div>
            <div style={{fontSize:12, color:"#94A3B8", marginBottom:16}}>Search any company — AI researches it and returns decision makers, contact details, and a tailored pitch</div>
            <div style={{display:"flex", gap:10}}>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&searchProspect()}
                placeholder="e.g. Ramly Food Processing, Gardenia Bakeries, Zus Coffee..."
                style={{...inp, flex:1, padding:"10px 14px", fontSize:13}} />
              <input value={searchIndustry} onChange={e=>setSearchIndustry(e.target.value)}
                placeholder="Industry (optional)"
                style={{...inp, width:200, padding:"10px 14px", fontSize:13}} />
              <button onClick={searchProspect} disabled={!searchQuery.trim()||searching}
                style={{padding:"10px 24px", borderRadius:10, border:"none", background:(!searchQuery.trim()||searching)?"#CBD5E1":"#1E3A5F", color:"#fff", fontSize:13, fontWeight:700, cursor:(!searchQuery.trim()||searching)?"not-allowed":"pointer", whiteSpace:"nowrap"}}>
                {searching ? "Searching..." : "🔍 Search"}
              </button>
            </div>
            {searchError && <div style={{fontSize:12, color:"#EF4444", marginTop:8}}>{searchError}</div>}
          </div>

          {/* Searching state */}
          {searching && (
            <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", padding:"40px", textAlign:"center"}}>
              <div style={{fontSize:32, marginBottom:12}}>🔍</div>
              <div style={{fontSize:15, fontWeight:700, color:"#0F172A", marginBottom:6}}>Researching {searchQuery}...</div>
              <div style={{fontSize:12, color:"#94A3B8"}}>Searching LinkedIn, company website, news, and industry directories</div>
            </div>
          )}

          {/* Result card */}
          {searchResult && !searching && (
            <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
              {/* Company header */}
              <div style={{padding:"18px 24px", borderBottom:"1px solid #F1F5F9", background:"linear-gradient(135deg,#1E3A5F,#0F2442)", display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:16, fontWeight:800, color:"#fff"}}>{searchResult.companyName}</div>
                  <div style={{fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:2}}>{searchResult.industry}</div>
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center"}}>
                  {searchResult.confidenceScore && (
                    <span style={{fontSize:10, padding:"4px 10px", borderRadius:99, fontWeight:700,
                      background: searchResult.confidenceScore==="high"?"#DCFCE7":searchResult.confidenceScore==="medium"?"#FFFBEB":"rgba(255,255,255,0.1)",
                      color: searchResult.confidenceScore==="high"?"#166534":searchResult.confidenceScore==="medium"?"#92400E":"rgba(255,255,255,0.7)"}}>
                      {searchResult.confidenceScore} confidence
                    </span>
                  )}
                  {searchResult.website && (
                    <a href={searchResult.website} target="_blank" rel="noreferrer"
                      style={{fontSize:11, color:"rgba(255,255,255,0.8)", background:"rgba(255,255,255,0.1)", padding:"4px 12px", borderRadius:99, textDecoration:"none"}}>
                      Website ↗
                    </a>
                  )}
                </div>
              </div>

              <div style={{padding:"18px 24px"}}>
                {/* Verification disclaimer */}
                {searchResult.confidenceScore !== "high" && (
                  <div style={{background:"#FFFBEB", borderRadius:8, padding:"8px 14px", marginBottom:12, border:"1px solid #FDE68A", fontSize:11, color:"#92400E"}}>
                    ⚠️ <strong>Verify before use</strong> — some details may be incomplete. Cross-check address, phone, and contacts before reaching out.
                  </div>
                )}
                {searchResult.sources?.length > 0 && (
                  <div style={{background:"#F8FAFC", borderRadius:8, padding:"8px 14px", marginBottom:12, fontSize:11, color:"#64748B", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
                    <span style={{fontWeight:600}}>Sources:</span>
                    {searchResult.sources.slice(0,4).map((s,i)=>(
                      <a key={i} href={s} target="_blank" rel="noreferrer" style={{color:"#1E40AF", textDecoration:"none", background:"#EFF6FF", padding:"2px 8px", borderRadius:99}}>
                        {s.replace(/https?:\/\/(www\.)?/,"").split("/")[0]}
                      </a>
                    ))}
                  </div>
                )}

              {/* Company overview row */}
                <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16}}>
                  {[
                    {label:"Company size", value:searchResult.companySize},
                    {label:"Est. revenue", value:searchResult.estimatedRevenue},
                    {label:"Phone", value:searchResult.companyPhone},
                    {label:"Address", value:searchResult.companyAddress},
                  ].filter(f=>f.value).map((f,i)=>(
                    <div key={i} style={{background:"#F8FAFC", borderRadius:8, padding:"10px 12px"}}>
                      <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3}}>{f.label}</div>
                      <div style={{fontSize:12, fontWeight:600, color:"#0F172A"}}>{f.value}</div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div style={{fontSize:13, color:"#374151", lineHeight:1.7, marginBottom:16}}>{searchResult.summary}</div>

                {/* Contacts */}
                {searchResult.contacts?.length > 0 && (
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11, fontWeight:700, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Contacts found ({searchResult.contacts.length})</div>
                    <div style={{display:"flex", flexDirection:"column", gap:10}}>
                      {searchResult.contacts.map((c,i)=>(
                        <div key={i} style={{background:"#F0FDF4", borderRadius:10, padding:"12px 14px", border:"1px solid #BBF7D0", display:"flex", alignItems:"flex-start", gap:12}}>
                          <div style={{width:36, height:36, borderRadius:"50%", background:"#1E3A5F", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0}}>
                            {(c.name||c.title||"?")[0].toUpperCase()}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13, fontWeight:700, color:"#0F172A"}}>{c.name||"Unknown"}</div>
                            <div style={{fontSize:11, color:"#64748B", marginBottom:6}}>{c.title}</div>
                            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                              {c.email && <a href={`mailto:${c.email}`} style={{fontSize:11, color:"#1E40AF", background:"#EFF6FF", padding:"2px 8px", borderRadius:99, textDecoration:"none"}}>✉️ {c.email}</a>}
                              {c.phone && <span style={{fontSize:11, color:"#374151", background:"#F1F5F9", padding:"2px 8px", borderRadius:99}}>📞 {c.phone}</span>}
                              {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" style={{fontSize:11, color:"#0077B5", background:"#E7F3FB", padding:"2px 8px", borderRadius:99, textDecoration:"none"}}>LinkedIn ↗</a>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trigger + suggested products */}
                {searchResult.recentTrigger && (
                  <div style={{background:"#FFFBEB", borderRadius:8, padding:"10px 14px", marginBottom:12, border:"1px solid #FDE68A"}}>
                    <span style={{fontSize:11, fontWeight:700, color:"#92400E"}}>🔔 Sales trigger: </span>
                    <span style={{fontSize:12, color:"#78350F"}}>{searchResult.recentTrigger}</span>
                  </div>
                )}
                {searchResult.ingredientNeeds && (
                  <div style={{fontSize:12, color:"#374151", marginBottom:10}}>
                    <span style={{fontWeight:600, color:"#64748B"}}>Ingredient needs: </span>{searchResult.ingredientNeeds}
                  </div>
                )}
                {searchResult.suggestedProducts?.length > 0 && (
                  <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:12, alignItems:"center"}}>
                    <span style={{fontSize:11, color:"#64748B", fontWeight:600}}>Suggested products:</span>
                    {searchResult.suggestedProducts.map((sp,i)=>(
                      <span key={i} style={{fontSize:11, background:"#EFF6FF", color:"#1E40AF", padding:"3px 10px", borderRadius:99, fontWeight:500}}>{sp}</span>
                    ))}
                  </div>
                )}
                {searchResult.pitchAngle && (
                  <div style={{fontSize:12, color:"#6366F1", fontStyle:"italic", borderTop:"1px solid #F1F5F9", paddingTop:10, marginBottom:12}}>
                    💡 {searchResult.pitchAngle}
                  </div>
                )}
                {searchResult.approachTiming && (
                  <div style={{fontSize:12, color:"#059669", marginBottom:16}}>
                    ⏰ {searchResult.approachTiming}
                  </div>
                )}

                {/* Actions */}
                <div style={{display:"flex", gap:10, paddingTop:12, borderTop:"1px solid #F1F5F9"}}>
                  <button onClick={()=>{ setSelected([{id:`s-${Date.now()}`, company:searchResult.companyName, industry:searchResult.industry||"", status:"To Contact", notes:searchResult.summary}]); setActiveSection("batch"); setTimeout(researchAndGenerate,100); }}
                    style={{padding:"9px 20px", borderRadius:10, border:"none", background:"#1E3A5F", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer"}}>
                    ✨ Generate outreach message
                  </button>
                  <button onClick={()=>setSearchQuery("")}
                    style={{padding:"9px 16px", borderRadius:10, border:"1px solid #E2E8F0", background:"#F8FAFC", color:"#64748B", fontSize:13, cursor:"pointer"}}>
                    Search another
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search history */}
          {searchHistory.length > 0 && !searching && !searchResult && (
            <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
              <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9"}}>
                <div style={{fontSize:12, fontWeight:700, color:"#64748B"}}>Recent searches</div>
              </div>
              {searchHistory.map((h,i)=>(
                <div key={i} onClick={()=>setSearchResult(h.result)}
                  style={{padding:"10px 18px", borderBottom:"1px solid #F8FAFC", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:600, color:"#0F172A"}}>{h.query}</div>
                    <div style={{fontSize:11, color:"#94A3B8"}}>{new Date(h.timestamp).toLocaleTimeString("en-MY")}</div>
                  </div>
                  <span style={{fontSize:11, color:"#94A3B8"}}>View →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE INTEL ── */}
      {activeSection === "velocity" && (
        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          {/* Industry conversion breakdown */}
          <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
            <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9"}}>
              <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Pipeline by industry</div>
            </div>
            <div style={{padding:"14px 18px"}}>
              {(() => {
                const byIndustry = {};
                prospects.forEach(p => {
                  if (!byIndustry[p.industry]) byIndustry[p.industry] = { total:0, hot:0, contacted:0, converted:0 };
                  byIndustry[p.industry].total++;
                  if (p.status==="Hot Lead") byIndustry[p.industry].hot++;
                  if (p.status==="Contacted / Waiting") byIndustry[p.industry].contacted++;
                });
                return Object.entries(byIndustry).sort((a,b)=>b[1].total-a[1].total).map(([ind,s],i)=>(
                  <div key={i} style={{display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:"1px solid #F8FAFC"}}>
                    <div style={{width:140, fontSize:12, color:"#374151", fontWeight:500, flexShrink:0}}>{ind}</div>
                    <div style={{flex:1, height:8, background:"#F1F5F9", borderRadius:99, overflow:"hidden"}}>
                      <div style={{height:"100%", background:"#1E3A5F", borderRadius:99, width:`${(s.contacted+s.hot)/s.total*100}%`}}/>
                    </div>
                    <div style={{fontSize:11, color:"#64748B", width:80, textAlign:"right"}}>{s.contacted+s.hot}/{s.total} engaged</div>
                    {s.hot>0 && <span style={{fontSize:10, background:"#FEF2F2", color:"#991B1B", padding:"2px 6px", borderRadius:99, fontWeight:700}}>🔥 {s.hot} hot</span>}
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Agent performance */}
          <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
            <div style={{padding:"14px 18px", borderBottom:"1px solid #F1F5F9"}}>
              <div style={{fontSize:13, fontWeight:800, color:"#0F172A"}}>Agent performance</div>
            </div>
            <div style={{padding:"14px 18px"}}>
              {(() => {
                const byAgent = {};
                prospects.forEach(p => {
                  if (!p.agent) return;
                  if (!byAgent[p.agent]) byAgent[p.agent] = { total:0, contacted:0, hot:0 };
                  byAgent[p.agent].total++;
                  if (p.status!=="To Contact") byAgent[p.agent].contacted++;
                  if (p.status==="Hot Lead") byAgent[p.agent].hot++;
                });
                return Object.entries(byAgent).map(([agent,s],i)=>(
                  <div key={i} style={{display:"flex", alignItems:"center", gap:14, padding:"10px 0", borderBottom:"1px solid #F8FAFC"}}>
                    <div style={{width:32, height:32, borderRadius:"50%", background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#1E3A5F", flexShrink:0}}>
                      {agent[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:600, color:"#0F172A"}}>{agent}</div>
                      <div style={{fontSize:11, color:"#94A3B8"}}>{s.contacted} contacted of {s.total} assigned · {s.hot} hot leads</div>
                    </div>
                    <div style={{fontSize:13, fontWeight:700, color:"#1E3A5F"}}>{s.total?Math.round(s.contacted/s.total*100):0}%</div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* AI insight */}
          <div style={{background:"#EFF6FF", borderRadius:16, padding:"16px 20px", border:"1px solid #BFDBFE"}}>
            <div style={{fontSize:12, fontWeight:700, color:"#1E40AF", marginBottom:6}}>💡 AI insight</div>
            <div style={{fontSize:13, color:"#1E3A5F", lineHeight:1.7}}>
              {(() => {
                const hotIndustries = {};
                prospects.filter(p=>p.status==="Hot Lead").forEach(p=>{ hotIndustries[p.industry]=(hotIndustries[p.industry]||0)+1; });
                const top = Object.entries(hotIndustries).sort((a,b)=>b[1]-a[1])[0];
                const notContacted = prospects.filter(p=>p.status==="To Contact").length;
                const contacted = prospects.filter(p=>p.status!=="To Contact").length;
                const rate = prospects.length ? Math.round(contacted/prospects.length*100) : 0;
                return `Overall contact rate is ${rate}%. ${notContacted} prospects haven't been reached yet. ${top ? `${top[0]} has the most hot leads (${top[1]}) — prioritise closing these first.` : "Keep pushing the pipeline!"} Focus on converting Contacted/Waiting leads before opening new ones.`;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
