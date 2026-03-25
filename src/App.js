import React, { useState, useEffect, useRef } from "react";
import SeriRasaAI from "./AICopilot";
import DemandTab from "./DemandTab";
import DocumentTracker from "./DocumentTracker";
import ProcurementTab from "./ProcurementTab";
import SalesDashboard from "./SalesDashboard";
import OperationsHome from "./OperationsHome";

// ─── USER ACCOUNTS ──────────────────────────────────────────
// Users are now stored in Redis — this is just for reference/fallback
const USERS = [
  { id: "keshvin",  name: "Keshvin",  email: "keshvin.s@mazzaspice.com",  role: "admin" },
  { id: "jasmine",  name: "Jasmine",  email: "jasmine@mazzaspice.com",    role: "admin" },
  { id: "varinder", name: "Varinder", email: "varinder@mazzaspice.com",   role: "admin" },
  { id: "narin",    name: "Narin",    email: "narin@mazzaspice.com",      role: "admin" },
  { id: "vitya",    name: "Vitya",    email: "salesadmin@mazzaspice.com", role: "admin" },
  { id: "navin",    name: "Navin",    email: "nav@mazzaspice.com",        role: "admin" },
];
const SESSION_KEY = "mazza_session_v1";

const INITIAL_PROSPECTS = [
  { id: 1, company: "AB Mauri Malaysia Sdn Bhd", category: "Cold Prospects", industry: "Bakery Ingredients", agent: "Jasmine", phone: "03-89612864/2209", contact: "", status: "To Contact", notes: "" },
  { id: 2, company: "Gardenia Bakeries", category: "Cold Prospects", industry: "Bakery", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 3, company: "Bakels Malaysia", category: "Cold Prospects", industry: "Bakery Ingredients", agent: "Jasmine", phone: "03-51916396", contact: "", status: "To Contact", notes: "" },
  { id: 4, company: "Bake with Yen", category: "Cold Prospects", industry: "Bakery", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 5, company: "Sushi King", category: "Cold Prospects", industry: "Restaurant Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 6, company: "Family Mart", category: "Cold Prospects", industry: "Convenience Retail", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 7, company: "Hiestand", category: "Cold Prospects", industry: "Bakery", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 8, company: "Hormel Foods", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 9, company: "QL Central Kitchen", category: "Cold Prospects", industry: "Central Kitchen", agent: "Jasmine", phone: "03-5524 2222", contact: "", status: "To Contact", notes: "" },
  { id: 10, company: "Oriental Food Industry", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "03-8061 3285", contact: "", status: "To Contact", notes: "" },
  { id: 11, company: "Miaow Miaow", category: "Cold Prospects", industry: "Snack Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 12, company: "Snek Ku", category: "Cold Prospects", industry: "Snack Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 13, company: "Mamasab Bakery", category: "Cold Prospects", industry: "Bakery", agent: "Jasmine", phone: "016-6702000", contact: "", status: "To Contact", notes: "" },
  { id: 14, company: "Rasapop (Sambal Nyet)", category: "Cold Prospects", industry: "Snack Manufacturer", agent: "Jasmine", phone: "011-55118388", contact: "", status: "To Contact", notes: "" },
  { id: 15, company: "HL World Food Industry (Kimchi Mfr)", category: "Cold Prospects", industry: "Korean Food Manufacturer", agent: "Jasmine", phone: "017-7421125", contact: "", status: "To Contact", notes: "" },
  { id: 16, company: "MariMogo - Korean Food Manufacturer", category: "Cold Prospects", industry: "Korean Food Manufacturer", agent: "Jasmine", phone: "016-6905670", contact: "", status: "To Contact", notes: "" },
  { id: 17, company: "Seoul Food Sdn Bhd (Kimchi Mfr)", category: "Cold Prospects", industry: "Korean Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 18, company: "Halal Kimchi", category: "Cold Prospects", industry: "Korean Food Manufacturer", agent: "Jasmine", phone: "017-7471721", contact: "", status: "To Contact", notes: "" },
  { id: 19, company: "Hainan Kopitiam", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 20, company: "Achiban Food Industries", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "012-3721828", contact: "", status: "To Contact", notes: "" },
  { id: 21, company: "GSC", category: "Cold Prospects", industry: "Entertainment & Retail", agent: "Jasmine", phone: "03-78068888", contact: "", status: "To Contact", notes: "" },
  { id: 22, company: "Nando's", category: "Cold Prospects", industry: "Restaurant Chain", agent: "Jasmine", phone: "03-7848 7488", contact: "", status: "To Contact", notes: "" },
  { id: 23, company: "Coffee Bean & Tea Leaf", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "03-61589933", contact: "", status: "To Contact", notes: "" },
  { id: 24, company: "Ayam Brand Malaysia", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 25, company: "Pak Mat Western", category: "Cold Prospects", industry: "Restaurant Chain", agent: "Jasmine", phone: "04-5040008", contact: "", status: "To Contact", notes: "" },
  { id: 26, company: "Umiyani Food Industry", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "010-3928411", contact: "", status: "To Contact", notes: "" },
  { id: 27, company: "Hais Food M Sdn Bhd", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "65 67528588", contact: "", status: "To Contact", notes: "" },
  { id: 28, company: "Kitchen Food (K-Foods)", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 29, company: "Ramly Food Processing", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 30, company: "Tean's Gourmet", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 31, company: "Seri Murni", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 32, company: "HACO Asia Pacific", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 33, company: "Zus Coffee", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "Jerry to share contact" },
  { id: 34, company: "Bask Bear Coffee & Toasties", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 35, company: "Gigi Coffee", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 36, company: "HWC Coffee", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 37, company: "Kenangan Coffee", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 38, company: "Paris Baguette", category: "Cold Prospects", industry: "Bakery", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 39, company: "Rich Kopitiam", category: "Cold Prospects", industry: "F&B Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 40, company: "Grand Pacific F&B Sdn. Bhd.", category: "Cold Prospects", industry: "F&B Distributor", agent: "Trade Exhibition", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 41, company: "Rosfaniaga Services Sdn Bhd", category: "Cold Prospects", industry: "Food Services", agent: "Trade Exhibition", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 42, company: "KimYam Group (Bumimas Food Mfg)", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Trade Exhibition", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 43, company: "QQ Group of Companies", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Trade Exhibition", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 44, company: "MyBizcuit", category: "Cold Prospects", industry: "Snack Manufacturer", agent: "Trade Exhibition", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 45, company: "FFM Berhad", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Trade Exhibition", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 46, company: "Hua Huat Manufacturing Sdn Bhd", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Navin", phone: "012-724 9009", contact: "Eryn Wong", status: "Waiting for Reply", notes: "Navin has taken over trying to get through to her." },
  { id: 47, company: "Nestle Products Sdn Bhd", category: "Inactive Customers", industry: "Food Manufacturer", agent: "Navin", phone: "016-311 4347", contact: "Julian Peter Ranjit", status: "On Hold", notes: "Need FSSC certified before meeting." },
  { id: 48, company: "Royale Chulan Curve", category: "Cold Prospects", industry: "Hotel F&B", agent: "Jasmine", phone: "", contact: "Wani", status: "To Contact", notes: "Contact given by Royale Chulan Damansara Purchaser." },
  { id: 49, company: "Indian Empire Restaurant", category: "Cold Prospects", industry: "Restaurant", agent: "Office", phone: "", contact: "Wins", status: "Waiting for Reply", notes: "Sent product catalogue 24.11.25. Pending update." },
  { id: 50, company: "Mat Rock", category: "Cold Prospects", industry: "F&B", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 51, company: "Yakin Food", category: "Cold Prospects", industry: "Food Manufacturer", agent: "Jasmine", phone: "", contact: "Zaitun", status: "To Contact", notes: "" },
  { id: 52, company: "Boat Noodle", category: "Cold Prospects", industry: "Restaurant Chain", agent: "Jasmine", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 53, company: "Burung Hantu", category: "Cold Prospects", industry: "Restaurant", agent: "Jasmine", phone: "", contact: "Amy", status: "To Contact", notes: "" },
  { id: 54, company: "Adabi", category: "Cold Prospects", industry: "Spice & Food Manufacturer", agent: "Agro", phone: "", contact: "", status: "Meeting to Schedule", notes: "Pending update from Ganesh" },
  { id: 55, company: "Berkat Store", category: "Cold Prospects", industry: "Food Retail", agent: "Agro", phone: "", contact: "", status: "Meeting to Schedule", notes: "Pending update from Ganesh" },
  { id: 56, company: "Classic Fine Foods Sdn Bhd", category: "Cold Prospects", industry: "Food Distribution", agent: "Navin", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 57, company: "Zam Zam Trading Sdn Bhd", category: "Cold Prospects", industry: "Food Trading", agent: "Navin", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 58, company: "Aeon", category: "Warm Leads", industry: "Retail Supermarket", agent: "Agro", phone: "", contact: "", status: "Meeting to Schedule", notes: "Pending update from Ganesh. Proposal to be created by Jasmine." },
  { id: 59, company: "Econsave", category: "Warm Leads", industry: "Retail Supermarket", agent: "Agro", phone: "", contact: "", status: "Meeting to Schedule", notes: "Jasmine to contact fresh dept PIC. Meeting to set with Kuna." },
  { id: 60, company: "Mydin", category: "Warm Leads", industry: "Retail Supermarket", agent: "Agro", phone: "", contact: "", status: "Meeting to Schedule", notes: "Pending meeting details from Kuna." },
  { id: 61, company: "Idayar", category: "Warm Leads", industry: "Food Distributor", agent: "Agro", phone: "", contact: "", status: "Meeting to Schedule", notes: "Jasmine to send Dev to close. Client familiar with Agro products." },
  { id: 62, company: "Neutrovis", category: "Warm Leads", industry: "Health & Food Brand", agent: "Agro", phone: "", contact: "Jason", status: "Under Review", notes: "Sample/testing/pricing stage." },
  { id: 63, company: "RVJ Global Resources", category: "Inactive Customers", industry: "Food Distributor", agent: "Office", phone: "", contact: "Raveena", status: "Win-Back Needed", notes: "To follow up with their purchasing." },
  { id: 64, company: "Penyet Penyet.com", category: "Inactive Customers", industry: "Restaurant Chain", agent: "Office", phone: "", contact: "", status: "Win-Back Needed", notes: "" },
  { id: 65, company: "99 Speedmart", category: "Cold Prospects", industry: "Retail Supermarket", agent: "", phone: "", contact: "", status: "To Contact", notes: "Go through the murruku guy from Agro" },
  { id: 66, company: "Jaya Grocer", category: "Cold Prospects", industry: "Retail Supermarket", agent: "", phone: "", contact: "", status: "To Contact", notes: "Call grab lady for purchaser number" },
  { id: 67, company: "Lotus", category: "Cold Prospects", industry: "Retail Supermarket", agent: "", phone: "", contact: "", status: "To Contact", notes: "Go through Jun Meng" },
  { id: 68, company: "Mas Awana", category: "Cold Prospects", industry: "F&B", agent: "", phone: "", contact: "", status: "To Contact", notes: "Mention Navin and Wendy." },
  { id: 69, company: "Oriental Kopi", category: "Cold Prospects", industry: "F&B Chain", agent: "", phone: "", contact: "", status: "To Contact", notes: "" },
  { id: 70, company: "Ikea", category: "Cold Prospects", industry: "Retail & Food Service", agent: "", phone: "", contact: "", status: "To Contact", notes: "Wait for meeting with Jerry" },
];

const STATUS_CONFIG = {
  "To Contact":          { color: "#3B82F6", bg: "#1e3a5f" },
  "Waiting for Reply":   { color: "#F59E0B", bg: "#3d2e00" },
  "Meeting to Schedule": { color: "#8B5CF6", bg: "#2d1f4a" },
  "Under Review":        { color: "#06B6D4", bg: "#0c2d38" },
  "Win-Back Needed":     { color: "#EC4899", bg: "#3a0f2a" },
  "On Hold":             { color: "#6B7280", bg: "#1f1f1f" },
  "Contacted":           { color: "#10B981", bg: "#0a2e1f" },
  "Hot Lead 🔥":         { color: "#EF4444", bg: "#3a0f0f" },
};

const CAT_COLOR = {
  "Cold Prospects":     "#3B82F6",
  "Warm Leads":         "#F59E0B",
  "Inactive Customers": "#8B5CF6",
};

const SEQ_OPTIONS = {
  "Cold Prospects": [
    { label: "Message 1 — First Contact", value: "cold_1" },
    { label: "Message 2 — Follow-Up (Day 4)", value: "cold_2" },
    { label: "Message 3 — Final Touch (Day 12)", value: "cold_3" },
  ],
  "Warm Leads": [
    { label: "Meeting Confirmation", value: "warm_confirm" },
    { label: "Post-Meeting Follow-Up", value: "warm_post" },
  ],
  "Inactive Customers": [
    { label: "Win-Back Message 1", value: "inactive_1" },
    { label: "Win-Back Message 2 — Value Nudge", value: "inactive_2" },
  ],
};

const STORAGE_KEY = "mazza_prospects_v2";

// ─── LOGIN SCREEN ─────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // login | change_password | success
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [showPw, setShowPw] = useState(false);

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ action:"login", email, password })
      });
      const data = await res.json();
      if (data.user) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(data.user)); } catch {}
        onLogin(data.user);
      } else {
        setError(data.error || "Incorrect email or password.");
      }
    } catch(e) {
      setError("Connection error. Please try again.");
    }
    setLoading(false);
  }

  async function handleChangePassword() {
    setPwError("");
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match"); return; }
    if (newPassword.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    const strong = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&!#^])[A-Za-z\d@$!%*?&!#^]{8,}$/;
    if (!strong.test(newPassword)) {
      setPwError("Need: uppercase, lowercase, number and a symbol (@$!%*?&!#^)");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ action:"change_password", email, oldPassword, newPassword })
      });
      const data = await res.json();
      if (data.success) { setMode("success"); }
      else { setPwError(data.error || "Failed to change password"); }
    } catch(e) { setPwError("Connection error"); }
    setLoading(false);
  }

  const inp = { width:"100%", padding:"12px 14px", background:"#F8FAFC", border:"1px solid #CBD5E1", borderRadius:12, color:"#0F172A", fontSize:14, fontFamily:"'Plus Jakarta Sans',sans-serif", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#F0F4F8 0%,#E2E8F0 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"16px"}}>
      <div style={{width:"100%",maxWidth:400,padding:24}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:90,height:90,borderRadius:"50%",background:"#1E3A5F",margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
            <div style={{color:"#fff",fontSize:28,fontWeight:800}}>SR</div>
          </div>
          <div style={{fontSize:18,fontWeight:800,color:"#1E3A5F"}}>Seri Rasa OCC</div>
          <div style={{fontSize:11,color:"#94A3B8",letterSpacing:"0.2em",textTransform:"uppercase",marginTop:4}}>Operations Command Centre</div>
        </div>

        {/* SUCCESS */}
        {mode === "success" && (
          <div style={{background:"#F0FDF4",borderRadius:24,padding:36,textAlign:"center",border:"1px solid #BBF7D0"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:8}}>Password Changed!</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>Sign in with your new password.</div>
            <button onClick={()=>{setMode("login");setOldPassword("");setNewPassword("");setConfirmPassword("");}}
              style={{width:"100%",padding:"13px",background:"#1E3A5F",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Back to Sign In
            </button>
          </div>
        )}

        {/* LOGIN */}
        {mode === "login" && (
          <div style={{background:"#fff",borderRadius:24,padding:36,border:"1px solid #E2E8F0",boxShadow:"0 20px 60px rgba(15,36,66,0.12)"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:24,color:"#0F172A"}}>Sign In</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"#64748B",letterSpacing:"0.05em",marginBottom:6,fontWeight:600}}>Email</div>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@mazzaspice.com" style={inp}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:"#64748B",letterSpacing:"0.05em",marginBottom:6,fontWeight:600}}>Password</div>
              <div style={{position:"relative"}}>
                <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={{...inp,paddingRight:44}}
                  onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
                <button onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94A3B8",fontSize:16}}>
                  {showPw?"🙈":"👁"}
                </button>
              </div>
            </div>
            {error && <div style={{padding:"10px 14px",background:"#FEF2F2",borderRadius:10,border:"1px solid #FECACA",fontSize:12,color:"#DC2626",marginBottom:14,fontWeight:500}}>{error}</div>}
            <button onClick={handleLogin} disabled={loading}
              style={{width:"100%",padding:"14px",background:loading?"#E2E8F0":"linear-gradient(135deg,#1E3A5F,#2D5A8E)",border:"none",borderRadius:12,color:loading?"#94A3B8":"#fff",fontSize:14,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:loading?"not-allowed":"pointer",boxShadow:loading?"none":"0 4px 20px rgba(15,36,66,0.25)"}}>
              {loading ? "Signing in..." : "Sign In →"}
            </button>
            <button onClick={()=>setMode("change_password")} style={{width:"100%",marginTop:12,padding:"10px",background:"none",border:"1px solid #E2E8F0",borderRadius:12,color:"#64748B",fontSize:13,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              🔑 Change my password
            </button>
          </div>
        )}

        {/* CHANGE PASSWORD */}
        {mode === "change_password" && (
          <div style={{background:"#fff",borderRadius:24,padding:36,border:"1px solid #E2E8F0",boxShadow:"0 20px 60px rgba(15,36,66,0.12)"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:6,color:"#0F172A"}}>Change Password</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:24}}>Password must be 8+ chars with uppercase, lowercase, number and symbol</div>
            {[
              {l:"Email",v:email,s:setEmail,ph:"your@mazzaspice.com",type:"email"},
              {l:"Current Password",v:oldPassword,s:setOldPassword,ph:"••••••••",type:"password"},
              {l:"New Password",v:newPassword,s:setNewPassword,ph:"Min 8 chars, mixed case + symbol",type:"password"},
              {l:"Confirm New Password",v:confirmPassword,s:setConfirmPassword,ph:"Repeat new password",type:"password"},
            ].map(f=>(
              <div key={f.l} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#64748B",letterSpacing:"0.05em",marginBottom:6,fontWeight:600}}>{f.l}</div>
                <input type={f.type} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            {pwError && <div style={{padding:"10px 14px",background:"#FEF2F2",borderRadius:10,border:"1px solid #FECACA",fontSize:12,color:"#DC2626",marginBottom:14}}>{pwError}</div>}
            <button onClick={handleChangePassword} disabled={loading}
              style={{width:"100%",padding:"14px",background:loading?"#E2E8F0":"#1E3A5F",border:"none",borderRadius:12,color:loading?"#94A3B8":"#fff",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer"}}>
              {loading?"Changing...":"Change Password"}
            </button>
            <button onClick={()=>setMode("login")} style={{width:"100%",marginTop:10,padding:"10px",background:"none",border:"1px solid #E2E8F0",borderRadius:12,color:"#64748B",fontSize:13,cursor:"pointer"}}>
              ← Back to Sign In
            </button>
          </div>
        )}

        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#94A3B8"}}>Contact Keshvin to reset your password</div>
      </div>
    </div>
  );
}

// ═══ PO INTAKE COMPONENT ═══
function POIntake({ currentUser }) {
  const [stage, setStage] = React.useState("upload");
  const [poText, setPoText] = React.useState("");
  const [poFile, setPoFile] = React.useState(null);
  const [extracted, setExtracted] = React.useState(null);
  const [editedItems, setEditedItems] = React.useState([]);
  const [soResult, setSoResult] = React.useState(null);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [duplicateInfo, setDuplicateInfo] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [ivResult, setIvResult] = React.useState(null);
  const [doResult, setDoResult] = React.useState(null);
  const [deliveryDateOverride, setDeliveryDateOverride] = React.useState('');
  const [invDoNote, setInvDoNote] = React.useState('');
  const [creatingInvDo, setCreatingInvDo] = React.useState(false);
  const [invDoError, setInvDoError] = React.useState('');
  const [invDoDuplicateInfo, setInvDoDuplicateInfo] = React.useState(null);
  const [customers, setCustomers] = React.useState([]);
  const [stockItems, setStockItems] = React.useState([]);
  const [history,          setHistory]          = React.useState([]);
  const [showHistory,      setShowHistory]      = React.useState(false);
  const [masterUpdated,    setMasterUpdated]    = React.useState(null);
  const [syncing,          setSyncing]          = React.useState(false);
  const fileRef = React.useRef();

  function loadMaster() {
    fetch("/api/prospects?type=master")
      .then(r=>r.json())
      .then(d=>{
        setCustomers(d.customers||[]);
        setStockItems(d.stockitems||[]);
        setMasterUpdated(d.customersUpdated || d.stockUpdated || null);
      });
  }

  async function refreshMaster() {
    setSyncing(true);
    try {
      await fetch("/api/sync-master", { method:"GET" });
      await loadMaster();
    } catch(e) { console.error(e); }
    setSyncing(false);
  }

  React.useEffect(() => {
    loadMaster();
    fetch("/api/prospects?type=po_intake_list")
      .then(r=>r.json())
      .then(d=>setHistory(d.list||[]));
  }, []);

  const inp = { padding:"9px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:13, outline:"none", width:"100%", color:"#0F172A", background:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", boxSizing:"border-box" };

  function handleFile(file) { if(!file) return; setPoFile(file); }

  async function processPO() {
    setStage("processing");
    setErrorMsg("");
    try {
      // Build stock item list for AI context (first 200 items)
      const itemContext = stockItems.slice(0,200).map(i=>`${i.code}|${i.description}`).join("\n");
      const custContext = customers.map(c=>`${c.code}|${c.name}`).join("\n");

      let messages = [];
      let isPDF = false;
      let base64 = null;
      if (poFile) {
        const isImage = poFile.type.startsWith("image/");
        isPDF = poFile.type==="application/pdf";
        base64 = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(poFile); });
        // Images: send as vision. PDFs: send as base64 text for server-side extraction.
        const contentBlock = isImage
          ? { type:"image_url", image_url:{ url:`data:${poFile.type};base64,${base64}` } }
          : { type:"text", text:`[PDF file: ${poFile.name}, base64 encoded for extraction]` };
        messages = [{ role:"user", content:[
          contentBlock,
          { type:"text", text:`You are reading a PURCHASE ORDER document sent TO Seri Rasa / Mazza Spice. Extract ALL information carefully.

CRITICAL RULES:
- "customerName" = the company who WROTE and SENT this PO (the BUYER placing the order). This is NOT "Mazza Spice", "Seri Rasa", or any variation — those are the SUPPLIER receiving the order. Look for the company letterhead, "From:", or the company name at the TOP of the document.
- Example: If the PO says "AN NUUR FOOD INDUSTRIES SDN BHD" at the top and "To: MAZZA SPICE" below, then customerName = "AN NUUR FOOD INDUSTRIES SDN BHD"
- "poNumber" = the PO number, reference number, or "No:" field on the document
- "items" = ALL line items in the order table — extract every single row, do not skip any
- "qty" = the FULL numeric quantity exactly as written (e.g. 850, 500, 60) — never truncate or round
- "unitprice" = price per unit exactly as shown
- "amount" = qty × unitprice
- For stock code matching: use fuzzy/semantic matching for Malay spice names (e.g. "Jintan Manis"="Fennel Seeds", "Jintan Putih"="Cumin", "Biji Ketumbar"="Coriander Seeds", "Serbuk Cili"="Chilli Powder")

CUSTOMER LIST (code|name):
${custContext}

STOCK ITEMS (code|description):
${itemContext}

Return ONLY valid JSON, no other text:
{
  "customerCode": "matching customer code from list, or null",
  "customerName": "company name of who ISSUED this PO (the buyer)",
  "poNumber": "PO number/reference from the document",
  "deliveryDate": "YYYY-MM-DD or null",
  "notes": "any special instructions, or null",
  "items": [
    {
      "description": "item name as written in PO",
      "itemcode": "best matching stock code from our list, or null",
      "itemdescription": "matched stock item description",
      "qty": 850,
      "unitprice": 5.50,
      "amount": 4675.00
    }
  ]
}` }
        ]}];
      } else {
        messages = [{ role:"user", content:`You are reading a PURCHASE ORDER sent TO Seri Rasa / Mazza Spice. Extract ALL information carefully.

CRITICAL RULES:
- "customerName" = the company who WROTE and SENT this PO (the BUYER). NOT "Mazza Spice" or "Seri Rasa" — those are the supplier. Look for the company letterhead or name at the top.
- "poNumber" = the PO number or reference on the document
- "items" = ALL line items — do not skip any row
- "qty" = full numeric quantity exactly as written, never truncate
- For stock code matching: use fuzzy/semantic matching (e.g. "Jintan Manis"="Fennel Seeds", "Jintan Putih"="Cumin", "Biji Ketumbar"="Coriander Seeds", "Serbuk Cili"="Chilli Powder")

CUSTOMER LIST (code|name):
${custContext}

STOCK ITEMS (code|description):
${itemContext}

Return ONLY valid JSON, no other text:
{
  "customerCode": "matching customer code from list, or null",
  "customerName": "company name of who ISSUED this PO (the buyer)",
  "poNumber": "PO number from document",
  "deliveryDate": "YYYY-MM-DD or null",
  "notes": "special instructions or null",
  "items": [
    {
      "description": "item name as in PO",
      "itemcode": "best matching stock code or null",
      "itemdescription": "matched stock description",
      "qty": 0,
      "unitprice": 0,
      "amount": 0
    }
  ]
}

PO Text:
${poText}` }];
      }

      const res = await fetch("/api/extract-po", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages, ...(poFile&&isPDF ? {pdfBase64:base64, fileName:poFile.name} : {}) })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text||"";
      const json = JSON.parse(text.replace(/```json|```/g,"").trim());
      setExtracted(json);
      setEditedItems(json.items||[]);
      setStage("review");
    } catch(e) {
      setErrorMsg("Failed to process PO: "+e.message);
      setStage("error");
    }
  }

  function updateItem(idx, field, val) {
    const updated = [...editedItems];
    updated[idx] = {...updated[idx], [field]: ["qty","unitprice","amount"].includes(field)?parseFloat(val)||0:val};
    if(field==="qty"||field==="unitprice") updated[idx].amount = (updated[idx].qty||0)*(updated[idx].unitprice||0);
    setEditedItems(updated);
  }
  function removeItem(idx) { setEditedItems(editedItems.filter((_,i)=>i!==idx)); }
  function addItem() { setEditedItems([...editedItems,{description:"",itemcode:"",itemdescription:"",qty:1,unitprice:0,amount:0}]); }

  async function submitSO() {
    if (!extracted.customerCode) {
      setErrorMsg("Please select a customer code before submitting.");
      return;
    }
    setStage("submitting");
    try {
      const today = new Date().toISOString().slice(0,10);
      const soPayload = {
        code: extracted.customerCode,
        docdate: today,
        description: "Sales Order via PO Intake",
        docref1: extracted.poNumber||"",
        docref2: extracted.deliveryDate ? "DELIVERY DATE: "+extracted.deliveryDate.split("-").reverse().join("/") : "",
        note: extracted.notes||"",
        sdsdocdetail: editedItems.filter(i=>i.itemcode).map((item,idx)=>({
          itemcode: item.itemcode,
          description: item.itemdescription||item.description,
          qty: item.qty,
          unitprice: item.unitprice,
          amount: item.amount,
          deliverydate: extracted.deliveryDate||today,
        }))
      };

      // POST to SQL Account via our server-side proxy
      const res = await fetch("/api/create-doc?type=so", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ soPayload, poMeta: {
          customerName: extracted.customerName,
          poNumber: extracted.poNumber,
          totalAmount: editedItems.reduce((a,i)=>a+(i.amount||0),0),
          submittedBy: currentUser?.name,
          submittedAt: new Date().toISOString(),
          items: editedItems,
        }})
      });
      const result = await res.json();
      if (result.duplicate) {
        setDuplicateInfo(result.existing);
        setErrorMsg(result.error);
        setStage("duplicate");
        return;
      }
      if (result.error) throw new Error(result.error);
      setSoResult(result);
      setStage("done");
      // Refresh history
      fetch("/api/prospects?type=po_intake_list").then(r=>r.json()).then(d=>setHistory(d.list||[]));
    } catch(e) {
      setErrorMsg("Failed to create SO in SQL: "+e.message);
      setStage("error");
    }
  }

  async function createInvAndDO(mode) {
    // mode: undefined = both, 'invoice' = invoice only, 'do' = DO only
    setCreatingInvDo(true);
    setInvDoError('');
    setInvDoDuplicateInfo(null);
    const items = (soResult?.items || editedItems).filter(i => i.itemcode);
    const customerCode = extracted?.customerCode;
    const delivDate = deliveryDateOverride || extracted?.deliveryDate || new Date().toISOString().slice(0,10);
    const payload = { soDocno: soResult.docno, customerCode, deliveryDate: delivDate, items, note: invDoNote };

    try {
      if (!mode || mode === 'invoice') {
        const r = await fetch('/api/create-doc?type=invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const d = await r.json();
        if (d.duplicate && !d.alreadyExisted) {
          setInvDoDuplicateInfo({ type:'invoice', ...d.details });
          setCreatingInvDo(false);
          return;
        }
        if (d.error && !d.alreadyExisted) throw new Error('Invoice: ' + d.error);
        setIvResult({ ...d, alreadyExisted: d.alreadyExisted });
      }
      if (!mode || mode === 'do') {
        const r = await fetch('/api/create-doc?type=do', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const d = await r.json();
        if (d.duplicate && !d.alreadyExisted) {
          setInvDoDuplicateInfo({ type:'do', ...d.details });
          setCreatingInvDo(false);
          return;
        }
        if (d.error && !d.alreadyExisted) throw new Error('DO: ' + d.error);
        setDoResult({ ...d, alreadyExisted: d.alreadyExisted });
      }
    } catch(e) {
      setInvDoError(e.message);
    } finally {
      setCreatingInvDo(false);
    }
  }

  function reset() { setStage("upload"); setPoText(""); setPoFile(null); setExtracted(null); setEditedItems([]); setSoResult(null); setErrorMsg(""); setDuplicateInfo(null); setIvResult(null); setDoResult(null); setDeliveryDateOverride(''); setInvDoNote(''); setInvDoError(''); setCreatingInvDo(false); setInvDoDuplicateInfo(null); }

  const totalAmt = editedItems.reduce((a,i)=>a+(i.amount||0),0);
  const unmatchedItems = editedItems.filter(i=>!i.itemcode);

  return (
    <div style={{padding:"24px 28px",maxWidth:960,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:4}}>PO Intake</div>
          <div style={{fontSize:13,color:"#94A3B8"}}>Upload a customer PO — AI reads it, matches stock codes, and creates the SO directly in SQL Account</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:11,color:"#94A3B8"}}>{customers.length} customers · {stockItems.length} items</div>
            {masterUpdated && (
              <div style={{fontSize:11,color:"#94A3B8"}}>
                Updated: {new Date(masterUpdated).toLocaleString("en-MY",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
              </div>
            )}
            <button onClick={refreshMaster} disabled={syncing}
              style={{padding:"4px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#1E3A5F",fontSize:11,fontWeight:700,cursor:syncing?"not-allowed":"pointer",opacity:syncing?0.6:1}}>
              {syncing?"⏳ Syncing...":"🔄 Refresh"}
            </button>
          </div>
          <button onClick={()=>setShowHistory(!showHistory)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#64748B",fontSize:12,cursor:"pointer",fontWeight:600}}>
            {showHistory?"Hide":"📋 History"} ({history.length})
          </button>
        </div>
      </div>

      {/* HISTORY PANEL */}
      {showHistory && (
        <div style={{background:"#fff",borderRadius:16,border:"1px solid #EEF2F7",marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid #F1F5F9",fontSize:13,fontWeight:800,color:"#0F172A"}}>Recent PO Submissions</div>
          {history.length===0 ? <div style={{padding:"20px",textAlign:"center",color:"#94A3B8",fontSize:12}}>No submissions yet</div> : (
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F8FAFC"}}>{["SO #","Customer","PO Ref","Items","Amount","By","Date"].map(h=><th key={h} style={{padding:"8px 14px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>
                {history.slice(0,10).map((h,i)=>(
                  <tr key={i} style={{borderTop:"1px solid #F1F5F9"}}>
                    <td style={{padding:"9px 14px",fontWeight:700,color:"#1E3A5F"}}>{h.docno||"—"}</td>
                    <td style={{padding:"9px 14px",color:"#374151"}}>{h.customerName}</td>
                    <td style={{padding:"9px 14px",color:"#64748B"}}>{h.poNumber||"—"}</td>
                    <td style={{padding:"9px 14px",color:"#64748B"}}>{(h.items||[]).length}</td>
                    <td style={{padding:"9px 14px",fontWeight:700}}>RM {(h.totalAmount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                    <td style={{padding:"9px 14px",color:"#64748B"}}>{h.submittedBy}</td>
                    <td style={{padding:"9px 14px",color:"#94A3B8"}}>{h.submittedAt?new Date(h.submittedAt).toLocaleDateString("en-MY"):""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* UPLOAD */}
      {stage==="upload" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>fileRef.current.click()}
            style={{background:dragOver?"#EFF6FF":poFile?"#F0FDF4":"#F8FAFC",border:`2px dashed ${dragOver?"#3B82F6":poFile?"#10B981":"#E2E8F0"}`,borderRadius:16,padding:"32px 24px",textAlign:"center",cursor:"pointer",transition:"all 0.2s"}}>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.docx,.doc" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
            <div style={{fontSize:32,marginBottom:12}}>{poFile?"✅":"📄"}</div>
            <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:6}}>{poFile?poFile.name:"Drop PO file here"}</div>
            <div style={{fontSize:12,color:"#94A3B8"}}>PDF, Image, Excel, Word</div>
            {poFile&&<div style={{marginTop:8,fontSize:11,color:"#10B981",fontWeight:600}}>Click to change file</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.08em"}}>Or paste WhatsApp / email text</div>
            <textarea value={poText} onChange={e=>setPoText(e.target.value)}
              placeholder={"From: Kenny Hills Bakers\nPO Ref: PO-KHB-031\nItem: Curry Powder 1kg x 10\nItem: Chilli Paste 500g x 20\nDelivery: 25/03/2026"}
              style={{...inp,height:150,resize:"vertical",lineHeight:1.6,fontSize:12}} />
          </div>
          <div style={{gridColumn:"1/-1",display:"flex",gap:12,alignItems:"center"}}>
            <button onClick={processPO} disabled={!poFile&&!poText.trim()}
              style={{padding:"11px 24px",borderRadius:10,border:"none",background:(!poFile&&!poText.trim())?"#CBD5E1":"#1E3A5F",color:"#fff",fontSize:13,fontWeight:700,cursor:(!poFile&&!poText.trim())?"not-allowed":"pointer"}}>
              ✨ Extract & Match with AI
            </button>
            {(poFile||poText)&&<button onClick={reset} style={{padding:"11px 16px",borderRadius:10,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#64748B",fontSize:13,cursor:"pointer"}}>Clear</button>}
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {stage==="processing" && (
        <div style={{textAlign:"center",padding:"60px 0",background:"#fff",borderRadius:16,border:"1px solid #EEF2F7"}}>
          <div style={{fontSize:40,marginBottom:16,animation:"bounce 1s infinite"}}>🤖</div>
          <div style={{fontSize:16,fontWeight:700,color:"#0F172A",marginBottom:8}}>Reading & matching PO...</div>
          <div style={{fontSize:13,color:"#94A3B8",marginBottom:4}}>Extracting items and matching to {stockItems.length} stock codes</div>
          <div style={{fontSize:11,color:"#CBD5E1"}}>This takes 5-10 seconds</div>
        </div>
      )}

      {/* REVIEW */}
      {stage==="review" && extracted && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Header */}
          <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",border:"1px solid #EEF2F7"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0F172A",marginBottom:14}}>Review & Confirm</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              <div>
                <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Customer Name</div>
                <input value={extracted.customerName||""} onChange={e=>setExtracted({...extracted,customerName:e.target.value})} style={inp} />
              </div>
              <div>
                <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Customer Code *</div>
                <SearchableSelect
                  value={extracted.customerCode||""}
                  onChange={v=>setExtracted({...extracted,customerCode:v})}
                  options={customers}
                  placeholder="Search customer code or name..."
                  labelFn={c=>`${c.code} · ${c.name}`}
                  highlight={!extracted.customerCode}
                  style={{fontSize:11}}
                />
              </div>
              <div>
                <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>PO Reference</div>
                <input value={extracted.poNumber||""} onChange={e=>setExtracted({...extracted,poNumber:e.target.value})} style={inp} placeholder="PO-XXXXX" />
              </div>
              <div>
                <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Delivery Date</div>
                <input type="date" value={extracted.deliveryDate||""} onChange={e=>setExtracted({...extracted,deliveryDate:e.target.value})} style={inp} />
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Notes</div>
                <input value={extracted.notes||""} onChange={e=>setExtracted({...extracted,notes:e.target.value})} style={inp} placeholder="Special instructions..." />
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #EEF2F7",overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>Line Items</div>
                {unmatchedItems.length>0&&<div style={{fontSize:11,color:"#F59E0B",marginTop:2}}>⚠️ {unmatchedItems.length} item(s) need stock code — select from dropdown</div>}
              </div>
              <button onClick={addItem} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#1E3A5F",fontSize:12,cursor:"pointer",fontWeight:700}}>+ Add Row</button>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#F8FAFC"}}>
                    {["PO Description","Stock Code","Qty","Unit Price (RM)","Total (RM)",""].map(h=>(
                      <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editedItems.map((item,i)=>(
                    <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:!item.itemcode?"#FFFBEB":"#fff"}}>
                      <td style={{padding:"7px 10px",width:"28%"}}>
                        <input value={item.description||""} onChange={e=>updateItem(i,"description",e.target.value)} style={{...inp,padding:"6px 9px",fontSize:11}} />
                      </td>
                      <td style={{padding:"7px 10px",width:"28%"}}>
                        <SearchableSelect
                          value={item.itemcode||""}
                          onChange={v=>{
                            const found = stockItems.find(s=>s.code===v);
                            const updated=[...editedItems];
                            updated[i]={...updated[i],itemcode:v,itemdescription:found?found.description:updated[i].description,unitprice:found&&found.unitprice?found.unitprice:updated[i].unitprice};
                            updated[i].amount=(updated[i].qty||0)*(updated[i].unitprice||0);
                            setEditedItems(updated);
                          }}
                          options={stockItems}
                          valueKey="code"
                          labelFn={s=>`${s.code} · ${s.description}`}
                          placeholder="Search stock code..."
                          highlight={!item.itemcode}
                          style={{fontSize:11}}
                        />
                      </td>
                      <td style={{padding:"7px 10px",width:"8%"}}>
                        <input type="number" value={item.qty||0} onChange={e=>updateItem(i,"qty",e.target.value)} style={{...inp,padding:"6px 9px",fontSize:11,textAlign:"center"}} />
                      </td>
                      <td style={{padding:"7px 10px",width:"12%"}}>
                        <input type="number" value={item.unitprice||0} onChange={e=>updateItem(i,"unitprice",e.target.value)} style={{...inp,padding:"6px 9px",fontSize:11}} />
                      </td>
                      <td style={{padding:"7px 10px",width:"12%",fontWeight:700,color:"#0F172A",whiteSpace:"nowrap"}}>
                        RM {((item.qty||0)*(item.unitprice||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                      <td style={{padding:"7px 10px"}}>
                        <button onClick={()=>removeItem(i)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{padding:"12px 18px",borderTop:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:"#94A3B8"}}>{editedItems.filter(i=>i.itemcode).length} of {editedItems.length} items matched to stock codes</div>
              <div style={{fontSize:14,color:"#64748B"}}>Total: <span style={{fontWeight:800,color:"#0F172A",fontSize:16}}>RM {totalAmt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
            </div>
          </div>

          {unmatchedItems.length>0&&(
            <div style={{padding:"11px 16px",background:"#FFFBEB",borderRadius:10,border:"1px solid #FCD34D",fontSize:12,color:"#92400E"}}>
              ⚠️ {unmatchedItems.length} item(s) have no stock code selected. These will be skipped when creating the SO in SQL. Please select the correct stock code above.
            </div>
          )}

          <div style={{display:"flex",gap:12}}>
            <button onClick={submitSO} style={{padding:"11px 24px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              ✅ Create SO in SQL Account
            </button>
            <button onClick={reset} style={{padding:"11px 16px",borderRadius:10,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#64748B",fontSize:13,cursor:"pointer"}}>← Start Over</button>
          </div>
        </div>
      )}

      {/* SUBMITTING */}
      {stage==="submitting" && (
        <div style={{textAlign:"center",padding:"60px 0",background:"#fff",borderRadius:16,border:"1px solid #EEF2F7"}}>
          <div style={{fontSize:40,marginBottom:16}}>⏳</div>
          <div style={{fontSize:16,fontWeight:700,color:"#0F172A",marginBottom:8}}>Creating SO in SQL Account...</div>
          <div style={{fontSize:13,color:"#94A3B8"}}>Please wait</div>
        </div>
      )}

      {/* DONE — SO created, now offer Invoice + DO */}
      {stage==="done" && soResult && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* SO success banner */}
          <div style={{background:"#F0FDF4",borderRadius:16,padding:"24px 28px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:16}}>
            <div style={{fontSize:36}}>✅</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>SO Created in SQL Account</div>
              <div style={{fontSize:22,fontWeight:800,color:"#1E3A5F",margin:"4px 0"}}>{soResult.docno}</div>
              <div style={{fontSize:13,color:"#64748B"}}>{soResult.customerName} · {soResult.itemCount} items · RM {soResult.totalAmount?.toLocaleString(undefined,{minimumFractionDigits:2})} · PO Ref: {soResult.poNumber||"—"}</div>
            </div>
            {ivResult && <div style={{textAlign:"center",background:"#EFF6FF",borderRadius:12,padding:"12px 16px",minWidth:120}}>
              <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>Invoice</div>
              <div style={{fontSize:16,fontWeight:800,color:"#1d4ed8"}}>{ivResult.docno}</div>
            </div>}
            {doResult && <div style={{textAlign:"center",background:"#FFF7ED",borderRadius:12,padding:"12px 16px",minWidth:120}}>
              <div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>Delivery Order</div>
              <div style={{fontSize:16,fontWeight:800,color:"#d97706"}}>{doResult.docno}</div>
            </div>}
          </div>

          {/* Invoice + DO creation form */}
          {!ivResult && !doResult && (
            <div style={{background:"#fff",borderRadius:16,padding:"24px 28px",border:"1px solid #EEF2F7"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>Create Invoice & Delivery Order</div>
              <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Both will be linked to {soResult.docno} · Delivery date is adjustable</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                <div>
                  <div style={{fontSize:11,color:"#64748B",fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Delivery Date</div>
                  <input type="date" value={deliveryDateOverride}
                    onChange={e=>setDeliveryDateOverride(e.target.value)}
                    style={{padding:"9px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,outline:"none",width:"100%",fontFamily:"'Plus Jakarta Sans',sans-serif"}} />
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>Defaults to delivery date from PO. Adjust if needed.</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#64748B",fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Note (optional)</div>
                  <input value={invDoNote} onChange={e=>setInvDoNote(e.target.value)}
                    placeholder="e.g. Urgent delivery, handle with care..."
                    style={{padding:"9px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,outline:"none",width:"100%",fontFamily:"'Plus Jakarta Sans',sans-serif"}} />
                </div>
              </div>
              {invDoError && <div style={{padding:"10px 14px",background:"#FEF2F2",borderRadius:8,border:"1px solid #FECACA",fontSize:12,color:"#DC2626",marginBottom:12}}>{invDoError}</div>}
              {invDoDuplicateInfo && (
                <div style={{padding:"14px 16px",background:"#FFFBEB",borderRadius:10,border:"2px solid #FCD34D",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#92400E",marginBottom:8}}>
                    ⚠️ {invDoDuplicateInfo.type === 'invoice' ? 'Invoice' : 'Delivery Order'} Already Exists
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12}}>
                    <div><span style={{color:"#94A3B8"}}>SO Number:</span> <strong>{invDoDuplicateInfo.soNo}</strong></div>
                    <div><span style={{color:"#94A3B8"}}>{invDoDuplicateInfo.type==='invoice'?'Invoice No:':'DO No:'}</span> <strong style={{color:invDoDuplicateInfo.type==='invoice'?"#1d4ed8":"#7c3aed"}}>{invDoDuplicateInfo.type==='invoice'?invDoDuplicateInfo.invoiceNo:invDoDuplicateInfo.doNo}</strong></div>
                    <div><span style={{color:"#94A3B8"}}>Customer:</span> {invDoDuplicateInfo.customer}</div>
                    <div><span style={{color:"#94A3B8"}}>Created by:</span> {invDoDuplicateInfo.createdBy}</div>
                    <div><span style={{color:"#94A3B8"}}>Created at:</span> {invDoDuplicateInfo.createdAt ? new Date(invDoDuplicateInfo.createdAt).toLocaleString('en-MY') : '—'}</div>
                    {invDoDuplicateInfo.deliveryDate && <div><span style={{color:"#94A3B8"}}>Delivery Date:</span> {invDoDuplicateInfo.deliveryDate}</div>}
                    {invDoDuplicateInfo.amount && <div><span style={{color:"#94A3B8"}}>Amount:</span> RM {Number(invDoDuplicateInfo.amount).toLocaleString()}</div>}
                  </div>
                  <button onClick={()=>setInvDoDuplicateInfo(null)} style={{marginTop:10,fontSize:11,color:"#92400E",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Dismiss</button>
                </div>
              )}
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <button onClick={createInvAndDO} disabled={creatingInvDo}
                  style={{padding:"11px 24px",borderRadius:10,border:"none",background:creatingInvDo?"#CBD5E1":"#1E3A5F",color:"#fff",fontSize:13,fontWeight:700,cursor:creatingInvDo?"not-allowed":"pointer"}}>
                  {creatingInvDo?"Creating...":"✨ Create Invoice & DO"}
                </button>
                <button onClick={createInvAndDO.bind(null,'invoice')} disabled={creatingInvDo}
                  style={{padding:"11px 20px",borderRadius:10,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#1E3A5F",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Invoice only
                </button>
                <button onClick={createInvAndDO.bind(null,'do')} disabled={creatingInvDo}
                  style={{padding:"11px 20px",borderRadius:10,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#d97706",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  DO only
                </button>
                <button onClick={reset} style={{padding:"11px 20px",borderRadius:10,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#64748B",fontSize:13,cursor:"pointer"}}>
                  Skip — Process Another PO
                </button>
              </div>
            </div>
          )}

          {/* Both created */}
          {(ivResult || doResult) && (
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {!ivResult && <button onClick={createInvAndDO.bind(null,'invoice')} disabled={creatingInvDo}
                style={{padding:"11px 20px",borderRadius:10,border:"1px solid #BFDBFE",background:"#EFF6FF",color:"#1d4ed8",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                + Create Invoice
              </button>}
              {!doResult && <button onClick={createInvAndDO.bind(null,'do')} disabled={creatingInvDo}
                style={{padding:"11px 20px",borderRadius:10,border:"1px solid #FED7AA",background:"#FFF7ED",color:"#d97706",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                + Create DO
              </button>}
              <button onClick={reset} style={{padding:"11px 24px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                Process Another PO
              </button>
            </div>
          )}
        </div>
      )}

      {/* DUPLICATE */}
      {stage==="duplicate" && (
        <div style={{background:"#FFFBEB",borderRadius:16,padding:"32px",textAlign:"center",border:"2px solid #FCD34D"}}>
          <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
          <div style={{fontSize:18,fontWeight:800,color:"#92400E",marginBottom:8}}>Duplicate PO Detected!</div>
          <div style={{fontSize:13,color:"#92400E",marginBottom:20,lineHeight:1.6}}>{errorMsg}</div>
          {duplicateInfo && (
            <div style={{background:"#FEF3C7",borderRadius:10,padding:"14px 18px",marginBottom:20,textAlign:"left",display:"inline-block",minWidth:300}}>
              <div style={{fontSize:11,color:"#92400E",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Existing SO Details</div>
              <div style={{fontSize:13,color:"#78350F"}}>SO Number: <strong>{duplicateInfo.docno||"—"}</strong></div>
              <div style={{fontSize:13,color:"#78350F"}}>Submitted by: <strong>{duplicateInfo.submittedBy}</strong></div>
              <div style={{fontSize:13,color:"#78350F"}}>Submitted at: <strong>{new Date(duplicateInfo.submittedAt).toLocaleString("en-MY")}</strong></div>
            </div>
          )}
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <button onClick={reset} style={{padding:"11px 24px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Start Over</button>
            <button onClick={()=>setStage("review")} style={{padding:"11px 24px",borderRadius:10,border:"1px solid #FCD34D",background:"#fff",color:"#92400E",fontSize:13,fontWeight:700,cursor:"pointer"}}>Back to Review</button>
          </div>
        </div>
      )}

      {/* ERROR */}
      {stage==="error" && (
        <div style={{background:"#FEF2F2",borderRadius:16,padding:"32px",textAlign:"center",border:"1px solid #FECACA"}}>
          <div style={{fontSize:40,marginBottom:16}}>❌</div>
          <div style={{fontSize:16,fontWeight:700,color:"#0F172A",marginBottom:8}}>Something went wrong</div>
          <div style={{fontSize:13,color:"#EF4444",marginBottom:20}}>{errorMsg}</div>
          <button onClick={reset} style={{padding:"11px 24px",borderRadius:10,border:"none",background:"#1E3A5F",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Try Again</button>
        </div>
      )}
    </div>
  );
}


// ─── PRODUCT P&L SECTION ───────────────────────────────────────────────────
function ProductPLSection({ invoices }) {
  const [data, setData]       = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch]   = React.useState("");
  const [expanded, setExpanded] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/operations?type=production")
      .then(r=>r.json())
      .then(d=>{ setData(d); setLoading(false); })
      .catch(()=>setLoading(false));
  }, []);

  const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  if (loading) return <div style={{padding:"24px 0", color:"#94A3B8", fontSize:13}}>Loading product P&L...</div>;
  if (!data?.products?.length) return null;

  const products = data.products
    .filter(p => !p.bomMissing && p.revenue > 0)
    .filter(p => !search || p.description.toLowerCase().includes(search.toLowerCase()) || p.itemCode.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.revenue - a.revenue);

  const totals = products.reduce((acc,p) => ({
    revenue: acc.revenue + p.revenue,
    cost:    acc.cost    + (p.totalRawCost||0),
    profit:  acc.profit  + (p.grossProfit||0),
  }), {revenue:0, cost:0, profit:0});

  return (
    <div style={{marginTop:28}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:16, fontWeight:800, color:"#0F172A"}}>📦 Revenue by Product</div>
          <div style={{fontSize:12, color:"#94A3B8"}}>From active SOs · BOM cost explosion</div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product..."
          style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:200}} />
      </div>

      {/* Summary row */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14}}>
        {[
          {label:"Total Revenue",   value:fmtRM(totals.revenue), color:"#1d4ed8"},
          {label:"Total Raw Cost",  value:fmtRM(totals.cost),    color:"#dc2626"},
          {label:"Gross Profit",    value:fmtRM(totals.profit),  color:"#16a34a"},
        ].map(c=>(
          <div key={c.label} style={{background:"#F8FAFC", borderRadius:12, padding:"12px 16px", border:`1px solid ${c.color}22`}}>
            <div style={{fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:16, fontWeight:800, color:c.color}}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                {["#","Product","Qty","Revenue","Raw Cost","Gross Profit","Margin",""].map(h=>(
                  <th key={h} style={{padding:"9px 12px", textAlign:["Revenue","Raw Cost","Gross Profit","Margin"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p,i)=>{
                const isExp = expanded===p.itemCode;
                return (
                  <React.Fragment key={p.itemCode}>
                    <tr onClick={()=>setExpanded(isExp?null:p.itemCode)}
                      style={{borderTop:"1px solid #F1F5F9", background:isExp?"#F0F9FF":i%2===0?"#FAFAFA":"#fff", cursor:"pointer"}}>
                      <td style={{padding:"10px 12px", color:"#94A3B8", fontWeight:700}}>{i+1}</td>
                      <td style={{padding:"10px 12px"}}>
                        <div style={{fontWeight:700}}>{p.description}</div>
                        <code style={{fontSize:10, color:"#94A3B8", background:"#F1F5F9", padding:"1px 4px", borderRadius:3}}>{p.itemCode}</code>
                      </td>
                      <td style={{padding:"10px 12px", fontWeight:600}}>{(p.totalQty||0).toLocaleString()}</td>
                      <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#1d4ed8"}}>{fmtRM(p.revenue)}</td>
                      <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#dc2626"}}>{fmtRM(p.totalRawCost)}</td>
                      <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:p.grossProfit>0?"#16a34a":"#dc2626"}}>{fmtRM(p.grossProfit)}</td>
                      <td style={{padding:"10px 12px", textAlign:"right"}}>
                        <span style={{fontWeight:800, color:p.margin>30?"#16a34a":p.margin>15?"#d97706":"#dc2626"}}>{p.margin?.toFixed(1)}%</span>
                      </td>
                      <td style={{padding:"10px 12px", color:"#94A3B8", fontSize:11}}>{isExp?"▲":"▼"}</td>
                    </tr>
                    {isExp && (
                      <tr><td colSpan={8} style={{padding:"8px 40px 12px", background:"#F8FAFC", fontSize:11}}>
                        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:8}}>
                          {(p.rawMaterials||[]).sort((a,b)=>b.totalCost-a.totalCost).map(r=>(
                            <div key={r.code} style={{background:"#fff", border:"1px solid #E2E8F0", borderRadius:8, padding:"8px 10px"}}>
                              <div style={{fontWeight:700, color:"#374151"}}>{r.code}</div>
                              <div style={{color:"#64748B"}}>{r.totalQty?.toFixed(3)} {r.uom} × RM {r.refCostPerUnit?.toFixed(3)}</div>
                              <div style={{fontWeight:700, color:"#dc2626"}}>= {fmtRM(r.totalCost)}</div>
                            </div>
                          ))}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{background:"#F0FDF4", borderTop:"2px solid #BBF7D0"}}>
                <td colSpan={3} style={{padding:"10px 12px", fontWeight:800}}>TOTAL</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#1d4ed8"}}>{fmtRM(totals.revenue)}</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#dc2626"}}>{fmtRM(totals.cost)}</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#16a34a"}}>{fmtRM(totals.profit)}</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#16a34a"}}>{totals.revenue>0?(totals.profit/totals.revenue*100).toFixed(1):0}%</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── CUSTOMER P&L SECTION ──────────────────────────────────────────────────
function CustomerPLSection({ invoices, rvData }) {
  const [search, setSearch] = React.useState("");
  const fmtRM = n => `RM ${Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  // Build per-customer P&L from invoice data
  const custMap = {};
  (invoices||[]).forEach(iv => {
    const c = iv.customer || "Unknown";
    if (!custMap[c]) custMap[c] = { customer:c, invoiced:0, collected:0, outstanding:0, count:0 };
    custMap[c].invoiced     += iv.amount || 0;
    custMap[c].outstanding  += iv.outstanding || 0;
    custMap[c].collected    += (iv.amount||0) - (iv.outstanding||0);
    custMap[c].count        += 1;
  });

  // Add RV (receipts) data
  (rvData||[]).forEach(rv => {
    const c = rv.customer || "Unknown";
    if (!custMap[c]) custMap[c] = { customer:c, invoiced:0, collected:0, outstanding:0, count:0 };
  });

  const customers = Object.values(custMap)
    .filter(c => c.invoiced > 0)
    .filter(c => !search || c.customer.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.invoiced - a.invoiced);

  const totals = customers.reduce((acc,c) => ({
    invoiced:    acc.invoiced    + c.invoiced,
    collected:   acc.collected   + c.collected,
    outstanding: acc.outstanding + c.outstanding,
  }), {invoiced:0, collected:0, outstanding:0});

  return (
    <div style={{marginTop:28, marginBottom:24}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:16, fontWeight:800, color:"#0F172A"}}>👤 Revenue by Customer</div>
          <div style={{fontSize:12, color:"#94A3B8"}}>From invoice history · {customers.length} customers</div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer..."
          style={{padding:"6px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:12, outline:"none", width:200}} />
      </div>

      <div style={{background:"#fff", borderRadius:16, border:"1px solid #EEF2F7", overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                {["#","Customer","Invoices","Total Invoiced","Collected","Outstanding","Collection Rate"].map(h=>(
                  <th key={h} style={{padding:"9px 12px", textAlign:["Total Invoiced","Collected","Outstanding","Collection Rate"].includes(h)?"right":"left", fontSize:10, color:"#94A3B8", fontWeight:700, textTransform:"uppercase", whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c,i)=>{
                const collRate = c.invoiced > 0 ? (c.collected/c.invoiced*100) : 0;
                return (
                  <tr key={c.customer} style={{borderTop:"1px solid #F1F5F9", background:c.outstanding>0?"#FFFBEB":i%2===0?"#FAFAFA":"#fff"}}>
                    <td style={{padding:"10px 12px", color:"#94A3B8", fontWeight:700}}>{i+1}</td>
                    <td style={{padding:"10px 12px", fontWeight:700, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{c.customer}</td>
                    <td style={{padding:"10px 12px", color:"#64748B"}}>{c.count}</td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#1d4ed8"}}>{fmtRM(c.invoiced)}</td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#16a34a"}}>{fmtRM(c.collected)}</td>
                    <td style={{padding:"10px 12px", textAlign:"right", fontWeight:700, color:c.outstanding>0?"#dc2626":"#16a34a"}}>{fmtRM(c.outstanding)}</td>
                    <td style={{padding:"10px 12px", textAlign:"right"}}>
                      <div style={{display:"flex", alignItems:"center", justifyContent:"flex-end", gap:6}}>
                        <div style={{width:50, height:6, background:"#F1F5F9", borderRadius:99, overflow:"hidden"}}>
                          <div style={{height:"100%", background:collRate>=90?"#16a34a":collRate>=60?"#d97706":"#dc2626", width:`${collRate}%`, borderRadius:99}}/>
                        </div>
                        <span style={{fontSize:11, fontWeight:700, color:collRate>=90?"#16a34a":collRate>=60?"#d97706":"#dc2626"}}>{collRate.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{background:"#EFF6FF", borderTop:"2px solid #BFDBFE"}}>
                <td colSpan={3} style={{padding:"10px 12px", fontWeight:800}}>TOTAL</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#1d4ed8"}}>{fmtRM(totals.invoiced)}</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#16a34a"}}>{fmtRM(totals.collected)}</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:totals.outstanding>0?"#dc2626":"#16a34a"}}>{fmtRM(totals.outstanding)}</td>
                <td style={{padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#64748B"}}>
                  {totals.invoiced>0?(totals.collected/totals.invoiced*100).toFixed(0):0}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}


function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [tab, setTab] = useState("dashboard");
  const [portal, setPortal] = useState(null); // null | "sales" | "ops"
  const [opsView, setOpsView] = useState("home"); // home | schedule | gap | purchase | floor | capacity
  const [activityTab, setActivityTab] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [prospects, setProspects] = useState(INITIAL_PROSPECTS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCat, setFilterCat] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [contactName, setContactName] = useState("");
  const [selCompany, setSelCompany] = useState(null);
  const [cSearch, setCSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [channel, setChannel] = useState("whatsapp");
  const [seq, setSeq] = useState("");
  const [agentName, setAgentName] = useState("Rina");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ company:"", industry:"", category:"Cold Prospects", agent:"", phone:"", contact:"", status:"To Contact", notes:"" });
  const [showDeal, setShowDeal] = useState(false);
  const [dealForm, setDealForm] = useState({ company:"", value:"", agent:currentUser?.name||"", notes:"" });
  const [deals, setDeals] = useState([]);
  const [soData, setSoData] = useState([]);
  const [ivData, setIvData] = useState([]);
  const [rvData, setRvData] = useState([]);
  const [poData, setPoData] = useState([]);
  const [catMapLive, setCatMapLive] = useState(null);
  const [soLastSync, setSoLastSync] = useState(null);
  const [drawer, setDrawer] = useState(null); // {type, title, data, columns}
  const [soSearch, setSoSearch] = useState("");
  const [soFilter, setSoFilter] = useState("All");
  const dropRef = useRef(null);
  const [leadsView, setLeadsView] = useState("pipeline"); // pipeline | copilot
  const [poSubTab, setPoSubTab] = useState("intake"); // intake | tracker

  // Log an activity entry
  async function logActivity(action, detail) {
    const entry = {
      id: Date.now(),
      user: currentUser?.name || "Unknown",
      userId: currentUser?.id || "unknown",
      action,
      detail,
      timestamp: new Date().toISOString(),
    };
    setActivityLog(prev => [entry, ...prev].slice(0, 200));
    try {
      await fetch("/api/activity", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ entry })
      });
    } catch(e) { console.error("Log error:", e); }
  }

  // Load from shared KV on mount
  async function loadProspects() {
    try {
      const res = await fetch("/api/prospects");
      const data = await res.json();
      if (data.prospects && Array.isArray(data.prospects)) {
        setProspects(data.prospects);
      } else {
        await saveProspects(INITIAL_PROSPECTS);
      }
      setLastSync(new Date());
    } catch(e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadActivity() {
    try {
      const res = await fetch("/api/activity");
      const data = await res.json();
      if (data.logs) setActivityLog(data.logs);
    } catch(e) { console.error("Activity load error:", e); }
  }

  async function loadDeals() {
    try {
      const res = await fetch("/api/prospects?type=deals");
      const data = await res.json();
      if (data.deals) setDeals(data.deals);
    } catch(e) { console.error("Deals load error:", e); }
  }

  async function loadSoData() {
    try {
      const res = await fetch("/api/prospects?type=so");
      const data = await res.json();
      if (data.so && data.so.length > 0) {
        setSoData(data.so);
        setIvData(data.invoice || []);
        setRvData(data.rv || []);
        setPoData(data.po || []);
        if (data.catmap) setCatMapLive(data.catmap);
        if (data.updated) setSoLastSync(new Date(data.updated));
      } else {
        // Sample data until live feed is connected
        setSoData([
          { id:"SO-001", customer:"Gardenia Bakeries", amount:12500, date:"2026-03-01", status:"Invoiced", delivery:"Delivered", agent:"Jasmine" },
          { id:"SO-002", customer:"Sushi King", amount:8200, date:"2026-03-05", status:"Pending", delivery:"In Transit", agent:"Varinder" },
          { id:"SO-003", customer:"Family Mart", amount:15800, date:"2026-03-08", status:"Invoiced", delivery:"Delivered", agent:"Jasmine" },
          { id:"SO-004", customer:"QL Central Kitchen", amount:22000, date:"2026-03-10", status:"Overdue", delivery:"Delivered", agent:"Narin" },
          { id:"SO-005", customer:"Oriental Food Industry", amount:9400, date:"2026-03-12", status:"Paid", delivery:"Delivered", agent:"Varinder" },
          { id:"SO-006", customer:"Bakels Malaysia", amount:5600, date:"2026-03-14", status:"Pending", delivery:"Pending", agent:"Jasmine" },
        ]);
        setPoData([
          { id:"PO-001", supplier:"Spice World Sdn Bhd", amount:4200, date:"2026-03-02", status:"Received" },
          { id:"PO-002", supplier:"Global Herbs Malaysia", amount:6800, date:"2026-03-06", status:"Pending" },
          { id:"PO-003", supplier:"AgroBase Supply", amount:3100, date:"2026-03-09", status:"Received" },
          { id:"PO-004", supplier:"Rawang Trading Co", amount:5500, date:"2026-03-13", status:"Pending" },
        ]);
      }
    } catch(e) { console.error("SO load error:", e); }
  }

  async function saveDeals(data) {
    try {
      await fetch("/api/prospects", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deals: data })
      });
    } catch(e) { console.error("Deals save error:", e); }
  }

  // Save to shared KV
  async function saveProspects(data) {
    setSyncing(true);
    try {
      await fetch("/api/prospects", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ prospects: data })
      });
      setLastSync(new Date());
    } catch(e) {
      console.error("Save error:", e);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { if (currentUser) { loadProspects(); loadActivity(); loadDeals(); loadSoData(); } else { setLoading(false); } }, [currentUser]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(loadProspects, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const stats = {
    total: prospects.length,
    notContacted: prospects.filter(p => p.status === "To Contact").length,
    needsFollowUp: prospects.filter(p => ["Waiting for Reply","Meeting to Schedule"].includes(p.status)).length,
    hot: prospects.filter(p => p.status === "Hot Lead 🔥").length,
    warm: prospects.filter(p => p.category === "Warm Leads").length,
    winBack: prospects.filter(p => p.status === "Win-Back Needed").length,
  };

  const urgent = prospects.filter(p => ["Waiting for Reply","Meeting to Schedule","Win-Back Needed","Hot Lead 🔥"].includes(p.status));

  const filtered = prospects.filter(p => {
    const s = (p.company + p.contact + p.agent + p.notes).toLowerCase();
    return s.includes(search.toLowerCase()) &&
      (filterStatus === "All" || p.status === filterStatus) &&
      (filterCat === "All" || p.category === filterCat);
  });

  function updateStatus(id, val) {
    const prospect = prospects.find(p => p.id === id);
    const updated = prospects.map(p => p.id === id ? {...p, status: val} : p);
    setProspects(updated);
    saveProspects(updated);
    logActivity("Status Update", `${prospect?.company} → "${val}"`);
  }
  function startEdit(p) { setEditingId(p.id); setEditData({contact:p.contact,phone:p.phone,notes:p.notes,status:p.status,agent:p.agent}); }
  function saveEdit(id) {
    const prospect = prospects.find(p => p.id === id);
    const updated = prospects.map(p => p.id === id ? {...p,...editData} : p);
    setProspects(updated);
    saveProspects(updated);
    setEditingId(null);
    logActivity("Prospect Edited", `Updated details for ${prospect?.company}`);
  }
  function addProspect() {
    if (!addForm.company.trim()) return;
    const newP = { ...addForm, id: Date.now() };
    const updated = [newP, ...prospects];
    setProspects(updated);
    saveProspects(updated);
    logActivity("Prospect Added", `Added ${addForm.company} as ${addForm.category}`);
    setAddForm({ company:"", industry:"", category:"Cold Prospects", agent:"", phone:"", contact:"", status:"To Contact", notes:"" });
    setShowAdd(false);
  }

  function addDeal() {
    if (!dealForm.company.trim() || !dealForm.value) return;
    const now = new Date();
    const newDeal = {
      id: Date.now(),
      company: dealForm.company,
      value: parseFloat(dealForm.value),
      agent: dealForm.agent || currentUser.name,
      notes: dealForm.notes,
      month: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`,
      date: now.toISOString(),
    };
    const updated = [newDeal, ...deals];
    setDeals(updated);
    saveDeals(updated);
    logActivity("Deal Closed 🎉", `${dealForm.company} — RM${parseFloat(dealForm.value).toLocaleString()}`);
    setDealForm({ company:"", value:"", agent:currentUser?.name||"", notes:"" });
    setShowDeal(false);
  }

  // Monthly stats
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const monthDeals = deals.filter(d => d.month === currentMonth);
  const monthRevenue = monthDeals.reduce((s, d) => s + d.value, 0);
  const TARGET = 100000;
  const targetPct = Math.min((monthRevenue / TARGET) * 100, 100);

  // Agent activity
  const agentStats = USERS.map(u => ({
    name: u.name,
    contacted: prospects.filter(p => p.agent && p.agent.toLowerCase().includes(u.name.split(" ")[0].toLowerCase()) && p.status !== "To Contact").length,
    total: prospects.filter(p => p.agent && p.agent.toLowerCase().includes(u.name.split(" ")[0].toLowerCase())).length,
    hot: prospects.filter(p => p.agent && p.agent.toLowerCase().includes(u.name.split(" ")[0].toLowerCase()) && p.status === "Hot Lead 🔥").length,
    revenue: deals.filter(d => d.agent && d.agent.toLowerCase().includes(u.name.split(" ")[0].toLowerCase()) && d.month === currentMonth).reduce((s,d)=>s+d.value,0),
  })).filter(a => a.total > 0);

  const genProspects = prospects.filter(p => p.company.toLowerCase().includes(cSearch.toLowerCase()));
  const seqOpts = selCompany ? SEQ_OPTIONS[selCompany.category] || [] : [];

  async function generate() {
    if (!contactName.trim() || !selCompany || !seq || !agentName.trim()) { setGenErr("Please fill in all fields."); return; }
    setGenErr(""); setGenerating(true); setMessage("");
    const ch = channel === "whatsapp" ? "WhatsApp" : "Email";
    const seqLabel = seqOpts.find(s => s.value === seq)?.label || seq;
    try {
      const res = await fetch("/api/generate", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          system: `You are an AI sales assistant for Seri Rasa, a Malaysian OEM spice manufacturer. Write personalised, friendly outreach messages. Seri Rasa: founded 2021, custom OEM spice blends, competitive pricing, flexible MOQs, Halal certified, R&D support, www.mazzaspice.com. WhatsApp: max 5 lines, 1-2 emojis, single soft CTA, no hard-sell. Email: max 150 words, start with "Subject: [line]", sign off with name + Seri Rasa + website. Write ONLY the message — no labels, no preamble.`,
          userMessage: `Write a ${ch} message. Contact: ${contactName}, Company: ${selCompany.company}, Industry: ${selCompany.industry}, Type: ${selCompany.category}, Step: ${seqLabel}, Agent: ${agentName}. Personalise for ${selCompany.industry} naturally.`
        })
      });
      const data = await res.json();
      if (data.error) { setGenErr("API error: " + data.error); return; }
      if (!data.text) { setGenErr("No response received. Check Vercel logs."); return; }
      setMessage(data.text);
    } catch(err) { setGenErr("Something went wrong: " + err.message); }
    finally { setGenerating(false); }
  }

  function copy() { navigator.clipboard.writeText(message); setCopied(true); setTimeout(()=>setCopied(false),2000); }

  const inp = { width:"100%", padding:"10px 14px", background:"#fff", border:"1px solid #CBD5E1", borderRadius:10, color:"#0F172A", fontSize:13, fontFamily:"'Plus Jakarta Sans',sans-serif", outline:"none", boxSizing:"border-box", boxShadow:"0 1px 3px rgba(15,36,66,0.06)" };
  const tabBtn = (active) => ({ padding:isMobile?"6px 10px":"8px 20px", border:active?"none":"1px solid rgba(255,255,255,0.15)", borderRadius:8, cursor:"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:isMobile?11:13, fontWeight:active?700:500, background:active?"#fff":"transparent", color:active?"#1E3A5F":"rgba(255,255,255,0.75)", boxShadow:active?"0 2px 12px rgba(0,0,0,0.12)":"none", transition:"all 0.2s", whiteSpace:"nowrap" });

  const StatusBadge = ({status}) => {
    const c = STATUS_CONFIG[status] || {color:"#888",bg:"#222"};
    return <span style={{fontSize:11,padding:"4px 12px",borderRadius:20,background:c.bg,color:c.color,fontWeight:600,whiteSpace:"nowrap",letterSpacing:"0.02em"}}>{status}</span>;
  };

  if (!currentUser) {
    return <LoginScreen onLogin={user => {
      setCurrentUser(user);
      setAgentName(user.name.split(" ")[0]);
      // Auto-set portal based on user access
      if (user.sales && user.ops) { setPortal("sales"); setTab("sales_home"); }
      else if (user.ops && !user.sales) { setPortal("ops"); setTab("ops_home"); }
      else if (user.sales && !user.ops) { setPortal("sales"); setTab("sales_home"); }
    }} />;
  }

  return (
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#0F172A"}}>

      {/* Loading screen */}
      {loading && (
        <div style={{position:"fixed",inset:0,background:"#F0F4F8",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
          <div style={{fontSize:48}}>🌶️</div>
          <div style={{fontSize:16,color:"#1E3A5F",fontWeight:600}}>Loading your pipeline...</div>
          <div style={{display:"flex",gap:6}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#1E3A5F",animation:`bounce 0.8s ${i*0.2}s infinite`}}/>)}</div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1E3A5F 0%,#0F2442 100%)",padding:isMobile?"10px 12px":"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 24px rgba(15,36,66,0.18)",flexWrap:"nowrap",gap:8,overflowX:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:isMobile?40:60,height:isMobile?28:40,borderRadius:12,overflow:"hidden",border:"1px solid rgba(255,255,255,0.2)"}}><img src="data:image/png;base64,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" alt="Seri Rasa" style={{width:"100%",height:"100%",objectFit:"contain"}}/></div>
          {!isMobile && <div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:"0.08em"}}>OCC</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:"0.2em",textTransform:"uppercase",fontWeight:500}}>Operations Command Centre</div>
          </div>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none",paddingBottom:2}}>
          {!isMobile && syncing && <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontWeight:500}}>⏳ Syncing...</div>}
          {!isMobile && !syncing && lastSync && <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:500}}>✓ {lastSync.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>}
          <button onClick={loadProspects} style={{padding:"6px 11px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13}}>🔄</button>
          {/* Portal switcher */}
          {currentUser?.sales && currentUser?.ops && (
            <div style={{display:"flex",gap:3,background:"rgba(255,255,255,0.1)",borderRadius:8,padding:3,marginRight:8}}>
              <button onClick={()=>setPortal("sales")} style={{padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:portal==="sales"?"#fff":"transparent",color:portal==="sales"?"#1E3A5F":"rgba(255,255,255,0.7)"}}>Sales</button>
              <button onClick={()=>setPortal("ops")} style={{padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:portal==="ops"?"#fff":"transparent",color:portal==="ops"?"#1E3A5F":"rgba(255,255,255,0.7)"}}>Operations</button>
            </div>
          )}
          {/* Sales tabs */}
          {(portal==="sales"||(!portal&&currentUser?.sales)) && currentUser?.sales && (<>
            <button onClick={()=>{setPortal("sales");setTab("sales_home");}} style={tabBtn(tab==="sales_home")}>📊 Overview</button>
            <button onClick={()=>{setPortal("sales");setTab("dashboard");}} style={tabBtn(tab==="dashboard")}>🤝 Leads</button>
            <button onClick={()=>{setPortal("sales");setTab("po");}} style={tabBtn(tab==="po")}>📥 PO Intake</button>
          </>)}
          {/* Ops tabs */}
          {(portal==="ops"||(!portal&&!currentUser?.sales&&currentUser?.ops)) && currentUser?.ops && (<>
            <button onClick={()=>{setPortal("ops");setTab("ops_home");}} style={tabBtn(tab==="ops_home")}>⚙️ Overview</button>
            <button onClick={()=>{setPortal("ops");setTab("so");}} style={tabBtn(tab==="so")}>📈 Management</button>
            <button onClick={()=>{setPortal("ops");setTab("production");}} style={tabBtn(tab==="production")}>🏭 Production</button>
            <button onClick={()=>{setPortal("ops");setTab("po");}} style={tabBtn(tab==="po")}>📥 PO Intake</button>
            <button onClick={()=>{setPortal("ops");setTab("procurement");}} style={tabBtn(tab==="procurement")}>🛒 Procurement</button>
          </>)}
          {currentUser.role==="admin" && <button onClick={()=>setActivityTab(v=>!v)} style={{padding:"8px 14px",border:activityTab?"none":"1px solid rgba(255,255,255,0.15)",borderRadius:8,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,fontWeight:600,background:activityTab?"#fff":"transparent",color:activityTab?"#1E3A5F":"rgba(255,255,255,0.75)"}}>📋 Log</button>}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"rgba(255,255,255,0.1)",borderRadius:20,border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}}>
            {!isMobile && <div style={{fontSize:12,color:"rgba(255,255,255,0.9)",fontWeight:600}}>{currentUser.name}</div>}
            <button onClick={()=>{ try{localStorage.removeItem(SESSION_KEY);}catch{} setCurrentUser(null); }} style={{padding:"3px 10px",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:20,color:"rgba(255,255,255,0.8)",cursor:"pointer",fontSize:11,fontWeight:500}}>{isMobile?"↩":"Sign out"}</button>
          </div>
        </div>
      </div>

      {/* ═══ ACTIVITY LOG (Admin only) ═══ */}
      {activityTab && currentUser.role==="admin" && (
        <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 28px 0"}}>
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 8px rgba(15,36,66,0.06)"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #EEF2F7",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,letterSpacing:"0.1em",color:"#1E3A5F",textTransform:"uppercase",fontWeight:700}}>📋 Activity Log</div>
              <div style={{fontSize:11,color:"#94A3B8",fontWeight:500}}>{activityLog.length} entries</div>
            </div>
            <div style={{maxHeight:280,overflowY:"auto"}}>
              {activityLog.length===0
                ?<div style={{padding:"24px",textAlign:"center",color:"#94A3B8",fontSize:13}}>No activity yet</div>
                :activityLog.map(e=>(
                  <div key={e.id} style={{display:"grid",gridTemplateColumns:"160px 120px 160px 1fr",padding:"10px 20px",borderBottom:"1px solid #F8FAFC",alignItems:"center",gap:12,fontSize:12}}>
                    <div style={{color:"#94A3B8",fontWeight:500}}>{new Date(e.timestamp).toLocaleString("en-MY",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                    <div style={{color:"#1E3A5F",fontWeight:700}}>{e.user}</div>
                    <div style={{color:"#3B82F6",fontWeight:500}}>{e.action}</div>
                    <div style={{color:"#64748B"}}>{e.detail}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ DASHBOARD ═══ */}
            {/* ═══ SALES HOME ═══ */}
      {tab==="sales_home" && <SalesDashboard currentUser={currentUser} />}

      {/* ═══ OPS HOME ═══ */}
      {tab==="ops_home" && <OperationsHome currentUser={currentUser} onNavigate={(t,sub)=>{ setPortal(t==="production"||t==="procurement"?"ops":"sales"); setTab(t); if(sub) setOpsView(sub); }} />}

      {tab==="dashboard" && (
        <div style={{padding:isMobile?"14px":"28px",maxWidth:1240,margin:"0 auto"}}>
          {/* Leads view toggle */}
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {[{id:"pipeline",label:"📊 Pipeline"},{id:"copilot",label:"✨ SeriRasa AI"}].map(v=>(
              <button key={v.id} onClick={()=>setLeadsView(v.id)}
                style={{padding:"8px 20px",borderRadius:99,border:"none",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,fontWeight:700,
                  background:leadsView===v.id?"#1E3A5F":"#F1F5F9",color:leadsView===v.id?"#fff":"#64748B",transition:"all 0.2s"}}>
                {v.label}
              </button>
            ))}
          </div>

          {leadsView==="copilot" && (
            <SeriRasaAI
              prospects={prospects}
              soData={soData}
              ivData={ivData}
              currentUser={currentUser}
              stockItems={[]}
              customers={[]}
            />
          )}

          {leadsView==="pipeline" && <div style={{padding:isMobile?"0":"0",maxWidth:1240}}>

          {/* ROW 1 — Target + Pipeline */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>

            {/* Monthly Target Card */}
            <div style={{background:"linear-gradient(135deg,#1E3A5F 0%,#0F2442 100%)",borderRadius:20,padding:"28px",boxShadow:"0 8px 32px rgba(15,36,66,0.18)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.55)",textTransform:"uppercase",letterSpacing:"0.15em",fontWeight:600}}>Monthly Revenue Target</div>
                  <div style={{fontSize:26,fontWeight:800,color:"#fff",marginTop:6}}>RM {monthRevenue.toLocaleString()} <span style={{fontSize:14,color:"rgba(255,255,255,0.5)",fontWeight:400}}>/ RM 100,000</span></div>
                </div>
                <button onClick={()=>setShowDeal(true)} style={{padding:"10px 20px",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:12,color:"#fff",fontSize:13,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",whiteSpace:"nowrap",backdropFilter:"blur(4px)"}}>
                  🎉 Log Deal
                </button>
              </div>
              {/* Progress bar */}
              <div style={{background:"rgba(255,255,255,0.15)",borderRadius:20,height:10,overflow:"hidden",marginBottom:10}}>
                <div style={{height:"100%",borderRadius:20,background:`linear-gradient(90deg,${targetPct>=100?"#34D399":"#60A5FA"},${targetPct>=100?"#10B981":"#93C5FD"})`,width:`${targetPct}%`,transition:"width 0.8s ease",minWidth:targetPct>0?"4px":"0"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:500}}>
                <span>{targetPct.toFixed(1)}% achieved</span>
                <span>RM {(TARGET - monthRevenue).toLocaleString()} to go</span>
              </div>
              {/* This month's deals */}
              {monthDeals.length > 0 && (
                <div style={{marginTop:16,borderTop:"1px solid rgba(255,255,255,0.12)",paddingTop:14}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:10,fontWeight:600}}>Closed This Month</div>
                  {monthDeals.map(d=>(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #1e1e1e"}}>
                      <div>
                        <span style={{fontSize:13,color:"rgba(255,255,255,0.9)",fontWeight:500}}>{d.company}</span>
                        <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginLeft:8}}>{d.agent}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:"#34D399"}}>RM {d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pipeline Funnel */}
            <div style={{background:"linear-gradient(135deg,#1E3A5F 0%,#0F2442 100%)",borderRadius:20,padding:"28px",boxShadow:"0 8px 32px rgba(15,36,66,0.18)"}}>
              <div style={{fontSize:11,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:20,fontWeight:700}}>Pipeline Overview</div>
              {[
                {label:"Not Contacted",value:stats.notContacted,color:"#3B82F6",icon:"📬"},
                {label:"Contacted / Waiting",value:stats.needsFollowUp,color:"#F59E0B",icon:"⏰"},
                {label:"Hot Leads",value:stats.hot,color:"#EF4444",icon:"🔥"},
                {label:"Warm Leads",value:stats.warm,color:"#F59E0B",icon:"🌡️"},
                {label:"Win-Back Needed",value:stats.winBack,color:"#EC4899",icon:"♻️"},
              ].map(s=>{
                const pct = stats.total > 0 ? (s.value/stats.total)*100 : 0;
                return (
                  <div key={s.label} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#aaa"}}>{s.icon} {s.label}</span>
                      <span style={{fontSize:12,fontWeight:"bold",color:s.color}}>{s.value}</span>
                    </div>
                    <div style={{background:"#F1F5F9",borderRadius:20,height:8,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:20,background:s.color,width:`${pct}%`,opacity:0.9}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ROW 2 — Agent Activity */}
          <div style={{background:"#fff",borderRadius:20,padding:"28px",boxShadow:"0 2px 16px rgba(15,36,66,0.07)",border:"1px solid #EEF2F7",marginBottom:20}}>
            <div style={{fontSize:11,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:20,fontWeight:700}}>Agent Activity</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${Math.min(agentStats.length,4)},1fr)`,gap:12}}>
              {agentStats.map(a=>(
                <div key={a.name} style={{background:"#222",borderRadius:10,padding:"14px 16px",border:"1px solid #2a2a2a"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:12}}>{a.name}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      {label:"Assigned",value:a.total,color:"#888"},
                      {label:"Contacted",value:a.contacted,color:"#3B82F6"},
                      {label:"Hot Leads",value:a.hot,color:"#EF4444"},
                      {label:"Revenue (MTD)",value:`RM ${a.revenue.toLocaleString()}`,color:"#10B981"},
                    ].map(r=>(
                      <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:"#94A3B8",fontWeight:500}}>{r.label}</span>
                        <span style={{fontSize:12,fontWeight:"bold",color:r.color}}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  {/* Contact rate bar */}
                  <div style={{marginTop:10}}>
                    <div style={{background:"#2a2a2a",borderRadius:20,height:5,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:20,background:"#3B82F6",width:`${a.total>0?(a.contacted/a.total)*100:0}%`}}/>
                    </div>
                    <div style={{fontSize:10,color:"#94A3B8",marginTop:4,fontWeight:500}}>{a.total>0?Math.round((a.contacted/a.total)*100):0}% contact rate</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Urgent / Needs Attention */}
          {urgent.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,letterSpacing:"0.1em",color:"#D97706",textTransform:"uppercase",fontWeight:700,marginBottom:12}}>
                ⚠️ Needs Attention — {urgent.length} prospects
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {urgent.map(p=>(
                  <div key={p.id} style={{background:"#fff",borderRadius:14,padding:"14px 18px",border:`1px solid ${STATUS_CONFIG[p.status]?.color||"#CBD5E1"}33`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",boxShadow:"0 1px 6px rgba(15,36,66,0.06)"}}>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{p.company}</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:2,fontWeight:500}}>{p.agent||"Unassigned"}{p.contact?` · ${p.contact}`:""}{p.phone?` · ${p.phone}`:""}</div>
                    </div>
                    <StatusBadge status={p.status}/>
                    {p.notes&&<div style={{fontSize:11,color:"#64748B",fontStyle:"italic",width:"100%"}}>💬 {p.notes}</div>}
                    <select value={p.status} onChange={e=>updateStatus(p.id,e.target.value)}
                      style={{fontSize:11,padding:"6px 10px",background:"#F8FAFC",border:"1px solid #CBD5E1",borderRadius:8,color:"#0F172A",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                      {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={()=>setSelCompany(p)}
                      style={{fontSize:11,padding:"6px 12px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,color:"#1E3A5F",cursor:"pointer",fontWeight:600}}>
                      ✨ Write Message
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deal Modal */}
          {showDeal && (
            <div style={{position:"fixed",inset:0,background:"rgba(15,36,66,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}} onClick={()=>setShowDeal(false)}>
              <div style={{background:"#fff",borderRadius:24,padding:32,width:"100%",maxWidth:440,boxShadow:"0 24px 80px rgba(15,36,66,0.2)"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
                  <div style={{fontSize:18,fontWeight:800,color:"#0F172A"}}>🎉 Log a Closed Deal</div>
                  <button onClick={()=>setShowDeal(false)} style={{background:"#F1F5F9",border:"none",color:"#64748B",cursor:"pointer",fontSize:18,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {[
                    {l:"Company Name",k:"company",ph:"e.g. Gardenia Bakeries"},
                    {l:"Deal Value (RM)",k:"value",ph:"e.g. 15000",type:"number"},
                    {l:"Agent",k:"agent",ph:"e.g. Jasmine"},
                    {l:"Notes",k:"notes",ph:"Any details about the deal..."},
                  ].map(f=>(
                    <div key={f.k}>
                      <div style={{fontSize:11,color:"#64748B",letterSpacing:"0.05em",marginBottom:6,fontWeight:600}}>{f.l}</div>
                      <input type={f.type||"text"} value={dealForm[f.k]} onChange={e=>setDealForm(d=>({...d,[f.k]:e.target.value}))} placeholder={f.ph}
                        style={{...inp,fontSize:13}} onFocus={e=>e.target.style.borderColor="#10B981"} onBlur={e=>e.target.style.borderColor="#3a3a3a"}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:10,marginTop:22}}>
                  <button onClick={()=>setShowDeal(false)} style={{flex:1,padding:"12px",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:12,color:"#64748B",cursor:"pointer",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Cancel</button>
                  <button onClick={addDeal} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#1E3A5F,#2D5A8E)",border:"none",borderRadius:12,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:"0 4px 16px rgba(15,36,66,0.25)"}}>
                    ✓ Log Deal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search company, agent, contact..." style={{...inp,maxWidth:280,flex:1}}/>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{...inp,width:"auto",cursor:"pointer"}}>
              <option value="All">All Statuses</option>
              {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...inp,width:"auto",cursor:"pointer"}}>
              <option value="All">All Categories</option>
              <option value="Cold Prospects">Cold Prospects</option>
              <option value="Warm Leads">Warm Leads</option>
              <option value="Inactive Customers">Inactive Customers</option>
            </select>
            <div style={{fontSize:12,color:"#555"}}>{filtered.length} prospects</div>
            <button onClick={()=>setShowAdd(true)} style={{padding:"9px 16px",background:"linear-gradient(90deg,#E8650A,#c94f08)",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:"600",fontFamily:"DM Sans,sans-serif",cursor:"pointer",marginLeft:"auto",boxShadow:"0 2px 10px rgba(232,101,10,0.35)",display:"flex",alignItems:"center",gap:6}}>
              ＋ Add Prospect
            </button>
          </div>

          {/* Add Prospect Modal */}
          {showAdd && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowAdd(false)}>
              <div style={{background:"#1a1a1a",borderRadius:16,padding:28,width:"100%",maxWidth:560,border:"1px solid #333",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
                  <div style={{fontFamily:"Playfair Display,serif",fontSize:20,fontWeight:"bold",color:"#E8650A"}}>➕ Add New Prospect</div>
                  <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:"#666",cursor:"pointer",fontSize:22,lineHeight:1}}>×</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  {[
                    {l:"Company Name *",k:"company",ph:"e.g. Gardenia Bakeries",full:true},
                    {l:"Industry",k:"industry",ph:"e.g. Bakery, Food Manufacturer"},
                    {l:"Contact Name",k:"contact",ph:"e.g. Jason Lim"},
                    {l:"Phone",k:"phone",ph:"e.g. 012-345 6789"},
                    {l:"Agent",k:"agent",ph:"e.g. Jasmine"},
                    {l:"Notes",k:"notes",ph:"Any relevant context..."},
                  ].map(f=>(
                    <div key={f.k} style={f.full?{gridColumn:"1/-1"}:{}}>
                      <div style={{fontSize:10,color:"#E8650A",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontWeight:600}}>{f.l}</div>
                      <input value={addForm[f.k]} onChange={e=>setAddForm(d=>({...d,[f.k]:e.target.value}))} placeholder={f.ph}
                        style={{...inp,fontSize:13}} onFocus={e=>e.target.style.borderColor="#1E3A5F"} onBlur={e=>e.target.style.borderColor="#CBD5E1"}/>
                    </div>
                  ))}
                  <div>
                    <div style={{fontSize:10,color:"#E8650A",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontWeight:600}}>Category</div>
                    <select value={addForm.category} onChange={e=>setAddForm(d=>({...d,category:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                      <option value="Cold Prospects">Cold Prospects</option>
                      <option value="Warm Leads">Warm Leads</option>
                      <option value="Inactive Customers">Inactive Customers</option>
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#E8650A",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontWeight:600}}>Status</div>
                    <select value={addForm.status} onChange={e=>setAddForm(d=>({...d,status:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                      {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,marginTop:22}}>
                  <button onClick={()=>setShowAdd(false)} style={{flex:1,padding:"11px",background:"#2a2a2a",border:"1px solid #444",borderRadius:8,color:"#aaa",cursor:"pointer",fontSize:13,fontFamily:"DM Sans,sans-serif"}}>Cancel</button>
                  <button onClick={addProspect} style={{flex:2,padding:"11px",background:"linear-gradient(90deg,#E8650A,#c94f08)",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:"bold",fontFamily:"DM Sans,sans-serif",boxShadow:"0 2px 12px rgba(232,101,10,0.4)"}}>
                    ✓ Add to Pipeline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{borderRadius:12,overflow:"hidden",border:"1px solid #222"}}>
            <div style={{display:"grid",gridTemplateColumns:"2.2fr 1.1fr 0.9fr 1fr 1.4fr 90px",background:"#1e1e1e",padding:"9px 14px",gap:10}}>
              {["Company","Category","Agent","Contact","Status","Action"].map(h=>(
                <div key={h} style={{fontSize:10,letterSpacing:"0.1em",color:"#E8650A",textTransform:"uppercase",fontWeight:"bold"}}>{h}</div>
              ))}
            </div>
            <div style={{maxHeight:480,overflowY:"auto"}}>
              {filtered.map((p,i)=>(
                <div key={p.id}>
                  <div style={{display:"grid",gridTemplateColumns:"2.2fr 1.1fr 0.9fr 1fr 1.4fr 90px",padding:"10px 14px",gap:10,background:i%2===0?"#151515":"#191919",alignItems:"center",borderBottom:"1px solid #1e1e1e"}}>
                    <div>
                      <div style={{fontSize:13,color:"#f0ece0"}}>{p.company}</div>
                      {p.notes&&<div style={{fontSize:10,color:"#555",fontStyle:"italic",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {p.notes}</div>}
                    </div>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:(CAT_COLOR[p.category]||"#555")+"22",color:CAT_COLOR[p.category]||"#888",border:`1px solid ${CAT_COLOR[p.category]||"#555"}33`,whiteSpace:"nowrap"}}>{p.category}</span>
                    <div style={{fontSize:12,color:"#888"}}>{p.agent||"—"}</div>
                    <div style={{fontSize:12,color:"#888"}}>{p.contact||"—"}{p.phone&&<div style={{fontSize:10,color:"#555"}}>{p.phone}</div>}</div>
                    <select value={p.status} onChange={e=>updateStatus(p.id,e.target.value)}
                      style={{fontSize:11,padding:"4px 7px",background:STATUS_CONFIG[p.status]?.bg||"#222",border:`1px solid ${STATUS_CONFIG[p.status]?.color||"#444"}44`,borderRadius:6,color:STATUS_CONFIG[p.status]?.color||"#aaa",cursor:"pointer",width:"100%"}}>
                      {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={()=>editingId===p.id?saveEdit(p.id):startEdit(p)}
                      style={{padding:"5px 10px",background:editingId===p.id?"#E8650A":"#2a2a2a",border:`1px solid ${editingId===p.id?"#E8650A":"#444"}`,borderRadius:6,color:"#fff",cursor:"pointer",fontSize:11}}>
                      {editingId===p.id?"Save":"Edit"}
                    </button>
                  </div>
                  {editingId===p.id&&(
                    <div style={{background:"#1a1410",padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,borderBottom:"1px solid #2a2a2a"}}>
                      {[{l:"Contact Name",k:"contact"},{l:"Phone",k:"phone"},{l:"Agent",k:"agent"},{l:"Notes",k:"notes"}].map(f=>(
                        <div key={f.k}>
                          <div style={{fontSize:10,color:"#E8650A",textTransform:"uppercase",marginBottom:4}}>{f.l}</div>
                          <input value={editData[f.k]||""} onChange={e=>setEditData(d=>({...d,[f.k]:e.target.value}))} style={{...inp,fontSize:12}}/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:"#444",fontSize:14}}>No prospects match your filters</div>}
            </div>
          </div>
        </div>}
        </div>
      )}

      {/* ═══ SO DASHBOARD ═══ */}
      {tab==="so" && (() => {
        const safeIvData = Array.isArray(ivData) ? ivData : [];
        const safeSoData = Array.isArray(soData) ? soData : [];
        const safePoData = Array.isArray(poData) ? poData : [];
        const safeRvData = Array.isArray(rvData) ? rvData : [];

        // ── API-level reconciliation ──────────────────────────────
        const recon = (() => {
          const custInv = {};
          const custRv = {};
          (safeIvData||[]).forEach(inv => {
            const name = (inv.customer||"").trim();
            if (!name) return;
            custInv[name] = (custInv[name]||0) + (parseFloat(inv.amount)||0);
          });
          (safeRvData||[]).forEach(rv => {
            const name = (rv.customer||rv.companyname||rv.branchname||"").trim();
            if (!name) return;
            custRv[name] = (custRv[name]||0) + (parseFloat(rv.amount||rv.docamt)||0);
          });
          const rows = Object.keys(custInv).map(name => ({
            name,
            invoiced: custInv[name]||0,
            collected: custRv[name]||0,
            outstanding: (custInv[name]||0) - (custRv[name]||0),
          })).filter(r => r.outstanding > 0).sort((a,b) => b.outstanding - a.outstanding);
          const totalInv = rows.reduce((s,r)=>s+r.invoiced,0);
          const totalColl = rows.reduce((s,r)=>s+r.collected,0);
          const totalOut = rows.reduce((s,r)=>s+r.outstanding,0);
          return { rows, totalInv, totalColl, totalOut };
        })();
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

        // ── Financial Stats ───────────────────────────────────────────────
        const currentMonthIV = safeIvData.filter(i=>i.date&&i.date.startsWith(currentMonth));
        const currentMonthRV = safeRvData.filter(r=>r.date&&r.date.startsWith(currentMonth));
        const totalInvoiced  = currentMonthIV.filter(i=>i.amount>0).reduce((a,i)=>a+i.amount,0);
        // Collected = invoiced amount minus outstanding (most accurate across RV/CI data)
        const totalCollected = currentMonthIV.reduce((a,i)=>a+((i.amount||0)-(i.outstanding||0)),0);
        // Outstanding: sum of unpaid invoice amounts (paymentamt unreliable in SQL API)
        // Using invoice docamt for unpaid invoices as best approximation
        const totalOutstanding = safeIvData.filter(i=>i.status!=="Paid"&&i.amount>0).reduce((a,i)=>a+i.amount,0);
        const totalOverdueAmt  = safeIvData.filter(i=>i.status==="Overdue").reduce((a,i)=>a+(i.outstanding||0),0);

        // ── Invoice Aging Buckets (Xero-style) ────────────────────────────
        const unpaidIV  = safeIvData.filter(i=>i.status!=="Paid"&&i.amount>0);
        const overdueIV = unpaidIV.filter(i=>i.status==="Overdue"&&i.amount>0);
        const due30IV   = unpaidIV.filter(i=>i.status==="Invoiced"&&new Date(i.dueDate)<=new Date(now.getTime()+30*24*60*60*1000));
        const futureIV  = unpaidIV.filter(i=>i.status==="Invoiced"&&new Date(i.dueDate)>new Date(now.getTime()+30*24*60*60*1000));
        const overdueAmt= overdueIV.reduce((a,i)=>a+(i.outstanding||0),0);
        const due30Amt  = due30IV.reduce((a,i)=>a+(i.outstanding||0),0);
        const futureAmt = futureIV.reduce((a,i)=>a+(i.outstanding||0),0);
        const totalOwed = overdueAmt+due30Amt+futureAmt||1;

        // ── Late SOs (delivery date passed, not DONE) ─────────────────────
        const lateSOs = safeSoData.filter(s=>{
          if (!s.delivery||s.delivery==="-") return false;
          const m = s.delivery.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (!m) return false;
          const delDate = new Date(`${m[3]}-${m[2]}-${m[1]}`);
          const status = String(s.status||"").toLowerCase();
          return delDate < now && !status.includes("done") && !status.includes("cancel");
        }).sort((a,b)=>b.amount-a.amount);

        // ── 3-Month Trend ─────────────────────────────────────────────────
        const months3 = [2,1,0].map(offset=>{
          const d = new Date(now.getFullYear(), now.getMonth()-offset, 1);
          const label = d.toLocaleString("en-MY",{month:"short",year:"2-digit"});
          const ms = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          const mIV = safeIvData.filter(i=>i.date&&i.date.startsWith(ms));
          const mRV = safeRvData.filter(r=>r.date&&r.date.startsWith(ms));
          return {
            label,
            invoiced:    mIV.reduce((a,i)=>a+i.amount,0),
            collected:   mIV.reduce((a,i)=>a+((i.amount||0)-(i.outstanding||0)),0),
            outstanding: mIV.filter(i=>i.status!=="Paid").reduce((a,i)=>a+(i.outstanding||0),0),
          };
        });
        const maxTrend = Math.max(...months3.map(m=>m.invoiced),1);

        // ── Top 10 Overdue by value ───────────────────────────────────────
        const top10Overdue = [...overdueIV].sort((a,b)=>(b.outstanding||0)-(a.outstanding||0)).slice(0,10);

        // ── SO Table filtering ────────────────────────────────────────────
        const filteredSO = safeSoData.filter(s=>{
          const matchSearch = (s.customer+s.id+s.agent).toLowerCase().includes(soSearch.toLowerCase());
          const matchFilter = soFilter==="All" || String(s.status||"").toLowerCase().includes(soFilter.toLowerCase()) || (soFilter==="Late"&&lateSOs.find(l=>l.id===s.id));
          return matchSearch && matchFilter;
        });
        const SO_STATUS_COLOR = (status) => {
          const s = String(status||"").toLowerCase();
          if (s.includes("done")||s.includes("complete")) return "#10B981";
          if (s.includes("partial")) return "#F59E0B";
          if (s.includes("cancel")) return "#94A3B8";
          return "#3B82F6";
        };

        const fmt = (n) => n>=1000000?`RM ${(n/1000000).toFixed(2)}M`:n>=1000?`RM ${(n/1000).toFixed(1)}k`:`RM ${n.toFixed(0)}`;

        // ── Drawer helper ─────────────────────────────────────────────────
        const openDrawer = (type, title, data, columns) => setDrawer({type, title, data, columns});
        const Drawer = drawer ? (() => {
          const cols = drawer.columns;
          return (
            <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",justifyContent:"flex-end"}} onClick={()=>setDrawer(null)}>
              <div style={{width:isMobile?"100%":"640px",background:"#fff",height:"100%",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.12)"}} onClick={e=>e.stopPropagation()}>
                <div style={{padding:"20px 24px",borderBottom:"1px solid #F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:"#fff",zIndex:1}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:"#0F172A"}}>{drawer.title}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{drawer.data.length} records</div>
                  </div>
                  <button onClick={()=>setDrawer(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94A3B8",padding:"4px 8px"}}>✕</button>
                </div>
                <div style={{padding:"16px 24px"}}>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{background:"#F8FAFC"}}>
                          {cols.map(c=><th key={c.key} style={{padding:"9px 12px",textAlign:c.align||"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {drawer.data.map((row,i)=>(
                          <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:i%2===0?"#fff":"#FAFAFA"}}>
                            {cols.map(c=>(
                              <td key={c.key} style={{padding:"10px 12px",color:c.color?c.color(row):"#374151",fontWeight:c.bold?"700":"400",whiteSpace:"nowrap",textAlign:c.align||"left",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>
                                {c.render?c.render(row):row[c.key]||"-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {drawer.data.length===0&&<div style={{textAlign:"center",padding:"40px",color:"#94A3B8",fontSize:13}}>No records found</div>}
                </div>
              </div>
            </div>
          );
        })() : null;

        return (
          <div style={{padding:isMobile?"12px":"24px 28px",maxWidth:1280,margin:"0 auto"}}>
          {Drawer}

            {/* ── RECONCILIATION PANEL ── */}
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #EEF2F7",overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"13px 18px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>AR Reconciliation — Customer Level</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Total invoiced minus total receipts per customer · {recon.rows.length} customers with outstanding</div>
              </div>
              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em"}}>Total invoiced</div><div style={{fontSize:14,fontWeight:800,color:"#1E3A5F"}}>RM {recon.totalInv.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em"}}>Total collected</div><div style={{fontSize:14,fontWeight:800,color:"#10B981"}}>RM {recon.totalColl.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.08em"}}>Net outstanding</div><div style={{fontSize:14,fontWeight:800,color:"#F59E0B"}}>RM {recon.totalOut.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
              </div>
            </div>
            <div style={{maxHeight:280,overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead style={{position:"sticky",top:0}}>
                  <tr style={{background:"#F8FAFC"}}>
                    {["Customer","Total Invoiced","Total Collected","Outstanding","Collection Rate"].map(h=>(
                      <th key={h} style={{padding:"9px 14px",textAlign:h==="Customer"?"left":"right",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recon.rows.slice(0,20).map((r,i)=>{
                    const rate = r.invoiced>0?Math.round((r.collected/r.invoiced)*100):0;
                    return (
                      <tr key={i} style={{borderTop:"1px solid #F1F5F9",background:r.outstanding>50000?"#FFFBEB":"#fff"}}>
                        <td style={{padding:"9px 14px",fontWeight:600,color:"#0F172A",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:"#374151"}}>RM {r.invoiced.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:"#10B981",fontWeight:600}}>RM {r.collected.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",fontWeight:700,color:r.outstanding>50000?"#EF4444":r.outstanding>10000?"#F59E0B":"#374151"}}>RM {r.outstanding.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td style={{padding:"9px 14px",textAlign:"right"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8}}>
                            <div style={{width:60,height:6,background:"#F1F5F9",borderRadius:99,overflow:"hidden"}}>
                              <div style={{height:"100%",background:rate>=90?"#10B981":rate>=60?"#F59E0B":"#EF4444",borderRadius:99,width:`${Math.min(rate,100)}%`}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:700,color:rate>=90?"#10B981":rate>=60?"#F59E0B":"#EF4444",minWidth:32}}>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ROW 1: 4 Hero KPI Cards ── */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:16}}>
              {[
                {label:"Invoiced (This Month)", value:fmt(totalInvoiced), sub:`${currentMonthIV.length} invoices`, color:"#3B82F6", bg:"#EFF6FF", icon:"📋",
                  onClick:()=>openDrawer("invoiced","Invoices This Month",currentMonthIV.sort((a,b)=>b.amount-a.amount),[
                    {key:"id",label:"Invoice #",bold:true,color:()=>"#1E3A5F"},
                    {key:"customer",label:"Customer"},
                    {key:"amount",label:"Amount",align:"right",bold:true,render:r=>`RM ${r.amount.toLocaleString()}`},
                    {key:"date",label:"Date"},
                    {key:"status",label:"Status",render:r=><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:r.status==="Paid"?"#F0FDF4":"#FEF9C3",color:r.status==="Paid"?"#10B981":"#F59E0B",fontWeight:700}}>{r.status}</span>},
                  ])},
                {label:"Collected (This Month)", value:fmt(totalCollected), sub:`${Math.round(totalInvoiced>0?(totalCollected/totalInvoiced)*100:0)}% collection rate`, color:"#10B981", bg:"#F0FDF4", icon:"✅",
                  onClick:()=>openDrawer("collected","Collected This Month",currentMonthRV.sort((a,b)=>b.amount-a.amount),[
                    {key:"id",label:"Receipt #",bold:true,color:()=>"#1E3A5F"},
                    {key:"customer",label:"Customer"},
                    {key:"amount",label:"Amount",align:"right",bold:true,render:r=>`RM ${r.amount.toLocaleString()}`},
                    {key:"date",label:"Date"},
                  ])},
                {label:"Total Outstanding", value:"~"+fmt(totalOutstanding), sub:`${unpaidIV.length} unpaid invoices · approx`, color:"#F59E0B", bg:"#FFFBEB", icon:"⏳",
                  onClick:()=>openDrawer("outstanding","All Outstanding Invoices (Approx)",unpaidIV.sort((a,b)=>(b.outstanding||0)-(a.outstanding||0)),[
                    {key:"id",label:"Invoice #",bold:true,color:()=>"#1E3A5F"},
                    {key:"customer",label:"Customer"},
                    {key:"amount",label:"Invoiced",align:"right",render:r=>`RM ${r.amount.toLocaleString()}`},
                    {key:"outstanding",label:"Outstanding",align:"right",bold:true,color:()=>"#F59E0B",render:r=>`RM ${(r.outstanding||0).toLocaleString()}`},
                    {key:"dueDate",label:"Due Date"},
                    {key:"status",label:"Status",render:r=><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:r.status==="Overdue"?"#FEF2F2":"#FFFBEB",color:r.status==="Overdue"?"#EF4444":"#F59E0B",fontWeight:700}}>{r.status}</span>},
                  ])},
                {label:"Overdue Amount", value:fmt(totalOverdueAmt), sub:`${overdueIV.length} overdue invoices`, color:"#EF4444", bg:"#FEF2F2", icon:"🚨",
                  onClick:()=>openDrawer("overdue","Overdue Invoices",overdueIV.sort((a,b)=>(b.outstanding||0)-(a.outstanding||0)),[
                    {key:"id",label:"Invoice #",bold:true,color:()=>"#1E3A5F"},
                    {key:"customer",label:"Customer"},
                    {key:"outstanding",label:"Overdue Amt",align:"right",bold:true,color:()=>"#EF4444",render:r=>`RM ${(r.outstanding||0).toLocaleString()}`},
                    {key:"dueDate",label:"Due Date",color:()=>"#EF4444"},
                    {key:"days",label:"Days Overdue",align:"right",bold:true,color:()=>"#EF4444",render:r=>r.dueDate?`${Math.floor((new Date()-new Date(r.dueDate))/(1000*60*60*24))}d`:""},
                  ])},
              ].map(c=>(
                <div key={c.label} onClick={c.onClick} style={{background:"#fff",borderRadius:16,padding:"20px",border:`1px solid ${c.color}22`,boxShadow:"0 2px 12px rgba(15,36,66,0.05)",cursor:"pointer",transition:"transform 0.1s",}}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <span style={{fontSize:20}}>{c.icon}</span>
                    <span style={{fontSize:10,background:c.bg,color:c.color,padding:"3px 8px",borderRadius:20,fontWeight:700,textTransform:"uppercase"}}>{c.label.split(" ")[0]}</span>
                  </div>
                  <div style={{fontSize:isMobile?"18px":"22px",fontWeight:800,color:"#0F172A",marginBottom:4}}>{c.value}</div>
                  <div style={{fontSize:11,color:"#94A3B8",fontWeight:500}}>{c.sub}</div>
                  <div style={{label:c.label}}></div>
                  <div style={{fontSize:10,color:"#CBD5E1",marginTop:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* ── ROW 2: Xero-style Invoice Aging Bar + Late SOs ── */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>

              {/* Invoice Aging — Xero style */}
              <div style={{background:"#fff",borderRadius:16,padding:"22px",border:"1px solid #EEF2F7",boxShadow:"0 2px 12px rgba(15,36,66,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>Invoices Owed To You</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Total outstanding across all invoices</div>
                  </div>
                  <div style={{fontSize:18,fontWeight:800,color:"#EF4444"}}>{fmt(totalOwed-1)}</div>
                </div>
                {/* Xero-style aging bar */}
                <div style={{height:10,borderRadius:999,overflow:"hidden",display:"flex",marginBottom:14,background:"#F1F5F9"}}>
                  {overdueAmt>0&&<div style={{width:`${(overdueAmt/totalOwed)*100}%`,background:"#EF4444",transition:"width 0.5s"}}/>}
                  {due30Amt>0&&<div style={{width:`${(due30Amt/totalOwed)*100}%`,background:"#F59E0B",transition:"width 0.5s"}}/>}
                  {futureAmt>0&&<div style={{width:`${(futureAmt/totalOwed)*100}%`,background:"#3B82F6",transition:"width 0.5s"}}/>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {label:"Overdue", amt:overdueAmt, count:overdueIV.length, color:"#EF4444", bg:"#FEF2F2", data:overdueIV},
                    {label:"Due within 30 days", amt:due30Amt, count:due30IV.length, color:"#F59E0B", bg:"#FFFBEB", data:due30IV},
                    {label:"Due later", amt:futureAmt, count:futureIV.length, color:"#3B82F6", bg:"#EFF6FF", data:futureIV},
                  ].map(row=>(
                    <div key={row.label} onClick={()=>openDrawer(row.label, row.label+" Invoices", row.data.sort((a,b)=>(b.outstanding||0)-(a.outstanding||0)),[
                      {key:"id",label:"Invoice #",bold:true,color:()=>"#1E3A5F"},
                      {key:"customer",label:"Customer"},
                      {key:"outstanding",label:"Outstanding",align:"right",bold:true,render:r=>`RM ${(r.outstanding||0).toLocaleString()}`},
                      {key:"dueDate",label:"Due Date"},
                      {key:"days",label:"Days",align:"right",render:r=>r.dueDate?`${Math.floor((new Date()-new Date(r.dueDate))/(1000*60*60*24))}d`:""},
                    ])} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:row.bg,borderRadius:10,cursor:"pointer",transition:"opacity 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:row.color}}/>
                        <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{row.label}</span>
                        <span style={{fontSize:11,color:row.color,fontWeight:700,background:"#fff",padding:"1px 7px",borderRadius:20}}>{row.count}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:800,color:row.color}}>{fmt(row.amt)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Late / Undelivered SOs */}
              <div style={{background:"#fff",borderRadius:16,padding:"22px",border:"1px solid #FEE2E2",boxShadow:"0 2px 12px rgba(15,36,66,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>Late Deliveries</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>SOs past delivery date, not completed</div>
                  </div>
                  <span style={{fontSize:11,background:"#FEF2F2",color:"#EF4444",padding:"4px 10px",borderRadius:20,fontWeight:700}}>{lateSOs.length} overdue</span>
                </div>
                {lateSOs.length===0 ? (
                  <div style={{textAlign:"center",padding:"30px 0",color:"#10B981",fontSize:13,fontWeight:600}}>✅ All deliveries on track!</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:220,overflowY:"auto"}}>
                    {lateSOs.slice(0,8).map(s=>{
                      const m=s.delivery.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                      const delDate=m?new Date(`${m[3]}-${m[2]}-${m[1]}`):null;
                      const daysLate=delDate?Math.floor((now-delDate)/(1000*60*60*24)):0;
                      return (
                        <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:"#FFF7F7",borderRadius:10,border:"1px solid #FEE2E2"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:700,color:"#0F172A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.customer}</div>
                            <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>{s.id} · {daysLate}d late</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                            <div style={{fontSize:12,fontWeight:800,color:"#EF4444"}}>RM {s.amount.toLocaleString()}</div>
                            <div style={{fontSize:10,color:"#94A3B8"}}>{s.delivery.replace("DELIVERY DATE: ","")}</div>
                          </div>
                        </div>
                      );
                    })}
                    {lateSOs.length>8&&<div style={{textAlign:"center",fontSize:11,color:"#94A3B8",padding:"6px 0"}}>+{lateSOs.length-8} more late deliveries</div>}
                  </div>
                )}
              </div>
            </div>

            {/* ── ROW 3: 3-Month Trend + Top 10 Overdue ── */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>

              {/* 3-Month Trend */}
              <div style={{background:"#fff",borderRadius:16,padding:"22px",border:"1px solid #EEF2F7",boxShadow:"0 2px 12px rgba(15,36,66,0.05)"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0F172A",marginBottom:4}}>3-Month Revenue Trend</div>
                <div style={{fontSize:11,color:"#94A3B8",marginBottom:20}}>{months3[0].label} → {months3[2].label}</div>
                <div style={{display:"flex",gap:8,alignItems:"flex-end",height:140}}>
                  {months3.map(m=>(
                    <div key={m.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <div style={{fontSize:10,color:"#64748B",fontWeight:700,textAlign:"center"}}>
                        <div style={{color:"#1E3A5F"}}>{m.invoiced>0?fmt(m.invoiced):"-"}</div>
                        <div style={{color:"#10B981",fontSize:9}}>{m.collected>0?fmt(m.collected):""}</div>
                      </div>
                      <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:90,gap:2}}>
                        <div style={{background:"#DCFCE7",borderRadius:"4px 4px 0 0",height:`${(m.collected/maxTrend)*85}%`,minHeight:m.collected>0?4:0}}/>
                        <div style={{background:"#1E3A5F",borderRadius:"4px 4px 0 0",height:`${(m.invoiced/maxTrend)*85}%`,minHeight:m.invoiced>0?4:0,opacity:0.85}}/>
                      </div>
                      <div style={{fontSize:11,color:"#94A3B8",fontWeight:600}}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:16,marginTop:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#1E3A5F"}}/><span style={{fontSize:11,color:"#64748B",fontWeight:500}}>Invoiced</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#DCFCE7",border:"1px solid #10B981"}}/><span style={{fontSize:11,color:"#64748B",fontWeight:500}}>Collected</span></div>
                </div>
              </div>

              {/* Top 10 Overdue Invoices */}
              <div style={{background:"#fff",borderRadius:16,padding:"22px",border:"1px solid #EEF2F7",boxShadow:"0 2px 12px rgba(15,36,66,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>Top Overdue Invoices</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Highest value unpaid overdue</div>
                  </div>
                  <span style={{fontSize:12,fontWeight:800,color:"#EF4444"}}>{fmt(overdueAmt)}</span>
                </div>
                {top10Overdue.length===0?(
                  <div style={{textAlign:"center",padding:"30px 0",color:"#10B981",fontSize:13,fontWeight:600}}>✅ No overdue invoices!</div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:240,overflowY:"auto"}}>
                    {top10Overdue.map((inv,idx)=>{
                      const daysOverdue = inv.dueDate ? Math.floor((now-new Date(inv.dueDate))/(1000*60*60*24)) : 0;
                      return (
                        <div key={inv.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:idx===0?"#FEF2F2":"#FAFAFA",borderRadius:10,border:`1px solid ${idx===0?"#FEE2E2":"#F1F5F9"}`}}>
                          <div style={{width:20,height:20,borderRadius:"50%",background:idx<3?"#EF4444":"#F59E0B",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{idx+1}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#0F172A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{inv.customer}</div>
                            <div style={{fontSize:10,color:"#94A3B8"}}>{inv.id} · {daysOverdue}d overdue</div>
                          </div>
                          <div style={{fontSize:12,fontWeight:800,color:"#EF4444",flexShrink:0}}>RM {(inv.outstanding||0).toLocaleString()}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── ROW 4: SO Table ── */}
            <div style={{background:"#fff",borderRadius:16,border:"1px solid #EEF2F7",boxShadow:"0 2px 12px rgba(15,36,66,0.05)",overflow:"hidden"}}>
              <div style={{padding:"18px 22px",borderBottom:"1px solid #F1F5F9",display:"flex",flexWrap:"wrap",gap:10,alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0F172A"}}>Sales Orders</div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{filteredSO.length} of {safeSoData.length} orders</div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <input value={soSearch} onChange={e=>setSoSearch(e.target.value)} placeholder="Search customer, SO#..." style={{padding:"8px 12px",borderRadius:10,border:"1px solid #E2E8F0",fontSize:12,outline:"none",width:200,color:"#0F172A"}}/>
                  <select value={soFilter} onChange={e=>setSoFilter(e.target.value)} style={{padding:"8px 12px",borderRadius:10,border:"1px solid #E2E8F0",fontSize:12,color:"#0F172A",background:"#fff",outline:"none"}}>
                    {["All","Done","Partial","Active","Late","Cancel"].map(f=><option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"#F8FAFC"}}>
                      {["SO #","Customer","Amount","Date","Delivery","Status","Agent"].map(h=>(
                        <th key={h} style={{padding:"11px 16px",textAlign:"left",fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSO.slice(0,100).map((s,i)=>{
                      const isLate = lateSOs.find(l=>l.id===s.id);
                      return (
                        <tr key={s.id} style={{borderTop:"1px solid #F1F5F9",background:isLate?"#FFF7F7":i%2===0?"#fff":"#FAFAFA"}}>
                          <td style={{padding:"10px 16px",fontWeight:700,color:"#1E3A5F",whiteSpace:"nowrap"}}>{s.id}</td>
                          <td style={{padding:"10px 16px",color:"#374151",maxWidth:200,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.customer}</td>
                          <td style={{padding:"10px 16px",fontWeight:700,color:"#0F172A",whiteSpace:"nowrap"}}>RM {s.amount.toLocaleString()}</td>
                          <td style={{padding:"10px 16px",color:"#64748B",whiteSpace:"nowrap"}}>{s.date}</td>
                          <td style={{padding:"10px 16px",color:isLate?"#EF4444":"#64748B",fontWeight:isLate?700:400,whiteSpace:"nowrap",fontSize:11}}>{isLate?"⚠️ ":""}{s.delivery!=="-"?s.delivery.replace("DELIVERY DATE: ",""):"-"}</td>
                          <td style={{padding:"10px 16px"}}>
                            <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:`${SO_STATUS_COLOR(s.status)}18`,color:SO_STATUS_COLOR(s.status),fontWeight:700}}>{s.status||"Active"}</span>
                          </td>
                          <td style={{padding:"10px 16px",color:"#64748B",whiteSpace:"nowrap"}}>{s.agent||"-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredSO.length>100&&<div style={{padding:"12px",textAlign:"center",fontSize:11,color:"#94A3B8"}}>Showing 100 of {filteredSO.length} — use search to filter</div>}
              </div>
            </div>


            {/* ── By Product P&L ─────────────────────────────────── */}
            <ProductPLSection invoices={ivData} />
            <CustomerPLSection invoices={ivData} rvData={rvData} />

            {/* Sync timestamp */}
            <div style={{marginTop:12,padding:"10px 16px",background:"#F8FAFC",borderRadius:10,fontSize:11,color:"#94A3B8",textAlign:"center",fontWeight:500}}>
              🔄 Live SQL Account data · Last synced: {soLastSync ? soLastSync.toLocaleTimeString('en-MY') : 'Syncing...'}
            </div>
          </div>
        );

            })()}
      {/* ═══ PROCUREMENT TAB ═══ */}
      {tab==="procurement" && <ProcurementTab currentUser={currentUser} />}

      {/* ═══ PO INTAKE TAB ═══ */}
      {tab==="po" && (
        <div>
          <div style={{display:"flex",gap:8,padding:"16px 28px 0",borderBottom:"1px solid #E2E8F0",background:"#fff"}}>
            {[{id:"intake",label:"📥 PO Intake"},{id:"tracker",label:"📋 Document Tracker"}].map(t=>(
              <button key={t.id} onClick={()=>setPoSubTab(t.id)}
                style={{padding:"10px 20px",border:"none",borderBottom:poSubTab===t.id?"3px solid #1E3A5F":"3px solid transparent",
                  background:"none",cursor:"pointer",fontSize:13,fontWeight:poSubTab===t.id?800:500,
                  color:poSubTab===t.id?"#1E3A5F":"#94A3B8",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                {t.label}
              </button>
            ))}
          </div>
          {poSubTab==="intake" && <POIntake currentUser={currentUser} />}
          {poSubTab==="tracker" && <DocumentTracker />}
        </div>
      )}
      {tab==="production" && <DemandTab soData={soData} ivData={ivData} currentUser={currentUser} initialView={opsView} />}

      <style>{`@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;font-family:"Plus Jakarta Sans",sans-serif}body{background:#F0F4F8}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#EEF2F7}::-webkit-scrollbar-thumb{background:#1E3A5F;border-radius:6px}input::placeholder{color:#94A3B8}.card{animation:fadeIn 0.3s ease}`}</style>
    </div>
  );
}

export default App;
