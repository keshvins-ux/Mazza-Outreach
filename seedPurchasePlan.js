/**
 * seedPurchasePlan.js
 * Seeds the purchase plan data from Final_Without_TG.xlsx into Redis.
 * Run: cd /opt/mazza-sync && node seedPurchasePlan.js
 * 
 * This seeds pre-calculated data from your Excel workbook.
 * Update the DATA object below whenever you refresh your Excel.
 */

require('dotenv').config();
const { createClient } = require('redis');

// -- Paste updated data here when Excel changes --------------------------------
const DATA = {
  rawMaterials: [
    { RM_Code:"PCO-008",      RM_Description:"Palm Cooking Oil 17kg",      RM_UOM:"KG",   Total_Qty:7905,       Total_Cost:41385 },
    { RM_Code:"DC-004",       RM_Description:"Dried Chilli 688",            RM_UOM:"KG",   Total_Qty:2000,       Total_Cost:22800 },
    { RM_Code:"CL-YD",        RM_Description:"Chilli Yidu",                 RM_UOM:"KG",   Total_Qty:1465.1948,  Total_Cost:12893.71424 },
    { RM_Code:"CRD",          RM_Description:"Cardamom",                    RM_UOM:"KG",   Total_Qty:79.5852,    Total_Cost:11778.6096 },
    { RM_Code:"CL-668",       RM_Description:"Chili Bydagi 668 (BAG)",      RM_UOM:"BAG",  Total_Qty:80,         Total_Cost:9280 },
    { RM_Code:"TR",           RM_Description:"Turmeric",                    RM_UOM:"KG",   Total_Qty:1384.134,   Total_Cost:10519.4184 },
    { RM_Code:"CRD-SEED",     RM_Description:"Coriander Seed",              RM_UOM:"KG",   Total_Qty:2023.212,   Total_Cost:10116.06 },
    { RM_Code:"CM-SEED",      RM_Description:"Cumin Seed",                  RM_UOM:"KG",   Total_Qty:905.347,    Total_Cost:9415.6088 },
    { RM_Code:"CL-YD-25KG",   RM_Description:"Chilli Yidu 25KG",            RM_UOM:"KG",   Total_Qty:672,        Total_Cost:5850.432 },
    { RM_Code:"FN-SEED -25KG",RM_Description:"Fennel Seed 25KG",            RM_UOM:"KG",   Total_Qty:880,        Total_Cost:3960 },
    { RM_Code:"BP-SEED",      RM_Description:"Black Pepper Seed",           RM_UOM:"KG",   Total_Qty:119.1156,   Total_Cost:3692.5836 },
    { RM_Code:"RC",           RM_Description:"Rice",                        RM_UOM:"KG",   Total_Qty:855.6388,   Total_Cost:2652.48028 },
    { RM_Code:"CRD-SEED-25KG",RM_Description:"Coriander Seed 25KG",         RM_UOM:"KG",   Total_Qty:525,        Total_Cost:2625 },
    { RM_Code:"CL-BST",       RM_Description:"Chili Best",                  RM_UOM:"KG",   Total_Qty:228.96,     Total_Cost:2426.976 },
    { RM_Code:"PR-GHEE-0.9KG",RM_Description:"Pure Ghee 900g x 12 Tin",    RM_UOM:"KG",   Total_Qty:54,         Total_Cost:2299.8 },
    { RM_Code:"KK-SEED",      RM_Description:"Kas-Kas Seed",                RM_UOM:"KG",   Total_Qty:94.3504,    Total_Cost:1745.4824 },
    { RM_Code:"CL-668-KG",    RM_Description:"Chili Bydagi 668 (KG)",       RM_UOM:"KG",   Total_Qty:158.64,     Total_Cost:1745.04 },
    { RM_Code:"FN-SEED",      RM_Description:"Fennel Seed",                 RM_UOM:"KG",   Total_Qty:283.4122,   Total_Cost:1473.74344 },
    { RM_Code:"SA",           RM_Description:"Star Anise",                  RM_UOM:"KG",   Total_Qty:44.0568,    Total_Cost:590.36112 },
    { RM_Code:"GCP",          RM_Description:"Garlic Powder",               RM_UOM:"KG",   Total_Qty:29.218,     Total_Cost:467.488 },
    { RM_Code:"CNS",          RM_Description:"Cinnamon Stick",              RM_UOM:"KG",   Total_Qty:30.3032,    Total_Cost:460.60864 },
    { RM_Code:"CLV",          RM_Description:"Clove",                       RM_UOM:"KG",   Total_Qty:9.0644,     Total_Cost:375.26616 },
    { RM_Code:"ONP",          RM_Description:"Onion Powder",                RM_UOM:"KG",   Total_Qty:20.006,     Total_Cost:320.096 },
    { RM_Code:"FG-SEED",      RM_Description:"Fenugreek",                   RM_UOM:"KG",   Total_Qty:53.71,      Total_Cost:204.098 },
    { RM_Code:"NM",           RM_Description:"Nutmeg",                      RM_UOM:"KG",   Total_Qty:8.7882,     Total_Cost:202.1286 },
    { RM_Code:"MS-SEED",      RM_Description:"Mustard Seed",                RM_UOM:"KG",   Total_Qty:27,         Total_Cost:113.4 },
    { RM_Code:"MSD",          RM_Description:"Masoor Dhall",                RM_UOM:"BAG",  Total_Qty:28,         Total_Cost:110.88 },
    { RM_Code:"AUS-DHALL-1KG",RM_Description:"Australia Dhall 1KG",         RM_UOM:"UNIT", Total_Qty:46.4204,    Total_Cost:91.912392 },
    { RM_Code:"BL",           RM_Description:"Bay Leaf",                    RM_UOM:"KG",   Total_Qty:7.9178,     Total_Cost:51.4657 },
    { RM_Code:"CS",           RM_Description:"Cassia",                      RM_UOM:"KG",   Total_Qty:3.2,        Total_Cost:48 },
    { RM_Code:"RD",           RM_Description:"Red Dhall",                   RM_UOM:"KG",   Total_Qty:4.606,      Total_Cost:27.636 },
    { RM_Code:"MSG",          RM_Description:"MSG",                         RM_UOM:"KG",   Total_Qty:3.2,        Total_Cost:24.704 },
    { RM_Code:"SALT",         RM_Description:"Salt",                        RM_UOM:"KG",   Total_Qty:29.025,     Total_Cost:14.5125 },
    { RM_Code:"AUS-DHALL",    RM_Description:"Australia Dhall",             RM_UOM:"KG",   Total_Qty:6,          Total_Cost:11.88 },
    { RM_Code:"CSN-CR",       RM_Description:"Cashew Nut (Crushed) 1KG",    RM_UOM:"KG",   Total_Qty:20,         Total_Cost:0 },
    { RM_Code:"GN",           RM_Description:"Ground Nut",                  RM_UOM:"BAG",  Total_Qty:1,          Total_Cost:0 },
    { RM_Code:"FSS-004",      RM_Description:"Five Spice 300GM",            RM_UOM:"KG",   Total_Qty:15,         Total_Cost:0 },
  ],

  customerSummary: [
    { Customer:"SAJIAN AMBANG SDN BHD",                    Revenue:18022.5,  Purchase_Cost:16897.7139,   Gross_Profit:1124.7861,   Margin_pct:6.2 },
    { Customer:"ORMOND LIFESTYLE SERVICES SDN BHD",        Revenue:822.5,    Purchase_Cost:627.285572,   Gross_Profit:195.214428,  Margin_pct:23.7 },
    { Customer:"KAMPONG KRAVERS (M) SDN BHD",              Revenue:2970.5,   Purchase_Cost:265.842,      Gross_Profit:2704.658,    Margin_pct:91.1 },
    { Customer:"S ONE ONE F&B SDN BHD",                    Revenue:7116,     Purchase_Cost:3214.3204,    Gross_Profit:3901.6796,   Margin_pct:54.8 },
    { Customer:"ACETREND CORPORATION SDN BHD",             Revenue:46,       Purchase_Cost:22,           Gross_Profit:24,          Margin_pct:52.2 },
    { Customer:"SUNTRACO FOOD INDUSTRIES SDN BHD",         Revenue:25000,    Purchase_Cost:22800,        Gross_Profit:2200,        Margin_pct:8.8 },
    { Customer:"OZVENTURES TRADING SDN BHD",               Revenue:1815.5,   Purchase_Cost:892.244,      Gross_Profit:923.256,     Margin_pct:50.9 },
    { Customer:"AN NUR FOOD INDUSTRIES SDN BHD",           Revenue:15595,    Purchase_Cost:12072.008,    Gross_Profit:3522.992,    Margin_pct:22.6 },
    { Customer:"ILHAM INTEGRASI SDN BHD",                  Revenue:1750,     Purchase_Cost:588.3172,     Gross_Profit:1161.6828,   Margin_pct:66.4 },
    { Customer:"MH DELIGHT SDN BHD",                       Revenue:964,      Purchase_Cost:91.168,       Gross_Profit:872.832,     Margin_pct:90.5 },
    { Customer:"RESTORAN INDIA GATE SDN BHD",              Revenue:16752.5,  Purchase_Cost:12301.102,    Gross_Profit:4451.398,    Margin_pct:26.6 },
    { Customer:"Q & A FOOD RESOURCES SDN BHD",             Revenue:26700,    Purchase_Cost:26700,        Gross_Profit:0,           Margin_pct:0 },
    { Customer:"SAUCE EMPIRE MANUFACTURING SDN BHD",       Revenue:23290,    Purchase_Cost:10804.5321,   Gross_Profit:12485.4679,  Margin_pct:53.6 },
    { Customer:"SPICES & SEASONINGS SPECIALITIES SDN BHD", Revenue:28480,    Purchase_Cost:6650.3752,    Gross_Profit:21829.6248,  Margin_pct:76.6 },
    { Customer:"AGRO 19 BERHAD",                           Revenue:68800,    Purchase_Cost:40859.696,    Gross_Profit:27940.304,   Margin_pct:40.6 },
    { Customer:"SPICES & SEASONING SPECIALIST SDN BHD",    Revenue:21360,    Purchase_Cost:4987.7814,    Gross_Profit:16372.2186,  Margin_pct:76.6 },
  ],

  totals: {
    Total_Revenue:        259484.50,
    Total_Purchase_Cost:  159774.385772,
    Total_Gross_Profit:   99710.114228,
    Overall_Margin_pct:   38.4,
    SO_Count:             20,
    RM_Count:             37,
  },

  meta: {
    fileName:    "Final_Without_TG.xlsx",
    updatedAt:   new Date().toISOString(),
    description: "All 20 outstanding SOs as at 20 March 2026",
  }
};

async function seed() {
  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', e => console.error('Redis error:', e.message));
  await redis.connect();
  console.log('Connected to Redis...');

  await redis.set('purchase:raw_materials',   JSON.stringify(DATA.rawMaterials));
  await redis.set('purchase:customer_summary',JSON.stringify(DATA.customerSummary));
  await redis.set('purchase:totals',          JSON.stringify(DATA.totals));
  await redis.set('purchase:meta',            JSON.stringify(DATA.meta));

  console.log('✅ Purchase plan seeded!');
  console.log('   Raw materials: ' + DATA.rawMaterials.length);
  console.log('   Customers:     ' + DATA.customerSummary.length);
  console.log('   Revenue:       RM ' + DATA.totals.Total_Revenue.toLocaleString());
  console.log('   Cost:          RM ' + DATA.totals.Total_Purchase_Cost.toLocaleString());
  console.log('   Gross Profit:  RM ' + DATA.totals.Total_Gross_Profit.toLocaleString());
  console.log('   Margin:        ' + DATA.totals.Overall_Margin_pct + '%');

  await redis.quit();
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });
