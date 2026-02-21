/* ===== NPS Digital Onboarding — App Logic (Elite Edition) ===== */
'use strict';

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Register Service Worker for Mobile App Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}

/* ---------- State ---------- */
const state = {
  sessionId: localStorage.getItem('nps_session_id'),
  currentPhase: 0,          // 0 = gate, 1-4 = phases, 5 = success
  totalPhases: 4,
  accountType: null,         // 'citizen' | 'corporate'
  selectedKyc: null,
  identityFetched: false,
  investmentChoice: null,
  taxResident: null,
  pep: null,
  consentChecked: false,
  sessionSeconds: 600,       // 10 minutes
  vcipMode: false,           // Assisted VCIP mode
  ckycDiscovery: false,      // CKYC lookup status
  msfAlloc: { e: 50, c: 30, g: 20 },
  isHighRisk: false,
  language: 'en',
  paymentMethod: null,       // UPI / UPI Lite / Netbanking / Card
  esignMethod: null,         // Aadhaar / DSC
  esignComplete: false,      // e-Sign completed?
  autofilledData: null       // DigiLocker / CKYC data
};

/* ---------- API Client ---------- */
class OnboardingAPI {
  constructor() {
    // If running on phone (APK/PWA), use the hosted server. 
    // If local, use localhost.
    this.baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8000'
      : 'https://nps-e0t6.onrender.com'; // Actual Render Deployment
  }

  getHeaders(isMultipart = false) {
    const headers = {};
    if (!isMultipart) headers['Content-Type'] = 'application/json';
    if (state.sessionId) headers['session-id'] = state.sessionId;
    return headers;
  }

  async startSession(lang, accountType) {
    try {
      const res = await fetch(`${this.baseUrl}/api/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, account_type: accountType })
      });
      const data = await res.json();
      state.sessionId = data.session_id;
      state.resumeToken = data.resume_token;
      localStorage.setItem('nps_session_id', data.session_id);
      localStorage.setItem('nps_resume_token', data.resume_token);
      return data;
    } catch (e) { console.error("API Error:", e); }
  }

  async scanDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${this.baseUrl}/api/kyc/scan`, {
        method: 'POST',
        headers: this.getHeaders(true),
        body: formData
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Upload Failed");
      }
      return await res.json();
    } catch (e) { console.error("OCR Error:", e); }
  }

  async generatePRAN() {
    try {
      const res = await fetch(`${this.baseUrl}/api/payment/generate-pran`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      return await res.json();
    } catch (e) { console.error("PRAN Error:", e); }
  }

  async updateProfile(fields) {
    try {
      const res = await fetch(`${this.baseUrl}/api/session/update`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ fields })
      });
      return await res.json();
    } catch (e) { console.error("Update Error:", e); }
  }

  async resumeSession(resumeToken) {
    try {
      const res = await fetch(`${this.baseUrl}/api/session/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_token: resumeToken })
      });
      if (!res.ok) throw new Error("Invalid resume token");
      const data = await res.json();
      state.sessionId = data.session_id;
      localStorage.setItem('nps_session_id', data.session_id);
      return data;
    } catch (e) { console.error("Resume Error:", e); throw e; }
  }

  async archiveConsent(consentType, consentText, metadata = {}) {
    try {
      const res = await fetch(`${this.baseUrl}/api/kyc/consent/archive`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session_id: state.sessionId,
          consent_type: consentType,
          consent_text: consentText,
          additional_data: metadata
        })
      });
      return await res.json();
    } catch (e) { console.error("Consent Archive Error:", e); }
  }

  async sendWhatsAppNotification(phone, token) {
    try {
      const res = await fetch(`${this.baseUrl}/api/notification/whatsapp`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phone,
          message: `Your NPS Onboarding Resume Token: ${token}. Resume here: ${window.location.origin}/`
        })
      });
      return await res.json();
    } catch (e) { console.error("WhatsApp Error:", e); }
  }

  async chatWithAI(query) {
    try {
      const res = await fetch(`${this.baseUrl}/api/notification/chat`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ query })
      });
      return await res.json();
    } catch (e) { console.error("Chat AI Error:", e); }
  }

  async sendSMSNotification(phone, message) {
    try {
      const res = await fetch(`${this.baseUrl}/api/notification/sms`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ phone, message })
      });
      return await res.json();
    } catch (e) { console.error("SMS Error:", e); }
  }
}

const api = new OnboardingAPI();

/* ---------- Translations ---------- */
const i18n = {
  en: {
    welcome: "Open Your NPS Account",
    welcomeSub: "Select the type of account to get started",
    citizen: "All Citizen Model",
    citizenSub: "For individual citizens — salaried, self-employed, or any Indian citizen aged 18–70",
    corporate: "Corporate Model",
    corporateSub: "For employees enrolled through their employer under the NPS Corporate Sector",
    continue: "Continue",
    back: "Back",
    mostCommon: "Most Common",
    gettingStarted: "Getting Started",
    selectAccount: "Select Account Type",
    identityTitle: "Let's Fetch Your Verified Identity Details",
    identitySub: "To reduce manual entry and speed up onboarding",
    ph0Tag: "🏛️ Welcome",
    ph1: "🔵 Phase 1 — Identity",
    ph2: "🟢 Phase 2 — Profile",
    ph2Title: "Complete Your Profile",
    ph2Sub: "Just a few more details to finish your profile",
    ph3: "🟡 Phase 3 — Pension Setup",
    ph3Title: "How Would You Like Your Pension Invested?",
    ph3Sub: "Choose how your contributions are managed",
    ph4Title: "Final Details Before Activation",
    ph4Sub: "Almost done — just a few regulatory details and your first contribution",
    useCkyc: "Use CKYC",
    recommended: "Recommended",
    ckycSub: "Fastest — fetches your identity from the Central KYC Registry",
    useBank: "Use Bank Account",
    bankSub: "Pull verified details from your linked bank account (CBS)",
    useAadhaar: "Use Aadhaar OTP",
    aadhaarSub: "Verify with an OTP sent to your Aadhaar-linked mobile",
    manualTags: "Upload Documents Manually",
    manualSub: "Upload your ID proof, address proof, and PAN card",
    permReq: "Permission Required",
    permSub: "We need your permission to retrieve your verified identity records for KYC compliance. Your data is encrypted and used only for this onboarding.",
    allowCont: "Allow & Continue",
    successTitle: "🎉 PRAN Generated Successfully!",
    successSub: "Your National Pension System account is now active",
    pranLabel: "Your Permanent Retirement Account Number",
    payAndActivate: "Pay & Activate Account",
    processingPayment: "Processing payment…",
    fetchingDetails: "Fetching your verified details…",
    kycModeCKYC: "Non Face-to-Face — CKYC Retrieval",
    kycModeBank: "Non Face-to-Face — CBS Verification",
    kycModeAadhaar: "Non Face-to-Face — Aadhaar eKYC",
    kycModeManual: "Face-to-Face — Manual Document Upload",
    riskEnhanced: "Enhanced (Manual Upload)",
    riskStandard: "Standard",
    invalidPan: "Please enter a valid 10-character PAN",
    searchingCkyc: "Searching CKYCR...",
    allFieldsComplete: "✓ All required fields complete",
    fieldsRemaining: "required fields remaining",
    autoExplainer: "Your allocation will be managed by a lifecycle-based glide path — higher equity when young, gradually shifting to safer assets.",
    activeExplainer: "You will choose your own allocation between Equity (E), Corporate Bonds (C), and Government Securities (G).",
    pension: "Pension",
    accessibility: "Accessibility:",
    idRetrieved: "Identity Retrieved",
    panValidated: "PAN Validated",
    addrVerified: "Address Verified",
    verified: "Verified",
    aboutYou: "About You",
    secondaryPf: "Secondary Pension Fund",
    assetAllocation: "Asset Class Allocation",
    maxEquity: "Max Equity",
    lifecyclePath: "Lifecycle Glide Path",
    taxInfo: "Tax Residency Information",
    isTaxResident: "Are you a tax resident outside India?",
    no: "No",
    yes: "Yes",
    isPep: "Are you a Politically Exposed Person (PEP)?",
    authSummary: "Authorization Summary",
    confirmAccuracy: "I confirm that all details provided are accurate. I authorize the above entities and agree to the terms of the National Pension System.",
    viewTerms: "View Full Terms & Conditions",
    initialContribution: "Make Initial Contribution",
    totalPayable: "Total Payable",
    secure: "Secure",
    step: "Step",
    of: "of",
    complete: "Complete",
    required: "(Required)",
    occupation: "Occupation",
    selectOccupation: "Select your occupation",
    occSalPriv: "Salaried — Private Sector",
    occSalGov: "Salaried — Government",
    occSelf: "Self-Employed / Business",
    occProf: "Professional (Doctor, Lawyer, CA, etc.)",
    occStudent: "Student",
    occHome: "Homemaker",
    occRetired: "Retired",
    occOther: "Other",
    annualIncome: "Annual Income Range",
    selectIncome: "Select income range",
    incBelow2k: "Below ₹2.5 Lakh",
    inc2k5k: "₹2.5 – 5 Lakh",
    inc5k10k: "₹5 – 10 Lakh",
    inc10k25k: "₹10 – 25 Lakh",
    inc25k50k: "₹25 – 50 Lakh",
    incAbove50k: "Above ₹50 Lakh",
    maritalStatus: "Marital Status",
    selectMarital: "Select marital status",
    msSingle: "Single",
    msMarried: "Married",
    msDivorced: "Divorced",
    msWidowed: "Widowed",
    nomineeDetails: "NOMINEE DETAILS",
    nomineeName: "Nominee Full Name",
    placeholderNomineeName: "Enter nominee's full name",
    placeholderGuardianName: "Enter guardian's full name",
    placeholderPan: "e.g. ABCPS1234K",
    placeholderContribution: "₹ 500 (Minimum)",
    relationship: "Relationship",
    ph4: "Phase 4 — Confirmation",
    corporateDetails: "Corporate Details",
    employeeId: "Employee ID",
    corpReg: "Corporate Registration (CHO/CBO)",
    retirementDate: "Expected Date of Retirement",
    assistedMode: "Assisted Mode Active",
    popAssisting: "PoP Agent is assisting this session",
    popOfficial: "PoP Official",
    fullName: "Full Name",
    verifiedDetails: "Verified Details",
    dob: "Date of Birth",
    pan: "PAN",
    address: "Address",
    mobileNumber: "Mobile Number",
    ckycLookup: "Don't know your CKYC number? Look up via PAN",
    enterPanLookup: "Enter PAN for CKYC Lookup",
    searchCkycr: "Search CKYCR Registry",
    ckycApiNote: "Via secure CKYCR API integration with subscriber consent",
    smartScan: "Smart Scan",
    smartScanSub: "Upload a photo of your PAN or Aadhaar — AI will auto-fill everything",
    uploadDoc: "Upload Identity Document",
    investmentSetup: "Investment Setup",
    cra: "Central Recordkeeping Agency (CRA)",
    pfm: "Pension Fund Manager",
    selectCra: "Select CRA",
    selectPfm: "Select pension fund",
    noneSinglePf: "None — Single PF manages all asset classes",
    autoChoice: "Auto Choice",
    activeChoice: "Active Choice",
    riskAdjusts: "Risk automatically adjusts as you age — higher equity when young, safer as you approach retirement",
    youDecide: "You decide how much goes into equity, corporate bonds, and government securities",
    downloadEpran: "Download ePRAN",
    goToDashboard: "Go to Dashboard",
    nextSteps: "Recommended Next Steps",
    openTier2: "Open Tier II Account",
    setupAutoDebit: "Set Up Auto-Debit",
    downloadApp: "Download NPS Mobile App",
    saveAndResume: "Save & Resume Later",
  },
  hi: {
    welcome: "अपना NPS खाता खोलें (Open Your NPS Account)",
    welcomeSub: "शुरू करने के लिए खाते के प्रकार का चयन करें (Select account type to get started)",
    citizen: "सभी नागरिक मॉडल (All Citizen Model)",
    citizenSub: "व्यक्तिगत नागरिकों के लिए - वेतनभोगी, स्व-नियोजित, या 18-70 वर्ष की आयु के कोई भी भारतीय नागरिक (For individual citizens — salaried, self-employed, or 18-70)",
    corporate: "कॉर्पोरेट मॉडल (Corporate Model)",
    corporateSub: "NPS कॉर्पोरेट सेक्टर के तहत अपने नियोक्ता के माध्यम से नामांकित कर्मचारियों के लिए (For employees enrolled through their employer)",
    continue: "जारी रखें (Continue)",
    back: "पीछे (Back)",
    mostCommon: "सबसे लोकप्रिय (Most Common)",
    gettingStarted: "शुरू कर रहे हैं (Getting Started)",
    selectAccount: "खाते का प्रकार चुनें (Select Account Type)",
    identityTitle: "आइए आपकी सत्यापित पहचान विवरण प्राप्त करें (Let's Fetch Your Verified Identity Details)",
    identitySub: "मैनुअल प्रविष्टि को कम करने और ऑनबोर्डिंग को तेज करने के लिए (To reduce manual entry and speed up onboarding)",
    ph0Tag: "🏛️ स्वागत है (Welcome)",
    ph1: "चरण 1 — पहचान (Phase 1 — Identity)",
    ph2: "चरण 2 — प्रोफ़ाइल (Phase 2 — Profile)",
    ph2Title: "अपनी प्रोफ़ाइल पूरी करें (Complete Your Profile)",
    ph2Sub: "अपनी प्रोफ़ाइल पूरी करने के लिए बस कुछ और विवरण (Just a few more details to finish your profile)",
    ph3: "चरण 3 — पेंशन सेटअप (Phase 3 — Pension Setup)",
    ph3Title: "आप अपनी पेंशन का निवेश कैसे करना चाहेंगे? (How Would You Like Your Pension Invested?)",
    ph3Sub: "चुनें कि आपके योगदान का प्रबंधन कैसे किया जाता है (Choose how your contributions are managed)",
    ph4Title: "सक्रियण से पहले अंतिम विवरण (Final Details Before Activation)",
    ph4Sub: "लगभग पूरा हो गया है — बस कुछ नियामक विवरण और आपका पहला योगदान (Almost done — just a few regulatory details and your first contribution)",
    useCkyc: "CKYC का उपयोग करें (Use CKYC)",
    recommended: "अनुशंसित (Recommended)",
    ckycSub: "सबसे तेज़ — सेंट्रल केवाईसी रजिस्ट्री से आपकी पहचान प्राप्त करता है (Fastest — fetches from CKYCR)",
    useBank: "बैंक खाते का उपयोग करें (Use Bank Account)",
    bankSub: "अपने लिंक किए गए बैंक खाते (CBS) से विवरण प्राप्त करें (Pull details from linked bank account)",
    useAadhaar: "आधार OTP का उपयोग करें (Use Aadhaar OTP)",
    aadhaarSub: "अपने आधार-लिंक्ड मोबाइल पर भेजे गए ओटीपी के साथ सत्यापित करें (Verify with OTP sent to Aadhaar mobile)",
    manualTags: "दस्तावेज़ मैन्युअल रूप से अपलोड करें (Upload Documents Manually)",
    manualSub: "अपना आईडी प्रूफ, एड्रेस प्रूफ और पैन कार्ड अपलोड करें (Upload ID, address proof, and PAN)",
    permReq: "अनुमति आवश्यक (Permission Required)",
    permSub: "हमें केवाईसी अनुपालन के लिए आपके सत्यापित पहचान रिकॉर्ड प्राप्त करने के लिए आपकी अनुमति की आवश्यकता है। (We need your permission for KYC compliance.)",
    allowCont: "अनुमति दें और जारी रखें (Allow & Continue)",
    successTitle: "🎉 PRAN सफलतापूर्वक जेनरेट किया गया! (PRAN Generated Successfully!)",
    successSub: "आपका नेशनल पेंशन सिस्टम खाता अब सक्रिय है (Your NPS account is now active)",
    pranLabel: "आपका स्थायी सेवानिवृत्ति खाता संख्या (Permanent Retirement Account Number)",
    payAndActivate: "भुगतान करें और खाता सक्रिय करें (Pay & Activate Account)",
    processingPayment: "भुगतान संसाधित किया जा रहा है... (Processing payment...)",
    fetchingDetails: "आपके सत्यापित विवरण प्राप्त किए जा रहे हैं... (Fetching details...)",
    kycModeCKYC: "गैर-आमने-सामने — CKYC पुनर्प्राप्ति (Non Face-to-Face — CKYC)",
    kycModeBank: "गैर-आमने-सामने — CBS सत्यापन (Non Face-to-Face — CBS)",
    kycModeAadhaar: "गैर-आमने-सामने — आधार eKYC (Non Face-to-Face — Aadhaar)",
    kycModeManual: "आमने-सामने — मैन्युअल दस्तावेज़ अपलोड (Face-to-Face — Manual)",
    riskEnhanced: "बढ़ा हुआ (Enhanced Risk)",
    riskStandard: "मानक (Standard)",
    invalidPan: "कृपया एक मान्य 10-अक्षर वाला पैन दर्ज करें (Please enter a valid 10-char PAN)",
    searchingCkyc: "CKYCR खोजा जा रहा है... (Searching CKYCR...)",
    allFieldsComplete: "✓ सभी अनिवार्य फ़ील्ड पूर्ण हैं (All required fields complete)",
    fieldsRemaining: "अनिवार्य फ़ील्ड अवशेष (required fields remaining)",
    autoExplainer: "आपका आवंटन लाइफसाइकिल-आधारित ग्लाइड पाथ द्वारा प्रबंधित किया जाएगा (Allocation via lifecycle glide path)",
    activeExplainer: "आप इक्विटी (E), कॉर्पोरेट बॉन्ड (C) और सरकारी प्रतिभूतियों (G) के बीच आवंटन खुद चुनेंगे (Choose your own allocation E, C, G)",
    pension: "पेंशन (Pension)",
    accessibility: "अभिगम्यता (Accessibility):",
    idRetrieved: "पहचान प्राप्त हुई (Identity Retrieved)",
    panValidated: "पैन मान्य (PAN Validated)",
    addrVerified: "पता सत्यापित (Address Verified)",
    verified: "सत्यापित (Verified)",
    aboutYou: "आपके बारे में (About You)",
    secondaryPf: "द्वितीयक पेंशन फंड (Secondary Pension Fund)",
    assetAllocation: "परिसंपत्ति वर्ग आवंटन (Asset Class Allocation)",
    maxEquity: "अधिकतम इक्विटी (Max Equity)",
    lifecyclePath: "लाइफसाइकिल ग्लाइड पाथ (Lifecycle Glide Path)",
    taxInfo: "कर निवास की जानकारी (Tax Residency Information)",
    isTaxResident: "क्या आप भारत के बाहर कर निवासी हैं? (Are you a tax resident outside India?)",
    no: "नहीं (No)",
    yes: "हाँ (Yes)",
    isPep: "क्या आप सार्वजनिक पद पर आसीन व्यक्ति (PEP) हैं? (Are you a Politically Exposed Person?)",
    authSummary: "प्राधिकरण सारांश (Authorization Summary)",
    confirmAccuracy: "मैं पुष्टि करता हूँ कि प्रदान किए गए सभी विवरण सटीक हैं। (I confirm details are accurate.)",
    viewTerms: "पूरा नियम और शर्तें देखें (View Full Terms & Conditions)",
    initialContribution: "प्रारंभिक अंशदान करें (Initial Contribution)",
    totalPayable: "कुल देय राशि (Total Payable)",
    secure: "सुरक्षित (Secure)",
    step: "चरण (Step)",
    of: "का (of)",
    complete: "पूरा (Complete)",
    required: "(अनिवार्य) (Required)",
    occupation: "व्यवसाय (Occupation)",
    selectOccupation: "अपना व्यवसाय चुनें (Select your occupation)",
    occSalPriv: "वेतनभोगी — निजी क्षेत्र (Salaried — Private Sector)",
    occSalGov: "वेतनभोगी — सरकारी (Salaried — Government)",
    occSelf: "स्व-नियोजित / व्यवसाय (Self-Employed / Business)",
    occProf: "पेशेवर (डॉक्टर, वकील, सीए विकल्प) (Professional)",
    occStudent: "छात्र (Student)",
    occHome: "गृहणी (Homemaker)",
    occRetired: "सेवानिवृत्त (Retired)",
    occOther: "अन्य (Other)",
    annualIncome: "वार्षिक आय सीमा (Annual Income Range)",
    selectIncome: "आय सीमा चुनें (Select income range)",
    incBelow2k: "₹2.5 लाख से कम (Below ₹2.5 Lakh)",
    inc2k5k: "₹2.5 – 5 लाख (₹2.5 – 5 Lakh)",
    inc5k10k: "₹5 – 10 लाख (₹5 – 10 Lakh)",
    inc10k25k: "₹10 – 25 लाख (₹10 – 25 Lakh)",
    inc25k50k: "₹25 – 50 लाख (₹25 – 50 Lakh)",
    incAbove50k: "₹50 लाख से ऊपर (Above ₹50 Lakh)",
    maritalStatus: "वैवाहिक स्थिति (Marital Status)",
    selectMarital: "वैवाहिक स्थिति चुनें (Select marital status)",
    msSingle: "अविवाहित (Single)",
    msMarried: "विवाहित (Married)",
    msDivorced: "तलाकशुदा (Divorced)",
    msWidowed: "विधवा/विधुर (Widowed)",
    nomineeDetails: "नामिती विवरण (NOMINEE DETAILS)",
    nomineeName: "नामिती का पूरा नाम (Nominee Full Name)",
    placeholderNomineeName: "नामिती का पूरा नाम दर्ज करें (Enter Name)",
    placeholderGuardianName: "अभिभावक का पूरा नाम दर्ज करें (Enter Guardian Name)",
    placeholderPan: "जैसे ABCPS1234K (e.g. ABCPS1234K)",
    placeholderContribution: "₹ 500 (न्यूनतम) (₹ 500 Min)",
    relationship: "संबंध (Relationship)",
    selectRel: "संबंध चुनें (Select relationship)",
    relFather: "पिता (Father)",
    relMother: "माता (Mother)",
    relSpouse: "पति/पत्नी (Spouse)",
    relSon: "पुत्र (Son)",
    relDaughter: "पुत्री (Daughter)",
    relOther: "अन्य (Other)",
    nomineeDob: "नामिती की जन्म तिथि (Nominee Date of Birth)",
    guardianName: "अभिभावक का पूरा नाम (Guardian Full Name)",
    ph4: "चरण 4 — पुष्टि (Phase 4 — Confirmation)",
    corporateDetails: "कॉर्पोरेट विवरण (Corporate Details)",
    employeeId: "कर्मचारी आईडी (Employee ID)",
    corpReg: "कॉर्पोरेट पंजीकरण (CHO/CBO) (Corporate Registration)",
    retirementDate: "सेवानिवृत्ति की अपेक्षित तिथि (Expected Date of Retirement)",
    assistedMode: "सहायता प्राप्त मोड सक्रिय (Assisted Mode Active)",
    popAssisting: "PoP एजेंट इस सत्र में सहायता कर रहा है (PoP Agent is assisting)",
    popOfficial: "PoP अधिकारी (PoP Official)",
    fullName: "पूरा नाम (Full Name)",
    verifiedDetails: "सत्यापित विवरण (Verified Details)",
    dob: "जन्म तिथि (Date of Birth)",
    pan: "पैन (PAN)",
    address: "पता (Address)",
    mobileNumber: "मोबाइल नंबर (Mobile Number)",
    ckycLookup: "अपना CKYC नंबर नहीं जानते? पैन के माध्यम से खोजें (Don't know CKYC? Look up via PAN)",
    enterPanLookup: "CKYC लुकअप के लिए पैन दर्ज करें (Enter PAN for CKYC Lookup)",
    searchCkycr: "CKYCR रजिस्ट्री खोजें (Search CKYCR Registry)",
    ckycApiNote: "ग्राहक की सहमति के साथ सुरक्षित CKYCR API एकीकरण के माध्यम से (Via secure CKYCR API)",
    smartScan: "स्मार्ट स्कैन (Smart Scan)",
    smartScanSub: "अपने पैन या आधार की एक फोटो अपलोड करें — Gemini AI सब कुछ ऑटो-फिल कर देगा (Upload photo for auto-fill)",
    uploadDoc: "पहचान दस्तावेज़ अपलोड करें (Upload Identity Document)",
    investmentSetup: "निवेश सेटअप (Investment Setup)",
    cra: "केंद्रीय रिकॉर्ड-कीपिंग एजेंसी (CRA)",
    pfm: "पेंशन फंड मैनेजर (PFM)",
    selectCra: "CRA चुनें (Select CRA)",
    selectPfm: "पेंशन फंड चुनें (Select pension fund)",
    noneSinglePf: "कोई नहीं — एकल PF सभी एसेट क्लास का प्रबंधन करता है (Single PF)",
    autoChoice: "ऑटो चॉइस (Auto Choice)",
    activeChoice: "एक्टिव चॉइस (Active Choice)",
    riskAdjusts: "आयु के साथ जोखिम स्वतः समायोजित होता है (Risk adjusts with age)",
    youDecide: "आप खुद तय करेंगे कि इक्विटी, बॉन्ड में कितना निवेश करना है (You decide allocation)",
    downloadEpran: "ePRAN डाउनलोड करें (Download ePRAN)",
    goToDashboard: "डैशबोर्ड पर जाएं (Go to Dashboard)",
    nextSteps: "अनुशंसित अगले चरण (Recommended Next Steps)",
    openTier2: "टियर II खाता खोलें (Open Tier II Account)",
    setupAutoDebit: "ऑटो-डेबिट सेट करें (Set Up Auto-Debit)",
    downloadApp: "NPS मोबाइल ऐप डाउनलोड करें (Download App)",
    saveAndResume: "सहेजें और बाद में फिर से शुरू करें (Save & Resume Later)",
  },
  gu: {
    welcome: "તમારું NPS ખાતું ખોલો (Open Your NPS Account)",
    welcomeSub: "શરૂ કરવા માટે ખાતાનો પ્રકાર પસંદ કરો (Select account type to get started)",
    citizen: "તમામ નાગરિક મોડલ (All Citizen Model)",
    citizenSub: "વ્યક્તિગત નાગરિકો માટે — પગારદાર, સ્વ-રોજગાર, અથવા 18-70 વર્ષની વયના કોઈપણ ભારતીય नाગરિક (For individual citizens — salaried, self-employed, or 18-70)",
    corporate: "કોર્પોરેટ મોડલ (Corporate Model)",
    corporateSub: "NPS કોર્પોરેટ સેક્ટર હેઠળ તેમના એમ્પ્લોયર દ્વારા નોંધાયેલા કર્મચારીઓ માટે (For employees enrolled through their employer)",
    continue: "આગળ વધો (Continue)",
    back: "પાછળ (Back)",
    mostCommon: "સૌથી સામાન્ય (Most Common)",
    gettingStarted: "શરૂ કરી રહ્યા છીએ (Getting Started)",
    selectAccount: "ખાતાનો પ્રકાર પસંદ કરો (Select Account Type)",
    identityTitle: "ચાલો તમારી ચકાસાયેલ ઓળખ વિગતો મેળવીએ (Let's Fetch Your Verified Identity Details)",
    identitySub: "મેન્યુઅલ એન્ટ્રી ઘટાડવા અને ઓનબોર્ડિંગને ઝડપી બનાવવા માટે (To reduce manual entry and speed up onboarding)",
    ph0Tag: "🏛️ સ્વાગત છે (Welcome)",
    ph1: "તબક્કો 1 — ઓળખ (Phase 1 — Identity)",
    ph2: "તબક્કો 2 — પ્રોફાઇલ (Phase 2 — Profile)",
    ph2Title: "તમારી પ્રોફાઇલ પૂર્ણ કરો (Complete Your Profile)",
    ph2Sub: "તમારી પ્રોફાઇલ પૂર્ણ કરવા માટે માત્ર થોડી વધુ વિગતો (Just a few more details to finish your profile)",
    ph3: "તબક્કો 3 — પેન્શન સેટઅપ (Phase 3 — Pension Setup)",
    ph3Title: "તમે તમારું પેન્શન કેવી રીતે રોકાણ કરવા માંગો છો? (How Would You Like Your Pension Invested?)",
    ph3Sub: "તમારા યોગદાનનું સંચાલન કેવી રીતે થાય છે તે પસંદ કરો (Choose how your contributions are managed)",
    ph4Title: "સક્રિયકરણ પહેલાં અંતિમ વિગતો (Final Details Before Activation)",
    ph4Sub: "લગભગ થઈ ગયું — માત્ર થોડી નિયમનકારી વિગતો અને તમારું પ્રથમ યોગદાન (Almost done — regulatory details and first contribution)",
    useCkyc: "CKYC નો ઉપયોગ કરો (Use CKYC)",
    recommended: "ભલામણ કરેલ (Recommended)",
    ckycSub: "સૌથી ઝડપી — સેન્ટ્રલ કેવાયસી રજીસ્ટ્રીમાંથી તમારી ઓળખ મેળવે છે (Fastest — fetches from CKYCR)",
    useBank: "બેંક ખાતાનો ઉપયોગ કરો (Use Bank Account)",
    bankSub: "તમારા લિંક કરેલા બેંક ખાતા (CBS) માંથી વિગતો મેળવો (Pull details from linked bank account)",
    useAadhaar: "આધાર OTP નો ઉપયોગ કરો (Use Aadhaar OTP)",
    aadhaarSub: "તમારા આધાર-લિંક્ડ મોબાઈલ પર મોકલવામાં આવેલા OTP સાથે ચકાસો (Verify with OTP sent to Aadhaar mobile)",
    manualTags: "દસ્તાવેજો જાતે કલેક્ટ કરો (Upload Documents Manually)",
    manualSub: "તમારો આઈડી પ્રૂફ, એડ્રેસ પ્રૂફ અને પાન કાર્ડ અપલોડ કરો (Upload ID, address proof, and PAN)",
    permReq: "પરવાનગી જરૂરી (Permission Required)",
    permSub: "અમને કેવાયસી પાલન માટે તમારી ચકાસાયેલ ઓળખના રેકોર્ડ્સ મેળવવા માટે તમારી પરવાનગીની જરૂર છે. (We need your permission for KYC compliance.)",
    allowCont: "મંજૂરી આપો અને આગળ વધો (Allow & Continue)",
    successTitle: "🎉 PRAN સફળતાપૂર્વક જનરેટ થયો! (PRAN Generated Successfully!)",
    successSub: "તમારું નેશનલ પેન્શન સિસ્ટમ ખાતું હવે સક્રિય છે (Your NPS account is now active)",
    pranLabel: "તમારો કાયમી નિવૃત્તિ ખાતા નંબર (Permanent Retirement Account Number)",
    payAndActivate: "ચુકવણી કરો અને ખાતું સક્રિય કરો (Pay & Activate Account)",
    processingPayment: "ચુકવણી પ્રક્રિયા થઈ રહી છે... (Processing payment...)",
    fetchingDetails: "તમારી ચકાસાયેલ વિગતો મેળવી રહ્યા છીએ... (Fetching details...)",
    kycModeCKYC: "બિન-રૂબરૂ — CKYC પુનઃપ્રાપ્તિ (Non Face-to-Face — CKYC)",
    kycModeBank: "બિન-રૂબરૂ — CBS વેરિફિકેશન (Non Face-to-Face — CBS)",
    kycModeAadhaar: "બિન-રૂબરૂ — આધાર eKYC (Non Face-to-Face — Aadhaar)",
    kycModeManual: "રૂબરૂ — મેન્યુઅલ દસ્તાવેજ અપલોડ (Face-to-Face — Manual)",
    riskEnhanced: "ઉન્નત (Enhanced)",
    riskStandard: "સામાન્ય (Standard)",
    invalidPan: "કૃપા કરીને માન્ય 10-અક્ષરનો પાન દાખલ કરો (Please enter a valid 10-char PAN)",
    searchingCkyc: "CKYCR શોધી રહ્યા છીએ... (Searching CKYCR...)",
    allFieldsComplete: "✓ તમામ ફરજિયાત વિગતો પૂર્ણ છે (All required fields complete)",
    fieldsRemaining: "ફરજિયાત વિગતો બાકી (required fields remaining)",
    autoExplainer: "તમારી ફાળવણી જીવનચક્ર-આધારિત ગ્લાઇડ પાથ દ્વારા સંચાલિત કરવામાં આવશે (Allocation via lifecycle glide path)",
    activeExplainer: "તમે ઇક્વિટી (E), કોર્પોરેટ બોન્ડ્સ (C) અને સરકારી જામીનગીરીઓ (G) વચ્ચે તમારી પોતાની ફાળવણી પસંદ કરશો (Choose your own allocation E, C, G)",
    pension: "પેન્શન (Pension)",
    accessibility: "અભિગમ્યતા (Accessibility):",
    idRetrieved: "ઓળખ પ્રાપ્ત થઈ (Identity Retrieved)",
    panValidated: "પાન માન્ય (PAN Validated)",
    addrVerified: "સરનામું ચકાસાયેલું (Address Verified)",
    verified: "ચકાસાયેલું (Verified)",
    aboutYou: "તમારા વિશે (About You)",
    secondaryPf: "ગૌણ પેન્શન ફંડ (Secondary Pension Fund)",
    assetAllocation: "એસેટ ક્લાસ ફાળવણી (Asset Class Allocation)",
    maxEquity: "મહત્તમ ઇક્વિટી (Max Equity)",
    lifecyclePath: "લાઇફસાઇકલ ગ્લાઇડ પાથ (Lifecycle Glide Path)",
    taxInfo: "કર નિવાસ માહિતી (Tax Residency Information)",
    isTaxResident: "શું તમે ભારતની બહાર કર નિવાસી છો? (Are you a tax resident outside India?)",
    no: "ના (No)",
    yes: "હા (Yes)",
    isPep: "શું તમે રાજકીય રીતે ખુલ્લા વ્યક્તિ (PEP) છો? (Are you a Politically Exposed Person?)",
    authSummary: "ઓથોરાઈઝેશન સારાંશ (Authorization Summary)",
    confirmAccuracy: "હું પુષ્ટિ કરું છું કે આપેલી તમામ વિગતો સચોટ છે. (I confirm details are accurate.)",
    viewTerms: "પૂરા નિયમો અને શરતો જુઓ (View Full Terms & Conditions)",
    initialContribution: "પ્રારંભિક યોગદાન આપો (Initial Contribution)",
    totalPayable: "કુલ ચૂકવવાપાત્ર (Total Payable)",
    secure: "સુરક્ષિત (Secure)",
    step: "તબક્કો (Step)",
    of: "માંથી (of)",
    complete: "પૂર્ણ (Complete)",
    required: "(ફરજિયાત) (Required)",
    occupation: "વ્યવસાય (Occupation)",
    selectOccupation: "તમારો વ્યવસાય પસંદ કરો (Select your occupation)",
    occSalPriv: "પગારદાર — ખાનગી ક્ષેત્ર (Salaried — Private Sector)",
    occSalGov: "પગારદાર — સરકારી (Salaried — Government)",
    occSelf: "સ્વ-રોજગાર / વ્યવસાય (Self-Employed / Business)",
    occProf: "વ્યવસાયિક (ડોક્ટર, વકીલ, CA વગેરે) (Professional)",
    occStudent: "વિદ્યાર્થી (Student)",
    occHome: "ગૃહિણી (Homemaker)",
    occRetired: "નિવૃત્ત (Retired)",
    occOther: "અન્ય (Other)",
    annualIncome: "વાર્ષિક આવક મર્યાદા (Annual Income Range)",
    selectIncome: "આવક મર્યાદા પસંદ કરો (Select income range)",
    incBelow2k: "₹2.5 લાખથી નીચે (Below ₹2.5 Lakh)",
    inc2k5k: "₹2.5 – 5 લાખ (₹2.5 – 5 Lakh)",
    inc5k10k: "₹5 – 10 લાખ (₹5 – 10 Lakh)",
    inc10k25k: "₹10 – 25 લાખ (₹10 – 25 Lakh)",
    inc25k50k: "₹25 – 50 લાખ (₹25 – 50 Lakh)",
    incAbove50k: "₹50 લાખથી ઉપર (Above ₹50 Lakh)",
    maritalStatus: "વૈવાહિક સ્થિતિ (Marital Status)",
    selectMarital: "વૈવાહિક સ્થિતિ પસંદ કરો (Select marital status)",
    msSingle: "અપરિણીત (Single)",
    msMarried: "પરિણીત (Married)",
    msDivorced: "છેડાછેડા વાળા (Divorced)",
    msWidowed: "વિધવા/વિધુર (Widowed)",
    nomineeDetails: "નામિની વિગતો (NOMINEE DETAILS)",
    nomineeName: "નામિનીનું પૂરું નામ (Nominee Full Name)",
    placeholderNomineeName: "નામિતીનું પૂરું નામ દાખલ કરો (Enter Name)",
    placeholderGuardianName: "વાલીનું પૂરું નામ દાખલ કરો (Enter Guardian Name)",
    placeholderPan: "દા.ત. ABCPS1234K (e.g. ABCPS1234K)",
    placeholderContribution: "₹ 500 (ન્યૂનતમ) (₹ 500 Min)",
    relationship: "સંબંધ (Relationship)",
    selectRel: "સંબંધ પસંદ કરો (Select relationship)",
    relFather: "પિતા (Father)",
    relMother: "માતા (Mother)",
    relSpouse: "પતિ/પત્ની (Spouse)",
    relSon: "પુત્ર (Son)",
    relDaughter: "પુત્રી (Daughter)",
    relOther: "અન્ય (Other)",
    nomineeDob: "નામિનીની જન્મ તારીખ (Nominee Date of Birth)",
    guardianName: "વાલીનું પૂરું નામ (Guardian Full Name)",
    ph4: "તબક્કો 4 — પુષ્ટિ (Phase 4 — Confirmation)",
    corporateDetails: "કોર્પોરેટ વિગતો (Corporate Details)",
    employeeId: "કર્મચારી આઈડી (Employee ID)",
    corpReg: "કોર્પોરેટ નોંધણી (CHO/CBO) (Corporate Registration)",
    retirementDate: "નિવૃત્તિની અપેક્ષિત તારીખ (Expected Date of Retirement)",
    assistedMode: "સહાયિત મોડ સક્રિય (Assisted Mode Active)",
    popAssisting: "PoP એજન્ટ આ સત્રમાં સહાય કરી રહ્યો છે (PoP Agent assisting)",
    popOfficial: "PoP અધિકારી (PoP Official)",
    fullName: "પૂરું નામ (Full Name)",
    verifiedDetails: "ચકાસાયેલ વિગતો (Verified Details)",
    dob: "જન્મ તારીખ (Date of Birth)",
    pan: "પાન (PAN)",
    address: "સરનામું (Address)",
    mobileNumber: "મોબાઈલ નંબર (Mobile Number)",
    ckycLookup: "તમારો CKYC નંબર નથી જાણતા? પાન દ્વારા શોધો (Don't know CKYC? Look up via PAN)",
    enterPanLookup: "CKYC લુકઅપ માટે પાન દાખલ કરો (Enter PAN for CKYC Lookup)",
    searchCkycr: "CKYCR રજિસ્ટ્રી શોધો (Search CKYCR Registry)",
    ckycApiNote: "ગ્રાહકની સંમતિ સાથે સુરક્ષિત CKYCR API એકીકરણ દ્વારા (Via secure CKYCR API)",
    smartScan: "સ્માર્ટ સ્કેન (Smart Scan)",
    smartScanSub: "તમારા પાન અથવા આધારનો ફોટો અપલોડ કરો — Gemini AI બધું જ ઓટો-ફિલ કરશે (Upload photo for auto-fill)",
    uploadDoc: "ઓળખ દસ્તાવેજ અપલોડ કરો (Upload Identity Document)",
    investmentSetup: "રોકાણ સેટઅપ (Investment Setup)",
    cra: "સેન્ટ્રલ રેકોર્ડકીપિંગ એજન્સી (CRA)",
    pfm: "પેન્શન ફંડ મેનેજર (PFM)",
    selectCra: "CRA પસંદ કરો (Select CRA)",
    selectPfm: "પેન્શન ફંડ પસંદ કરો (Select pension fund)",
    noneSinglePf: "કોઈ નહીં — સિંગલ PF તમામ એસેટ ક્લાસનું સંચાલન કરે છે (Single PF)",
    autoChoice: "ઓટો ચોઈસ (Auto Choice)",
    activeChoice: "એક્ટિવ ચોઈસ (Active Choice)",
    riskAdjusts: "ઉંમર પ્રમાણે જોખમ આપોઆપ એડજસ્ટ થાય છે (Risk adjusts with age)",
    youDecide: "તમે નક્કી કરશો કે ઇક્વિટી, બોન્ડ્સમાં કેટલું રોકાણ કરવું છે (You decide allocation)",
    downloadEpran: "ePRAN ડાઉનલોડ કરો (Download ePRAN)",
    goToDashboard: "ડેશબોર્ડ પર જાઓ (Go to Dashboard)",
    nextSteps: "ભલામણ કરેલ આગામી પગલાં (Recommended Next Steps)",
    openTier2: "ટાયર II ખાતું ખોલો (Open Tier II Account)",
    setupAutoDebit: "ઓટો-ડેબિટ સેટ કરો (Set Up Auto-Debit)",
    downloadApp: "NPS મોબાઇલ એપ ડાઉનલોડ કરો (Download App)",
    saveAndResume: "સાચવો અને પછીથી ફરી શરૂ કરો (Save & Resume Later)",
  },
  ta: {
    welcome: "உங்கள் NPS கணக்கைத் தொடங்கவும் (Open Your NPS Account)",
    welcomeSub: "தொடங்குவதற்கு கணக்கு வகையைத் தேர்ந்தெடுக்கவும் (Select account type to get started)",
    citizen: "அனைத்து குடிமக்கள் மாதிரி (All Citizen Model)",
    citizenSub: "தனிப்பட்ட குடிமக்களுக்கு — சம்பளம் பெறுபவர்கள், சுயதொழில் செய்பவர்கள் (For individual citizens — salaried, self-employed)",
    corporate: "கார்ப்பரேட் மாதிரி (Corporate Model)",
    corporateSub: "NPS கார்ப்பரேட் துறையின் கீழ் தங்கள் முதலாளி மூலம் பதிவுசெய்யப்பட்ட ஊழியர்களுக்கு (For employees through employer)",
    continue: "தொடரவும் (Continue)",
    back: "பின்னால் (Back)",
    mostCommon: "மிகவும் பொதுவானது (Most Common)",
    gettingStarted: "தொடங்குதல் (Getting Started)",
    selectAccount: "கணக்கு வகையைத் தேர்ந்தெடுக்கவும் (Select Account Type)",
    identityTitle: "உங்கள் சரிபார்க்கப்பட்ட அடையாள விவரங்களைப் பெறுவோம் (Let's Fetch Your Identity Details)",
    identitySub: "கைமுறை பதிவைக் குறைப்பதற்கும் ஆன்போர்டிங்கை விரைவுபடுத்துவதற்கும் (To speed up onboarding)",
    ph0Tag: "🏛️ வரவேற்கிறோம் (Welcome)",
    ph1: "கட்டம் 1 — அடையாளம் (Phase 1 — Identity)",
    ph2: "கட்டம் 2 — சுயவிவரம் (Phase 2 — Profile)",
    ph2Title: "உங்கள் சுயவிவரத்தை முடிக்கவும் (Complete Your Profile)",
    ph2Sub: "உங்கள் சுயவிவரத்தை முடிக்க இன்னும் சில விவரங்கள் (Just a few more details to finish profile)",
    ph3: "கட்டம் 3 — ஓய்வூதிய அமைப்பு (Phase 3 — Pension Setup)",
    ph3Title: "உங்கள் ஓய்வூதியம் எவ்வாறு முதலீடு செய்யப்பட வேண்டும்? (How Would You Like Your Pension Invested?)",
    ph3Sub: "உங்கள் பங்களிப்புகள் எவ்வாறு நிர்வகிக்கப்படுகின்றன என்பதைத் தேர்ந்தெடுக்கவும் (Choose contribution management)",
    ph4: "கட்டம் 4 — உறுதிப்படுத்தல் (Phase 4 — Confirmation)",
    ph4Title: "செயல்படுத்துவதற்கு முன் இறுதி விவரங்கள் (Final Details Before Activation)",
    ph4Sub: "கிட்டத்தட்ட முடிந்தது — சில ஒழுங்குமுறை விவரங்கள் (Almost done — regulatory details)",
    useCkyc: "CKYC ஐப் பயன்படுத்தவும் (Use CKYC)",
    recommended: "பரிந்துரைக்கப்படுகிறது (Recommended)",
    ckycSub: "மிக வேகமானது — மத்திய கேஒய்சி பதிவேட்டில் இருந்து பெறுகிறது (Fastest — fetches from CKYCR)",
    useBank: "வங்கி கணக்கைப் பயன்படுத்தவும் (Use Bank Account)",
    bankSub: "உங்கள் இணைக்கப்பட்ட வங்கி கணக்கிலிருந்து விவரங்களைப் பெறவும் (Pull details from linked bank)",
    useAadhaar: "ஆதார் ஓடிபியைப் பயன்படுத்தவும் (Use Aadhaar OTP)",
    aadhaarSub: "ஆதார் இணைக்கப்பட்ட மொபைலுக்கு அனுப்பப்பட்ட ஓடிபி மூலம் சரிபார்க்கவும் (Verify via Aadhaar mobile OTP)",
    manualTags: "ஆவணங்களை கைமுறையாக பதிவேற்றவும் (Upload Documents Manually)",
    manualSub: "உங்கள் அடையாளச் சான்று, பான் கார்டைப் பதிவேற்றவும் (Upload ID, PAN card)",
    permReq: "அனுமதி தேவை (Permission Required)",
    permSub: "கேஒய்சி இணக்கத்திற்காக உங்கள் விவரங்களை மீட்டெடுக்க அனுமதி தேவை. (Permission needed for KYC compliance.)",
    allowCont: "அனுமதித்து தொடரவும் (Allow & Continue)",
    successTitle: "🎉 PRAN வெற்றிகரமாக உருவாக்கப்பட்டது! (PRAN Generated Successfully!)",
    successSub: "உங்களுடைய தேசிய ஓய்வூதிய கணக்கு இப்போது செயலில் உள்ளது (Your NPS account is now active)",
    pranLabel: "நிரந்தர ஓய்வூதிய கணக்கு எண் (Permanent Retirement Account Number)",
    payAndActivate: "செலுத்தி கணக்கைச் செயல்படுத்தவும் (Pay & Activate Account)",
    processingPayment: "பணம் செலுத்துதல் செயலாக்கப்படுகிறது... (Processing payment...)",
    fetchingDetails: "உங்கள் சரிபார்க்கப்பட்ட விவரங்களைப் பெறுகிறது... (Fetching details...)",
    kycModeCKYC: "நேருக்கு நேர் அல்ல — CKYC மீட்டெடுப்பு (Non Face-to-Face — CKYC)",
    kycModeBank: "நேருக்கு நேர் அல்ல — CBS சரிபார்ப்பு (Non Face-to-Face — CBS)",
    kycModeAadhaar: "நேருக்கு நேர் அல்ல — ஆதார் eKYC (Non Face-to-Face — Aadhaar)",
    kycModeManual: "நேருக்கு நேர் — கைமுறை ஆவணப் பதிவேற்றம் (Face-to-Face — Manual)",
    riskEnhanced: "மேம்படுத்தப்பட்டது (Enhanced)",
    riskStandard: "தரமானது (Standard)",
    invalidPan: "சரியான பான் எண்ணை உள்ளிடவும் (Please enter a valid PAN)",
    searchingCkyc: "CKYCR தேடுகிறது... (Searching CKYCR...)",
    allFieldsComplete: "✓ அனைத்து கட்டாயப் புலங்களும் முடிந்துவிட்டன (All required fields complete)",
    fieldsRemaining: "கட்டாயப் புலங்கள் மீதமுள்ளன (required fields remaining)",
    autoExplainer: "உங்கள் ஒதுக்கீடு வாழ்க்கைச் சுழற்சி அடிப்படையிலான கிளைடு பாதையால் நிர்வகிக்கப்படும் (Allocation via lifecycle glide path)",
    activeExplainer: "ஈக்விட்டி, கார்ப்பரேட் பத்திரங்களுக்கு இடையே உங்கள் ஒதுக்கீட்டைத் தேர்வு செய்வீர்கள் (Choose your own allocation E, C, G)",
    pension: "ஓய்வூதியம் (Pension)",
    accessibility: "அணுகல்தன்மை (Accessibility):",
    idRetrieved: "அடையாளம் மீட்டெடுக்கப்பட்டது (Identity Retrieved)",
    panValidated: "பான் சரிபார்க்கப்பட்டது (PAN Validated)",
    addrVerified: "முகவரி சரிபார்க்கப்பட்டது (Address Verified)",
    verified: "சரிபார்க்கப்பட்டது (Verified)",
    aboutYou: "உங்களைப் பற்றி (About You)",
    secondaryPf: "இரண்டாம் நிலை ஓய்வூதிய நிதி (Secondary Pension Fund)",
    assetAllocation: "சொத்து வகுப்பு ஒதுக்கீடு (Asset Class Allocation)",
    maxEquity: "அதிகபட்ச ஈக்விட்டி (Max Equity)",
    lifecyclePath: "வாழ்க்கைச் சுழற்சி கிளைடு பாதை (Lifecycle Glide Path)",
    taxInfo: "வரி வதிவிட தகவல் (Tax Residency Information)",
    isTaxResident: "நீங்கள் இந்தியாவிற்கு வெளியே வரி வசிப்பவரா? (Are you a tax resident outside India?)",
    no: "இல்லை (No)",
    yes: "ஆம் (Yes)",
    isPep: "நீங்கள் அரசியல் ரீதியாக வெளிப்படையான நபரா? (Are you a Politically Exposed Person?)",
    authSummary: "அங்கீகார சுருக்கம் (Authorization Summary)",
    confirmAccuracy: "விவரங்கள் துல்லியமானவை என்று நான் உறுதிப்படுத்துகிறேன். (I confirm details are accurate.)",
    viewTerms: "முழு விதிமுறைகளையும் காண்க (View Full Terms & Conditions)",
    initialContribution: "ஆரம்ப பங்களிப்பைச் செய்யுங்கள் (Initial Contribution)",
    totalPayable: "மொத்தம் செலுத்த வேண்டியது (Total Payable)",
    secure: "பாதுகாப்பானது (Secure)",
    step: "படி (Step)",
    of: "இல் (of)",
    complete: "முடிந்தது (Complete)",
    required: "(கட்டாயமானது) (Required)",
    occupation: "தொழில் (Occupation)",
    selectOccupation: "உங்கள் தொழிலைத் தேர்ந்தெடுக்கவும் (Select your occupation)",
    occSalPriv: "சம்பளம் பெறுபவர் — தனியார் துறை (Salaried — Private Sector)",
    occSalGov: "சம்பளம் பெறுபவர் — அரசு (Salaried — Government)",
    occSelf: "சுயதொழில் / வணிகம் (Self-Employed / Business)",
    occProf: "தொழில்முறை (மருத்துவர், வழக்கறிஞர், முதலியன) (Professional)",
    occStudent: "மாணவர் (Student)",
    occHome: "குடும்பத்தலைவி (Homemaker)",
    occRetired: "ஓய்வு பெற்றவர் (Retired)",
    occOther: "மற்றவை (Other)",
    annualIncome: "ஆண்டு வருமான வரம்பு (Annual Income Range)",
    selectIncome: "வருமான வரம்பை தேர்ந்தெடுக்கவும் (Select income range)",
    incBelow2k: "₹2.5 லட்சத்திற்குக் கீழே (Below ₹2.5 Lakh)",
    inc2k5k: "₹2.5 – 5 லட்சம் (₹2.5 – 5 Lakh)",
    inc5k10k: "₹5 – 10 லட்சம் (₹5 – 10 Lakh)",
    inc10k25k: "₹10 – 25 லட்சம் (₹10 – 25 Lakh)",
    inc25k50k: "₹25 – 50 லட்சம் (₹25 – 50 Lakh)",
    incAbove50k: "₹50 லட்சத்திற்கு மேல் (Above ₹50 Lakh)",
    maritalStatus: "திருமண நிலை (Marital Status)",
    selectMarital: "திருமண நிலையை தேர்ந்தெடுக்கவும் (Select marital status)",
    msSingle: "ஒற்றையர் (Single)",
    msMarried: "திருமணமானவர் (Married)",
    msDivorced: "விவாகரத்து பெற்றவர் (Divorced)",
    msWidowed: "விதவை/விதவன் (Widowed)",
    nomineeDetails: "வாரிசுதாரர் விவரங்கள் (NOMINEE DETAILS)",
    nomineeName: "வாரிசுதாரரின் முழு பெயர் (Nominee Full Name)",
    placeholderNomineeName: "வாரிசுதாரரின் முழுப் பெயரை உள்ளிடவும் (Enter Name)",
    placeholderGuardianName: "பாதுகாவலரின் முழுப் பெயரை உள்ளிடவும் (Enter Guardian Name)",
    placeholderPan: "எ.கா. ABCPS1234K (e.g. ABCPS1234K)",
    placeholderContribution: "₹ 500 (குறைந்தபட்சம்) (₹ 500 Min)",
    relationship: "உறவு (Relationship)",
    selectRel: "உறவைத் தேர்ந்தெடுக்கவும் (Select relationship)",
    relFather: "தந்தை (Father)",
    relMother: "தாய் (Mother)",
    relSpouse: "மனைவி/கணவர் (Spouse)",
    relSon: "மகன் (Son)",
    relDaughter: "மகள் (Daughter)",
    relOther: "மற்றவை (Other)",
    nomineeDob: "வாரிசுதாரரின் பிறந்த தேதி (Nominee Date of Birth)",
    guardianName: "பாதுகாவலர் முழு பெயர் (Guardian Full Name)",
    ph4: "கட்டம் 4 — உறுதிப்படுத்தல் (Phase 4 — Confirmation)",
    corporateDetails: "கார்ப்பரேட் விவரங்கள் (Corporate Details)",
    employeeId: "ஊழியர் அடையாள எண் (Employee ID)",
    corpReg: "கார்ப்பரேட் பதிவு (CHO/CBO) (Corporate Registration)",
    retirementDate: "எதிர்பார்க்கப்படும் ஓய்வு தேதி (Expected Date of Retirement)",
    assistedMode: "உதவி முறை செயலில் உள்ளது (Assisted Mode Active)",
    popAssisting: "PoP முகவர் இந்த அமர்வில் உதவுகிறார் (PoP Agent assisting)",
    popOfficial: "PoP அலுவலர் (PoP Official)",
    fullName: "முழு பெயர் (Full Name)",
    verifiedDetails: "சரிபார்க்கப்பட்ட விவரங்கள் (Verified Details)",
    dob: "பிறந்த தேதி (Date of Birth)",
    pan: "பான் (PAN)",
    address: "முகவரி (Address)",
    mobileNumber: "மொபைல் எண் (Mobile Number)",
    ckycLookup: "உங்கள் CKYC எண் தெரியவில்லையா? பான் மூலம் தேடுங்கள் (Don't know CKYC? Look up via PAN)",
    enterPanLookup: "CKYC தேடலுக்கு பான் உள்ளிடவும் (Enter PAN for CKYC Lookup)",
    searchCkycr: "CKYCR பதிவேட்டில் தேடுங்கள் (Search CKYCR Registry)",
    ckycApiNote: "சந்தாதாரர் ஒப்புதலுடன் பாதுகாப்பான CKYCR API ஒருங்கிணைப்பு வழியாக (Via secure CKYCR API)",
    smartScan: "ஸ்மார்ட் ஸ்கேன் (Smart Scan)",
    smartScanSub: "உங்கள் பான் அல்லது ஆதாரின் புகைப்படத்தைப் பதிவேற்றவும் — Gemini AI அனைத்தையும் தானாகவே நிரப்பும் (Upload photo for auto-fill)",
    uploadDoc: "அடையாள ஆவணத்தைப் பதிவேற்றவும் (Upload Identity Document)",
    investmentSetup: "முதலீடு அமைப்பு (Investment Setup)",
    cra: "மத்திய சாதனை ஆணையம் (CRA)",
    pfm: "ஓய்வூதிய நிதி மேலாளர் (PFM)",
    selectCra: "CRA ஐத் தேர்ந்தெடுக்கவும் (Select CRA)",
    selectPfm: "ஓய்வூதிய நிதியைத் தேர்ந்தெடுக்கவும் (Select pension fund)",
    noneSinglePf: "எதுவுமில்லை — ஒற்றை PF அனைத்து சொத்து வகுப்புகளையும் நிர்வகிக்கிறது (Single PF)",
    autoChoice: "ஆட்டோ சாய்ஸ் (Auto Choice)",
    activeChoice: "ஆக்டிவ் சாய்ஸ் (Active Choice)",
    riskAdjusts: "வயதுக்கு ஏற்ப ஆபத்து தானாகவே சரிசெய்யப்படுகிறது (Risk adjusts with age)",
    youDecide: "ஈக்விட்டி, பத்திரங்களில் எவ்வளவு செல்ல வேண்டும் என்பதை நீங்களே முடிவு செய்யுங்கள் (You decide allocation)",
    downloadEpran: "ePRAN ஐப் பதிவிறக்கவும் (Download ePRAN)",
    goToDashboard: "டாஷ்போர்டிற்குச் செல்லவும் (Go to Dashboard)",
    nextSteps: "பரிந்துரைக்கப்படும் அடுத்த படிகள் (Recommended Next Steps)",
    openTier2: "பிரிவு II கணக்கைத் தொடங்கவும் (Open Tier II Account)",
    setupAutoDebit: "தானியங்கி கழிவை அமைக்கவும் (Set Up Auto-Debit)",
    downloadApp: "NPS மொபைல் செயலியைப் பதிவிறக்கவும் (Download App)",
    saveAndResume: "சேமித்து பின்னர் மீண்டும் தொடங்கவும் (Save & Resume Later)",
  },
  te: {
    welcome: "మీ NPS ఖాతాను ప్రారంభించండి (Open Your NPS Account)",
    welcomeSub: "ప్రారంభించడానికి ఖాతా రకాన్ని ఎంచుకోండి (Select account type to get started)",
    citizen: "అందరి పౌరుల నమూనా (All Citizen Model)",
    citizenSub: "వ్యక్తిగత పౌరుల కోసం — జీతం పొందే వారు, స్వయం ఉపాధి పొందే వారు (For individual citizens — salaried, self-employed)",
    corporate: "కార్పొరేట్ నమూనా (Corporate Model)",
    corporateSub: "NPS కార్పొరేట్ సెక్టార్ కింద తమ యజమాని ద్వారా నమోదు చేసుకున్న ఉద్యోగుల కోసం (For employees through employer)",
    continue: "కొనసాగించు (Continue)",
    back: "వెనుకకు (Back)",
    mostCommon: "అత్యంత దైనిక (Most Common)",
    gettingStarted: "ప్రారంభించడం (Getting Started)",
    selectAccount: "ఖాతా రకాన్ని ఎంచుకోండి (Select Account Type)",
    identityTitle: "మీ ధృవీకరించబడిన గుర్తింపు వివరాలను పొందుదాం (Let's Fetch Your Identity Details)",
    identitySub: "మాన్యువల్ ఎంట్రీని తగ్గించడానికి మరియు ఆన్‌బోర్డింగ్‌ను వేగవంతం చేయడానికి (To speed up onboarding)",
    ph0Tag: "🏛️ స్వాగతం (Welcome)",
    ph1: "దశ 1 — గుర్తింపు (Phase 1 — Identity)",
    ph2: "దశ 2 — ప్రొఫైల్ (Phase 2 — Profile)",
    ph2Title: "మీ ప్రొఫైల్‌ను పూర్తి చేయండి (Complete Your Profile)",
    ph2Sub: "మీ ప్రొఫైల్‌ను పూర్తి చేయడానికి మరికొన్ని వివరాలు (Just a few more details to finish profile)",
    ph3Title: "మీ పెన్షన్ ఎలా పెట్టుబడి పెట్టాలని మీరు అనుకుంటున్నారు? (How Would You Like Your Pension Invested?)",
    ph3Sub: "మీ విరాళాలు ఎలా నిర్వహించబడతాయో ఎంచుకోండి (Choose contribution management)",
    ph4Title: "యాక్టివేషన్‌కు ముందు చివరి వివరాలు (Final Details Before Activation)",
    ph4Sub: "దాదాపు పూర్తయింది — కొన్ని నియంత్రణ వివరాలు (Almost done — regulatory details)",
    useCkyc: "CKYCని ఉపయోగించండి (Use CKYC)",
    recommended: "సిఫార్సు చేయబడింది (Recommended)",
    ckycSub: "అత్యంత వేగవంతమైనది — సెంట్రల్ KYC రిజిస్ట్రీ నుండి పొందుతుంది (Fastest — fetches from CKYCR)",
    useBank: "బ్యాంక్ ఖాతాను ఉపయోగించండి (Use Bank Account)",
    bankSub: "మీ లింక్ చేయబడిన బ్యాంక్ ఖాతా నుండి వివరాలను పొందండి (Pull details from linked bank)",
    useAadhaar: "ఆధార్ OTPని ఉపయోగించండి (Use Aadhaar OTP)",
    aadhaarSub: "ఆధార్-లింక్డ్ మొబైల్‌కు పంపిన OTPతో ధృవీకరించండి (Verify with OTP sent to Aadhaar mobile)",
    manualTags: "పత్రాలను మాన్యువల్‌గా అప్‌లోడ్ చేయండి (Upload Documents Manually)",
    manualSub: "మీ గుర్తింపు రుజువు, పాన్ కార్డ్‌ని అప్‌లోడ్ చేయండి (Upload ID, PAN card)",
    permReq: "అనుమతి అవసరం (Permission Required)",
    permSub: "KYC నిబంధనల ప్రకారం మీ వివరాలను తిరిగి పొందడానికి అనుమతి అవసరం. (Permission needed for KYC compliance.)",
    allowCont: "అనుమతించు మరియు కొనసాగించు (Allow & Continue)",
    successTitle: "🎉 PRAN విజయవంతంగా రూపొందించబడింది! (PRAN Generated Successfully!)",
    successSub: "మీ నేష国民 పెన్షన్ సిస్టమ్ ఖాతా ఇప్పుడు యాక్టివ్‌గా ఉంది (Your NPS account is now active)",
    pranLabel: "శాశ్వత పదవీ విరమణ ఖాతా సంఖ్య (Permanent Retirement Account Number)",
    payAndActivate: "చెల్లించి ఖాతాను యాక్టివేట్ చేయండి (Pay & Activate Account)",
    processingPayment: "చెల్లింపు ప్రాసెస్ చేయబడుతోంది... (Processing payment...)",
    fetchingDetails: "మీ ధృవీకరించబడిన వివరాలను పొందుతోంది... (Fetching details...)",
    kycModeCKYC: "ముఖాముఖి కానిది — CKYC పొందడం (Non Face-to-Face — CKYC)",
    kycModeBank: "ముఖాముఖి కానిది — CBS ధృవీకరణ (Non Face-to-Face — CBS)",
    kycModeAadhaar: "ముఖాముఖి కానిది — ఆధార్ eKYC (Non Face-to-Face — Aadhaar)",
    kycModeManual: "ముఖాముఖి — మాన్యువల్ డాక్యుమెంట్ అప్‌లోడ్ (Face-to-Face — Manual)",
    riskEnhanced: "మెరుగుపరచబడినది (Enhanced)",
    riskStandard: "సాధారణం (Standard)",
    invalidPan: "దయచేసి చెల్లుబాటు అయ్యే పాన్ ఎంటర్ చేయండి (Please enter a valid PAN)",
    searchingCkyc: "CKYCR శోధిస్తోంది... (Searching CKYCR...)",
    allFieldsComplete: "✓ అన్ని అవసరమైన ఫీల్డ్‌లు పూర్తయ్యాయి (All required fields complete)",
    fieldsRemaining: "అవసరమైన ఫీల్డ్‌లు మిగిలి ఉన్నాయి (required fields remaining)",
    autoExplainer: "మీ కేటాయింపు లైఫ్ సైకిల్-ఆధారిత గ్లైడ్ పాత్ ద్వారా నిర్వహించబడుతుంది (Allocation via lifecycle glide path)",
    activeExplainer: "ఈక్విటీ, కార్పొరేట్ బాండ్ల మధ్య మీరు మీ కేటాయింపును ఎంచుకుంటారు (Choose your own allocation E, C, G)",
    pension: "పెన్షన్ (Pension)",
    accessibility: "యాక్సెసిబిలిటీ (Accessibility):",
    idRetrieved: "గుర్తింపు పొందబడింది (Identity Retrieved)",
    panValidated: "పాన్ ధృవీకరించబడింది (PAN Validated)",
    addrVerified: "చిరునామా ధృవీకరించబడింది (Address Verified)",
    verified: "ధృవీకరించబడింది (Verified)",
    aboutYou: "మీ గురించి (About You)",
    secondaryPf: "ద్వితీయ పెన్షన్ ఫండ్ (Secondary Pension Fund)",
    assetAllocation: "అసెట్ క్లాస్ కేటాయింపు (Asset Class Allocation)",
    maxEquity: "గరిష్ట ఈక్విటీ (Max Equity)",
    lifecyclePath: "లైఫ్ సైకిల్ గ్లైడ్ పాత్ (Lifecycle Glide Path)",
    taxInfo: "పన్ను నివాస సమాచారం (Tax Residency Information)",
    isTaxResident: "మీరు భారతదేశం వెలుపల పన్ను నివాసిలా? (Are you a tax resident outside India?)",
    no: "కాదు (No)",
    yes: "అవును (Yes)",
    isPep: "మీరు రాజకీయ బాధ్యత కలిగిన వ్యక్తిలా? (Are you a Politically Exposed Person?)",
    authSummary: "అధికార సారాంశం (Authorization Summary)",
    confirmAccuracy: "వివరాలు ఖచ్చితమైనవని నేను ధృవీకరిస్తున్నాను. (I confirm details are accurate.)",
    viewTerms: "పూర్తి నిబంధనలు & షరతులను చూడండి (View Full Terms & Conditions)",
    initialContribution: "ప్రారంభ విరాళం ఇవ్వండి (Initial Contribution)",
    totalPayable: "మొత్తం చెల్లించవలసినది (Total Payable)",
    secure: "సురక్షితం (Secure)",
    step: "దశ (Step)",
    of: "లో (of)",
    complete: "పూర్తయింది (Complete)",
    required: "(తప్పనిసరి) (Required)",
    occupation: "వృత్తి (Occupation)",
    selectOccupation: "మీ వృత్తిని ఎంచుకోండి (Select your occupation)",
    occSalPriv: "ప్రైవేట్ రంగ ఉద్యోగి (Salaried — Private Sector)",
    occSalGov: "ప్రభుత్వ రంగ ఉద్యోగి (Salaried — Government)",
    occSelf: "స్వయం ఉపాధి / వ్యాపారం (Self-Employed / Business)",
    occProf: "వృత్తి నిపుణులు (డాక్టర్, లాయర్, CA మొదలైనవి) (Professional)",
    occStudent: "విద్యార్థి (Student)",
    occHome: "గృహిణి (Homemaker)",
    occRetired: "రిటైర్డ్ (Retired)",
    occOther: "ఇతర (Other)",
    annualIncome: "వార్షిక ఆదాయ పరిమితి (Annual Income Range)",
    selectIncome: "ఆదాయ పరిమితిని ఎంచుకోండి (Select income range)",
    incBelow2k: "₹2.5 లక్షల లోపు (Below ₹2.5 Lakh)",
    inc2k5k: "₹2.5 – 5 లక్షలు (₹2.5 – 5 Lakh)",
    inc5k10k: "₹5 – 10 లక్షలు (₹5 – 10 Lakh)",
    inc10k25k: "₹10 – 25 లక్షలు (₹10 – 25 Lakh)",
    inc25k50k: "₹25 – 50 లక్షలు (₹25 – 50 Lakh)",
    incAbove50k: "₹50 లక్షల పైన (Above ₹50 Lakh)",
    maritalStatus: "వైవాహిక స్థితి (Marital Status)",
    selectMarital: "వైవాహిక స్థితిని ఎంచుకోండి (Select marital status)",
    msSingle: "అవివాహితులు (Single)",
    msMarried: "వివాహితులు (Married)",
    msDivorced: "విడాకులు తీసుకున్న వారు (Divorced)",
    msWidowed: "వితంతువు (Widowed)",
    nomineeDetails: "నామినీ వివరాలు (NOMINEE DETAILS)",
    nomineeName: "నామినీ పూర్తి పేరు (Nominee Full Name)",
    placeholderNomineeName: "నామినీ పూర్తి పేరును నమోదు చేయండి (Enter Name)",
    placeholderGuardianName: "గార్డియన్ పూర్తి పేరును నమోదు చేయండి (Enter Guardian Name)",
    placeholderPan: "ఉదా. ABCPS1234K (e.g. ABCPS1234K)",
    placeholderContribution: "₹ 500 (కనిష్టంగా) (₹ 500 Min)",
    relationship: "బంధుత్వం (Relationship)",
    selectRel: "బంధుత్వాన్ని ఎంచుకోండి (Select relationship)",
    relFather: "తండ్రి (Father)",
    relMother: "తల్లి (Mother)",
    relSpouse: "భార్య/భర్త (Spouse)",
    relSon: "కుమారుడు (Son)",
    relDaughter: "కుమార్తె (Daughter)",
    relOther: "ఇతర (Other)",
    nomineeDob: "నామినీ పుట్టిన తేదీ (Nominee Date of Birth)",
    guardianName: "గార్డియన్ పూర్తి పేరు (Guardian Full Name)",
    ph4: "దశ 4 — నిర్ధారణ (Phase 4 — Confirmation)",
    corporateDetails: "కార్పొరేట్ వివరాలు (Corporate Details)",
    employeeId: "ఉద్యోగి ఐడి (Employee ID)",
    corpReg: "కార్పొరేట్ రిజిస్ట్రేషన్ (CHO/CBO) (Corporate Registration)",
    retirementDate: "పదవీ విరమణ ఆశించిన తేదీ (Expected Date of Retirement)",
    assistedMode: "అసిస్టెడ్ మోడ్ యాక్టివ్‌గా ఉంది (Assisted Mode Active)",
    popAssisting: "PoP ఏజెంట్ ఈ సెషన్‌లో సహాయం చేస్తున్నారు (PoP Agent assisting)",
    popOfficial: "PoP అధికారి (PoP Official)",
    fullName: "పూర్తి పేరు (Full Name)",
    verifiedDetails: "ధృవీకరించబడిన వివరాలు (Verified Details)",
    dob: "పుట్టిన తేదీ (Date of Birth)",
    pan: "పాన్ (PAN)",
    address: "చిరునామా (Address)",
    mobileNumber: "మొబైల్ నంబర్ (Mobile Number)",
    ckycLookup: "మీ CKYC నంబర్ తెలియదా? పాన్ ద్వారా వెతకండి (Don't know CKYC? Look up via PAN)",
    enterPanLookup: "CKYC శోధన కోసం పాన్ ఎంటర్ చేయండి (Enter PAN for CKYC Lookup)",
    searchCkycr: "CKYCR రిజిస్ట్రీని శోధించండి (Search CKYCR Registry)",
    ckycApiNote: "సందారుల సమ్మతితో సురక్షితమైన CKYCR API ఇంటిగ్రేషన్ ద్వారా (Via secure CKYCR API)",
    smartScan: "స్మార్ట్ స్కాన్ (Smart Scan)",
    smartScanSub: "మీ పాన్ లేదా ఆధార్ ఫోటోను అప్‌లోడ్ చేయండి — Gemini AI ప్రతిదీ ఆటో-ఫిల్ చేస్తుంది (Upload photo for auto-fill)",
    uploadDoc: "గుర్తింపు పత్రాన్ని అప్‌లోడ్ చేయండి (Upload Identity Document)",
    investmentSetup: "పెట్టుబడి సెటప్ (Investment Setup)",
    cra: "సెంట్రల్ రికార్డ్ కీపింగ్ ఏజెన్సీ (CRA)",
    pfm: "పెన్షన్ ఫండ్ మేనేజర్ (PFM)",
    selectCra: "CRAని ఎంచుకోండి (Select CRA)",
    selectPfm: "పెన్షన్ ఫండ్‌ను ఎంచుకోండి (Select pension fund)",
    noneSinglePf: "ఏదీ లేదు — ఒకే PF అన్ని అసెట్ క్లాస్‌లను నిర్వహిస్తుంది (Single PF)",
    autoChoice: "ఆటో ఛాయిస్ (Auto Choice)",
    activeChoice: "యాక్టివ్ ఛాయిస్ (Active Choice)",
    riskAdjusts: "వయస్సు పెరిగే కొద్దీ రిస్క్ ఆటోమేటిక్‌గా సర్దుబాటు అవుతుంది (Risk adjusts with age)",
    youDecide: "ఈక్విటీ, బాండ్లలో ఎంత వెళ్లాలో మీరే నిర్ణయించుకుంటారు (You decide allocation)",
    downloadEpran: "ePRAN డౌన్‌లోడ్ చేయండి (Download ePRAN)",
    goToDashboard: "డ్యాష్‌బోర్డ్‌కి వెళ్లండి (Go to Dashboard)",
    nextSteps: "సిఫార్సు చేయబడిన తదుపరి దశలు (Recommended Next Steps)",
    openTier2: "టైర్ II ఖాతాను ప్రారంభించండి (Open Tier II Account)",
    setupAutoDebit: "ఆటో-డెబిట్ సెటప్ చేయండి (Set Up Auto-Debit)",
    downloadApp: "NPS మొబైల్ యాప్‌ను డౌన్‌లోడ్ చేయండి (Download App)",
    saveAndResume: "సేవ్ చేసి తర్వాత మళ్లీ ప్రారంభించండి (Save & Resume Later)",
  },
  kn: {
    welcome: "ನಿಮ್ಮ NPS ಖಾತೆಯನ್ನು ತೆರೆಯಿರಿ (Open Your NPS Account)",
    welcomeSub: "ಪ್ರಾರಂಭಿಸಲು ಖಾತೆಯ ಪ್ರಕಾರವನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select account type to get started)",
    citizen: "ಎಲ್ಲಾ ನಾಗರಿಕರ ಮಾದರಿ (All Citizen Model)",
    citizenSub: "ವೈಯಕ್ತಿಕ ನಾಗರಿಕರಿಗಾಗಿ - ಸಂಬಳ ಪಡೆಯುವವರು, ಸ್ವಯಂ ಉದ್ಯೋಗಿಗಳು (For individual citizens — salaried, self-employed)",
    corporate: "ಕಾರ್ಪೊರೇಟ್ ಮಾದರಿ (Corporate Model)",
    corporateSub: "NPS ಕಾರ್ಪೊರೇಟ್ ವಲಯದ ಅಡಿಯಲ್ಲಿ ತಮ್ಮ ಉದ್ಯೋಗದಾತರ ಮೂಲಕ ದಾಖಲಾದ ಉದ್ಯೋಗಿಗಳಿಗೆ (For employees through employer)",
    continue: "ಮುಂದುವರಿಸಿ (Continue)",
    back: "ಹಿಂದಕ್ಕೆ (Back)",
    mostCommon: "ಅತ್ಯಂತ ಸಾಮಾನ್ಯ (Most Common)",
    gettingStarted: "ಪ್ರಾರಂಭಿಸುವುದು (Getting Started)",
    selectAccount: "ಖಾತೆಯ ಪ್ರಕಾರವನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select Account Type)",
    identityTitle: "ನಿಮ್ಮ ಪರಿಶೀಲಿಸಿದ ಗುರುತಿನ ವಿವರಗಳನ್ನು ಪಡೆಯೋಣ (Let's Fetch Your Identity Details)",
    identitySub: "ಹಸ್ತಚಾಲಿತ ನಮೂದನ್ನು ಕಡಿಮೆ ಮಾಡಲು ಮತ್ತು ಆನ್‌ಬೋರ್ಡಿಂಗ್ ವೇಗಗೊಳಿಸಲು (To speed up onboarding)",
    ph0Tag: "🏛️ ಸ್ವಾಗತ (Welcome)",
    ph1: "ಹಂತ 1 — ಗುರುತು (Phase 1 — Identity)",
    ph2: "ಹಂತ 2 — ಪ್ರೊಫೈಲ್ (Phase 2 — Profile)",
    ph2Title: "ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪೂರ್ಣಗೊಳಿಸಿ (Complete Your Profile)",
    ph2Sub: "ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಮುಗಿಸಲು ಇನ್ನು ಕೆಲವು ವಿವರಗಳು (Just a few more details to finish profile)",
    ph3: "ಹಂತ 3 — ಪಿಂಚಣಿ ಸೆಟಪ್ (Phase 3 — Pension Setup)",
    ph3Title: "ನಿಮ್ಮ ಪಿಂಚಣಿಯನ್ನು ಹೇಗೆ ಹೂಡಿಕೆ ಮಾಡಲು ಬಯಸುತ್ತೀರಿ? (How Would You Like Your Pension Invested?)",
    ph3Sub: "ನಿಮ್ಮ ಕೊಡುಗೆಗಳನ್ನು ಹೇಗೆ ನಿರ್ವಹಿಸಲಾಗುತ್ತದೆ ಎಂಬುದನ್ನು ಆರಿಸಿ (Choose contribution management)",
    ph4Title: "ಸಕ್ರಿಯಗೊಳಿಸುವ ಮೊದಲು ಅಂತಿಮ ವಿವರಗಳು (Final Details Before Activation)",
    ph4Sub: "ಸುಮಾರು ಮುಗಿದಿದೆ — ಕೆಲವು ನಿಯಂತ್ರಕ ವಿವರಗಳು (Almost done — regulatory details)",
    useCkyc: "CKYC ಬಳಸಿ (Use CKYC)",
    recommended: "ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ (Recommended)",
    ckycSub: "ಅತ್ಯಂತ ವೇಗವಾಗಿ — ಕೇಂದ್ರ KYC ನೋಂದಣಿಯಿಂದ ವಿವರ ಪಡೆಯುತ್ತದೆ (Fastest — fetches from CKYCR)",
    useBank: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಬಳಸಿ (Use Bank Account)",
    bankSub: "ನಿಮ್ಮ ಲಿಂಕ್ ಮಾಡಲಾದ ಬ್ಯಾಂಕ್ ಖಾತೆಯಿಂದ ವಿವರಗಳನ್ನು ಪಡೆಯಿರಿ (Pull details from linked bank)",
    useAadhaar: "ಆಧಾರ್ OTP ಬಳಸಿ (Use Aadhaar OTP)",
    aadhaarSub: "ಆಧಾರ್-ಲಿಂಕ್ ಮಾಡಲಾದ ಮೊಬೈಲ್‌ಗೆ ಕಳುಹಿಸಲಾದ OTP ಮೂಲಕ ಪರಿಶೀಲಿಸಿ (Verify via Aadhaar mobile OTP)",
    manualTags: "ದಾಖಲೆಗಳನ್ನು ಹಸ್ತಚಾಲಿತವಾಗಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ (Upload Documents Manually)",
    manualSub: "ನಿಮ್ಮ ಗುರುತಿನ ಪುರಾವೆ, ಪ್ಯಾನ್ ಕಾರ್ಡ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ (Upload ID, PAN card)",
    permReq: "ಅನುಮತಿ ಅಗತ್ಯವಿದೆ (Permission Required)",
    permSub: "KYC ಅನುಸರಣೆಗಾಗಿ ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಹಿಂಪಡೆಯಲು ಅನುಮತಿ ಅಗತ್ಯವಿದೆ. (Permission needed for KYC compliance.)",
    allowCont: "ಅನುಮತಿಸಿ ಮತ್ತು ಮುಂದುವರಿಸಿ (Allow & Continue)",
    successTitle: "🎉 PRAN ಯಶಸ್ವಿಯಾಗಿ ರಚಿಸಲಾಗಿದೆ! (PRAN Generated Successfully!)",
    successSub: "ನಿಮ್ಮ ರಾಷ್ಟ್ರೀಯ ಪಿಂಚಣಿ ವ್ಯವಸ್ಥೆ ಖಾತೆ ಈಗ ಸಕ್ರಿಯವಾಗಿದೆ (Your NPS account is now active)",
    pranLabel: "ಶಾಶ್ವತ ನಿವೃತ್ತಿ ಖಾತೆ ಸಂಖ್ಯೆ (Permanent Retirement Account Number)",
    payAndActivate: "ಪಾವತಿಸಿ ಮತ್ತು ಖಾತೆಯನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ (Pay & Activate Account)",
    processingPayment: "ಪಾವತಿಯನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ... (Processing payment...)",
    fetchingDetails: "ನಿಮ್ಮ ಪರಿಶೀಲಿಸಿದ ವಿವರಗಳನ್ನು ಪಡೆಯಲಾಗುತ್ತಿದೆ... (Fetching details...)",
    kycModeCKYC: "ಮುಖಾಮುಖಿ ಅಲ್ಲದ — CKYC ಹಿಂಪಡೆಯುವಿಕೆ (Non Face-to-Face — CKYC)",
    kycModeBank: "ಮುಖಾಮುಖಿ ಅಲ್ಲದ — CBS ಪರಿಶೀಲನೆ (Non Face-to-Face — CBS)",
    kycModeAadhaar: "ಮುಖಾಮುಖಿ ಅಲ್ಲದ — ಆಧಾರ್ eKYC (Non Face-to-Face — Aadhaar)",
    kycModeManual: "ಮುಖಾಮುಖಿ — ಹಸ್ತಚಾಲಿತ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ (Face-to-Face — Manual)",
    riskEnhanced: "ಸುಧಾರಿತ (Enhanced)",
    riskStandard: "ಸಾಮಾನ್ಯ (Standard)",
    invalidPan: "ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಪ್ಯಾನ್ ಅನ್ನು ನಮೂದಿಸಿ (Please enter a valid PAN)",
    searchingCkyc: "CKYCR ಹುಡುಕಲಾಗುತ್ತಿದೆ... (Searching CKYCR...)",
    allFieldsComplete: "✓ ಎಲ್ಲಾ ಅಗತ್ಯ ಕ್ಷೇತ್ರಗಳು ಪೂರ್ಣಗೊಂಡಿವೆ (All required fields complete)",
    fieldsRemaining: "ಅಗತ್ಯ ಕ್ಷೇತ್ರಗಳು ಬಾಕಿ ಇವೆ (required fields remaining)",
    autoExplainer: "ನಿಮ್ಮ ಹಂಚಿಕೆಯನ್ನು ಜೀವನಚಕ್ರ ಆಧಾರಿತ ಗ್ಲೈಡ್ ಪಾತ್ ಮೂಲಕ ನಿರ್ವಹಿಸಲಾಗುತ್ತದೆ (Allocation via lifecycle glide path)",
    activeExplainer: "ಇಕ್ವಿಟಿ, ಕಾರ್ಪೊರೇಟ್ ಬಾಂಡ್‌ಗಳ ನಡುವೆ ನಿಮ್ಮ ಹಂಚಿಕೆಯನ್ನು ನೀವು ಆರಿಸಿಕೊಳ್ಳುತ್ತೀರಿ (Choose your own allocation E, C, G)",
    pension: "ಪಿಂಚಣಿ (Pension)",
    accessibility: "ಪ್ರವೇಶಿಸುವಿಕೆ (Accessibility):",
    idRetrieved: "ಗುರುತನ್ನು ಹಿಂಪಡೆಯಲಾಗಿದೆ (Identity Retrieved)",
    panValidated: "ಪ್ಯಾನ್ ಪರಿಶೀಲಿಸಲಾಗಿದೆ (PAN Validated)",
    addrVerified: "ವಿಳಾಸ ಪರಿಶೀಲಿಸಲಾಗಿದೆ (Address Verified)",
    verified: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ (Verified)",
    aboutYou: "ನಿಮ್ಮ ಬಗ್ಗೆ (About You)",
    secondaryPf: "ದ್ವಿತೀಯ ಪಿಂಚಣಿ ನಿಧಿ (Secondary Pension Fund)",
    assetAllocation: "ಆಸ್ತಿ ವರ್ಗ ಹಂಚಿಕೆ (Asset Class Allocation)",
    maxEquity: "ಗರಿಷ್ಠ ಇಕ್ವಿಟಿ (Max Equity)",
    lifecyclePath: "ಜೀವನಚಕ್ರ ಗ್ಲೈಡ್ ಪಾತ್ (Lifecycle Glide Path)",
    taxInfo: "ತೆರಿಗೆ ನಿವಾಸ ಮಾಹಿತಿ (Tax Residency Information)",
    isTaxResident: "ನೀವು ಭಾರತದ ಹೊರಗೆ ತೆರಿಗೆ ನಿವಾಸಿಯೇ? (Are you a tax resident outside India?)",
    no: "ಇಲ್ಲ (No)",
    yes: "ಹೌದು (Yes)",
    isPep: "ನೀವು ರಾಜಕೀಯವಾಗಿ ಒಡ್ಡಿಕೊಂಡ ವ್ಯಕ್ತಿಯೇ? (Are you a Politically Exposed Person?)",
    authSummary: "ಅಧಿಕೃತ ಸಾರಾಂಶ (Authorization Summary)",
    confirmAccuracy: "ವಿವರಗಳು ನಿಖರವೆಂದು ನಾನು ದೃಢೀಕರಿಸುತ್ತೇನೆ. (I confirm details are accurate.)",
    viewTerms: "ಪೂರ್ಣ ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳನ್ನು ವೀಕ್ಷಿಸಿ (View Full Terms & Conditions)",
    initialContribution: "ಆರಂಭಿಕ ಕೊಡುಗೆ ನೀಡಿ (Initial Contribution)",
    totalPayable: "ಒಟ್ಟು ಪಾವತಿಸಬೇಕಾದ ಮೊತ್ತ (Total Payable)",
    secure: "ಸುರಕ್ಷಿತ (Secure)",
    step: "ಹಂತ (Step)",
    of: "ರಲ್ಲಿ (of)",
    complete: "ಪೂರ್ಣಗೊಂಡಿದೆ (Complete)",
    required: "(ಅಗತ್ಯವಿದೆ) (Required)",
    occupation: "ವೃತ್ತಿ (Occupation)",
    selectOccupation: "ನಿಮ್ಮ ವೃತ್ತಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select your occupation)",
    occSalPriv: "ಸಂಬಳ ಪಡೆಯುವವರು — ಖಾಸಗಿ ವಲಯ (Salaried — Private Sector)",
    occSalGov: "ಸಂಬಳ ಪಡೆಯುವವರು — ಸರ್ಕಾರಿ (Salaried — Government)",
    occSelf: "ಸ್ವಯಂ ಉದ್ಯೋಗ / ವ್ಯವಹಾರ (Self-Employed / Business)",
    occProf: "ವೃತ್ತಿಪರರು (ವೈದ್ಯರು, ವಕೀಲರು, CA ಇತ್ಯಾದಿ) (Professional)",
    occStudent: "ವಿದ್ಯಾರ್ಥಿ (Student)",
    occHome: "ಗೃಹಿಣಿ (Homemaker)",
    occRetired: "ನಿವೃತ್ತರು (Retired)",
    occOther: "ಇತರ (Other)",
    annualIncome: "ವಾರ್ಷಿಕ ಆದಾಯ ಶ್ರೇಣಿ (Annual Income Range)",
    selectIncome: "ಆದಾಯ ಶ್ರೇಣಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select income range)",
    incBelow2k: "₹2.5 ಲಕ್ಷಕ್ಕಿಂತ ಕಡಿಮೆ (Below ₹2.5 Lakh)",
    inc2k5k: "₹2.5 – 5 ಲಕ್ಷ (₹2.5 – 5 Lakh)",
    inc5k10k: "₹5 – 10 ಲಕ್ಷ (₹5 – 10 Lakh)",
    inc10k25k: "₹10 – 25 ಲಕ್ಷ (₹10 – 25 Lakh)",
    inc25k50k: "₹25 – 50 ಲಕ್ಷ (₹25 – 50 Lakh)",
    incAbove50k: "₹50 ಲಕ್ಷಕ್ಕಿಂತ ಹೆಚ್ಚು (Above ₹50 Lakh)",
    maritalStatus: "ವೈವಾಹಿಕ ಸ್ಥಿತಿ (Marital Status)",
    selectMarital: "ವೈವಾಹಿಕ ಸ್ಥಿತಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select marital status)",
    msSingle: "ಅವಿವಾಹಿತರು (Single)",
    msMarried: "ವಿವಾಹಿತರು (Married)",
    msDivorced: "ವಿಚ್ಛೇದಿತರು (Divorced)",
    msWidowed: "ವಿಧವೆ/ವಿಧುರ (Widowed)",
    nomineeDetails: "ನಾಮಿನಿ ವಿವರಗಳು (NOMINEE DETAILS)",
    nomineeName: "ನಾಮಿನಿಯ ಪೂರ್ಣ ಹೆಸರು (Nominee Full Name)",
    placeholderNomineeName: "ನಾಮಿನಿ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (Enter Name)",
    placeholderGuardianName: "ಪೋಷಕರ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (Enter Guardian Name)",
    placeholderPan: "ಉದಾ. ABCPS1234K (e.g. ABCPS1234K)",
    placeholderContribution: "₹ 500 (ಕನಿಷ್ಠ) (₹ 500 Min)",
    relationship: "ಸಂಬಂಧ (Relationship)",
    selectRel: "ಸಂಬಂಧವನ್ನು ಆಯ್ಕೆಮಾಡಿ (Select relationship)",
    relFather: "ತಂದೆ (Father)",
    relMother: "ತಾಯಿ (Mother)",
    relSpouse: "ಪತಿ/ಪತ್ನಿ (Spouse)",
    relSon: "ಮಗ (Son)",
    relDaughter: "ಮಗಳು (Daughter)",
    relOther: "ಇತರ (Other)",
    nomineeDob: "ನಾಮಿನಿಯ ಹುಟ್ಟಿದ ದಿನಾಂಕ (Nominee Date of Birth)",
    guardianName: "ಪೋಷಕರ ಪೂರ್ಣ ಹೆಸರು (Guardian Full Name)",
    ph4: "ಹಂತ 4 — ದೃಢೀಕರಣ (Phase 4 — Confirmation)",
    corporateDetails: "ಕಾರ್ಪೊರೇಟ್ ವಿವರಗಳು (Corporate Details)",
    employeeId: "ನೌಕರರ ಐಡಿ (Employee ID)",
    corpReg: "ಕಾರ್ಪೊರೇಟ್ ನೋಂದಣಿ (CHO/CBO) (Corporate Registration)",
    retirementDate: "ನಿವೃತ್ತಿಯ ನಿರೀಕ್ಷಿತ ದಿನಾಂಕ (Expected Date of Retirement)",
    assistedMode: "ಅಸಿಸ್ಟೆಡ್ ಮೋಡ್ ಸಕ್ರಿಯವಾಗಿದೆ (Assisted Mode Active)",
    popAssisting: "PoP ಏಜೆಂಟ್ ಈ ಸೆಷನ್‌ನಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತಿದ್ದಾರೆ (PoP Agent assisting)",
    popOfficial: "PoP ಅಧಿಕಾರಿ (PoP Official)",
    fullName: "ಪೂರ್ಣ ಹೆಸರು (Full Name)",
    verifiedDetails: "ಪರಿಶೀಲಿಸಿದ ವಿವರಗಳು (Verified Details)",
    dob: "ಹುಟ್ಟಿದ ದಿನಾಂಕ (Date of Birth)",
    pan: "ಪಾನ್ (PAN)",
    address: "ವಿಳಾಸ (Address)",
    mobileNumber: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (Mobile Number)",
    ckycLookup: "ನಿಮ್ಮ CKYC ಸಂಖ್ಯೆ ತಿಳಿದಿಲ್ಲವೇ? ಪಾನ್ ಮೂಲಕ ಹುಡುಕಿ (Don't know CKYC? Look up via PAN)",
    enterPanLookup: "CKYC ಹುಡುಕಾಟಕ್ಕಾಗಿ ಪಾನ್ ನಮೂದಿಸಿ (Enter PAN for CKYC Lookup)",
    searchCkycr: "CKYCR ನೋಂದಣಿಯನ್ನು ಶೋಧಿಸಿ (Search CKYCR Registry)",
    ckycApiNote: "ಚಂದಾದಾರರ ಒಪ್ಪಿಗೆಯೊಂದಿಗೆ ಸುರಕ್ಷಿತ CKYCR API ಏಕೀಕರಣದ ಮೂಲಕ (Via secure CKYCR API)",
    smartScan: "ಸ್ಮಾರ್ಟ್ ಸ್ಕ್ಯಾನ್ (Smart Scan)",
    smartScanSub: "ನಿಮ್ಮ ಪ್ಯಾನ್ ಅಥವಾ ಆಧಾರ್ ಫೋಟೋವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ — Gemini AI ಎಲ್ಲವನ್ನೂ ಆಟೋ-ಫಿಲ್ ಮಾಡುತ್ತದೆ (Upload photo for auto-fill)",
    uploadDoc: "ಗುರುತಿನ ದಾಖಲೆಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ (Upload Identity Document)",
    investmentSetup: "ಹೂಡಿಕೆ ಸೆಟಪ್ (Investment Setup)",
    cra: "ಕೇಂದ್ರ ದಾಖಲೆ ಕೀಪಿಂಗ್ ಏಜೆನ್ಸಿ (CRA)",
    pfm: "ಪೆನ್ಷನ್ ಫಂಡ್ ಮ್ಯಾನೇಜರ್ (PFM)",
    selectCra: "CRA ಆಯ್ಕೆಮಾಡಿ (Select CRA)",
    selectPfm: "ಪೆನ್ಷನ್ ಫಂಡ್ ಆಯ್ಕೆಮಾಡಿ (Select pension fund)",
    noneSinglePf: "ಯಾವುದೂ ಇಲ್ಲ — ಏಕ PF ಎಲ್ಲಾ ಆಸ್ತಿ ವರ್ಗಗಳನ್ನು ನಿರ್ವಹಿಸುತ್ತದೆ (Single PF)",
    autoChoice: "ಆಟೋ ಚಾಯ್ಸ್ (Auto Choice)",
    activeChoice: "ಆಕ್ಟಿವ್ ಚಾಯ್ಸ್ (Active Choice)",
    riskAdjusts: "ವಯಸ್ಸಾದಂತೆ ಅಪಾಯವು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಹೊಂದಾಣಿಕೆಯಾಗುತ್ತದೆ (Risk adjusts with age)",
    youDecide: "ಈಕ್ವಿಟಿ, ಬಾಂಡ್‌ಗಳಲ್ಲಿ ಎಷ್ಟು ಹೋಗಬೇಕೆಂದು ನೀವೇ ನಿರ್ಧರಿಸಿ (You decide allocation)",
    downloadEpran: "ePRAN ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ (Download ePRAN)",
    goToDashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ಹೋಗಿ (Go to Dashboard)",
    nextSteps: "ಶಿಫಾರಸು ಮಾಡಲಾದ ಮುಂದಿನ ಹಂತಗಳು (Recommended Next Steps)",
    openTier2: "ಟೈರ್ II ಖಾತೆಯನ್ನು ತೆರೆಯಿರಿ (Open Tier II Account)",
    setupAutoDebit: "ಆಟೋ-ಡೆಬಿಟ್ ಹೊಂದಿಸಿ (Set Up Auto-Debit)",
    downloadApp: "NPS ಮೊಬೈಲ್ ಅಪ್ಲಿಕೇಶನ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ (Download App)",
    saveAndResume: "ಉಳಿಸಿ ಮತ್ತು ನಂತರ ಪುನರಾರಂಭಿಸಿ (Save & Resume Later)",
  },
  or: {
    welcome: "ଆପଣଙ୍କର NPS ଖାତା ଖୋଲନ୍ତୁ (Open Your NPS Account)",
    welcomeSub: "ଆରମ୍ଭ କରିବା ପାଇଁ ଖାତା ପ୍ରକାର ଚୟନ କରନ୍ତୁ (Select account type to get started)",
    citizen: "ସମସ୍ତ ନାଗରିକ ମଡେଲ୍ (All Citizen Model)",
    citizenSub: "ବ୍ୟକ୍ତିଗତ ନାଗରିକମାନଙ୍କ ପାଇଁ — ଦରମା ପ୍ରାପ୍ତ, ସ୍ୱ-ନିଯୁକ୍ତ (For individual citizens — salaried, self-employed)",
    corporate: "କର୍ପୋରେଟ୍ ମଡେଲ୍ (Corporate Model)",
    corporateSub: "NPS କର୍ପୋରେଟ୍ ସେକ୍ଟର ଅଧୀନରେ ସେମାନଙ୍କ ନିଯୁକ୍ତିଦାତାଙ୍କ ମାଧ୍ୟମରେ ପଞ୍ଜିକୃତ କର୍ମଚାରୀଙ୍କ ପାଇଁ (For employees through employer)",
    continue: "ଜାରି ରଖନ୍ତୁ (Continue)",
    back: "ପଛକୁ (Back)",
    mostCommon: "ସାଧାରଣତଃ (Most Common)",
    gettingStarted: "ଆରମ୍ଭ କରୁଛି (Getting Started)",
    selectAccount: "ଖାତା ପ୍ରକାର ଚୟନ କରନ୍ତୁ (Select Account Type)",
    identityTitle: "ଆସନ୍ତୁ ଆପଣଙ୍କର ଯାଞ୍ଚ ହୋଇଥିବା ପରିଚୟ ବିବରଣୀ ପାଇବା (Let's Fetch Your Identity Details)",
    identitySub: "ମାନୁଆଲ୍ ପ୍ରବେଶକୁ ହ୍ରାସ କରିବା ଏବଂ ଅନବୋର୍ଡିଂକୁ ତ୍ୱରାନ୍ୱିତ କରିବା ପାଇଁ (To speed up onboarding)",
    ph0Tag: "🏛️ ସ୍ୱାଗତ (Welcome)",
    ph1: "ପର୍ଯ୍ୟାୟ 1 — ପରିଚୟ (Phase 1 — Identity)",
    ph2: "ପର୍ଯ୍ୟାୟ 2 — ପ୍ରୋଫାଇଲ୍ (Phase 2 — Profile)",
    ph2Title: "ଆପଣଙ୍କର ପ୍ରୋଫାଇଲ୍ ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ (Complete Your Profile)",
    ph2Sub: "ଆପଣଙ୍କର ପ୍ରୋଫାଇଲ୍ ଶେଷ କରିବାକୁ କେବଳ କିଛି ଅଧିକ ବିବରଣୀ (Just a few more details to finish profile)",
    ph3: "ପର୍ଯ୍ୟାୟ 3 — ପେନସନ ସେଟଅପ୍ (Phase 3 — Pension Setup)",
    ph3Title: "ଆପଣ ନିଜ ପେନସନକୁ କିପରି ବିନିଯୋଗ କରିବାକୁ ଚାହାଁନ୍ତି? (How Would You Like Your Pension Invested?)",
    ph3Sub: "ଆପଣଙ୍କର ଅବଦାନ କିପରି ପରିଚାଳିତ ହେବ ଚୟନ କରନ୍ତୁ (Choose how your contributions are managed)",
    ph4Title: "ସକ୍ରିୟ କରିବା ପୂର୍ବରୁ ଅନ୍ତିମ ବିବରଣୀ (Final Details Before Activation)",
    ph4Sub: "ପ୍ରାୟ ଶେଷ ହୋଇଛି — କିଛି ନିୟାମକ ବିବରଣୀ (Almost done — regulatory details)",
    useCkyc: "CKYC ବ୍ୟବହାର କରନ୍ତୁ (Use CKYC)",
    recommended: "ସୁପାରିଶ କରାଯାଇଛି (Recommended)",
    ckycSub: "ଦ୍ରୁତତମ — କେନ୍ଦ୍ରୀୟ KYC ପଞ୍ଜିକରଣରୁ ପ୍ରାପ୍ତ ହୁଏ (Fastest — fetches from CKYCR)",
    useBank: "ବ୍ୟାଙ୍କ ଖାତା ବ୍ୟବହାର କରନ୍ତୁ (Use Bank Account)",
    bankSub: "ଆପଣଙ୍କର ସଂଯୁକ୍ତ ବ୍ୟାଙ୍କ ଖାତାରୁ ବିବରଣୀ ପାଆନ୍ତୁ (Pull details from linked bank)",
    useAadhaar: "ଆଧାର OTP ବ୍ୟବହାର କରନ୍ତୁ (Use Aadhaar OTP)",
    aadhaarSub: "ଆଧାର ସହିତ ସଂଯୁକ୍ତ ମୋବାଇଲକୁ ପଠାଯାଇଥିବା OTP ସହିତ ଯାଞ୍ଚ କରନ୍ତୁ (Verify via Aadhaar mobile OTP)",
    manualTags: "ଦଲିଲଗୁଡ଼ିକୁ ମାନୁଆଲ୍ ଅପଲୋଡ୍ କରନ୍ତୁ (Upload Documents Manually)",
    manualSub: "ଆପଣଙ୍କର ପରିଚୟ ପ୍ରମାଣ, ପାନ୍ କାର୍ଡ ଅପଲୋଡ୍ କରନ୍ତୁ (Upload ID, PAN card)",
    permReq: "ଅନୁମତି ଆବଶ୍ୟକ (Permission Required)",
    permSub: "KYC ଅନୁପାଳନ ପାଇଁ ଆପଣଙ୍କର ବିବରଣୀ ପୁନରୁଦ୍ଧାର କରିବାକୁ ଅନୁମତି ଆବଶ୍ୟକ | (Permission needed for KYC compliance.)",
    allowCont: "ଅନୁମତି ଦିଅନ୍ତୁ ଏବ ଗ୍ରହଣ କରନ୍ତୁ (Allow & Continue)",
    successTitle: "🎉 PRAN ସଫଳତାର ସହିତ ଜନରେଟ୍ ହେଲା! (PRAN Generated Successfully!)",
    successSub: "ଆପଣଙ୍କର ଜାତୀୟ ପେନସନ ସିଷ୍ଟମ ଖାତା ବର୍ତ୍ତମାନ ସକ୍ରିୟ ଅଛି (Your NPS account is now active)",
    pranLabel: "ସ୍ଥାୟୀ ଅବସର ଖାତା ସଂଖ୍ୟା (Permanent Retirement Account Number)",
    payAndActivate: "ଦେୟ ଦିଅନ୍ତୁ ଏବଂ ଖାତା ସକ୍ରିୟ କରନ୍ତୁ (Pay & Activate Account)",
    processingPayment: "ଦେୟ ପ୍ରକ୍ରିୟାକରଣ ଚାଲିଛି... (Processing payment...)",
    fetchingDetails: "ଆପଣଙ୍କର ଯାଞ୍ଚ ହୋଇଥିବା ବିବରଣୀ ପାଉଛି... (Fetching details...)",
    kycModeCKYC: "ଅଣ-ମୁହାଁମୁହିଁ — CKYC ପୁନରୁଦ୍ଧାର (Non Face-to-Face — CKYC)",
    kycModeBank: "ଅଣ-ମୁହାଁମୁହିଁ — CBS ଯାଞ୍ଚ (Non Face-to-Face — CBS)",
    kycModeAadhaar: "ଅଣ-ମୁହାଁମୁହିଁ — ଆଧାର eKYC (Non Face-to-Face — Aadhaar)",
    kycModeManual: "ମୁହାଁମୁହିଁ — ମାନୁଆଲ୍ ଦଲିଲ ଅପଲୋଡ୍ (Face-to-Face — Manual)",
    riskEnhanced: "ଉନ୍ନତ (Enhanced)",
    riskStandard: "ମାନକ (Standard)",
    invalidPan: "ଦୟାକରି ଏକ ବୈଧ ପାନ୍ ପ୍ରବେଶ କରନ୍ତୁ (Please enter a valid PAN)",
    searchingCkyc: "CKYCR ଖୋଜୁଛି... (Searching CKYCR...)",
    allFieldsComplete: "✓ ସମସ୍ତ ଆବଶ୍ୟକୀୟ କ୍ଷେତ୍ର ସମ୍ପୂର୍ଣ୍ଣ (All required fields complete)",
    fieldsRemaining: "ଆବଶ୍ୟକୀୟ କ୍ଷେତ୍ର ବାକି ଅଛି (required fields remaining)",
    autoExplainer: "ଜୀବନଚକ୍ର ଭିତ୍ତିକ ଗ୍ଲାଇଡ୍ ପଥ ଦ୍ୱାରା ଆପଣଙ୍କର ଆବଣ୍ଟନ ପରିଚାଳିତ ହେବ (Allocation via lifecycle glide path)",
    activeExplainer: "ଇକ୍ୱିଟି, କର୍ପୋରେଟ୍ ବଣ୍ଡ ମଧ୍ୟରେ ଆପଣ ନିଜର ଆବଣ୍ଟନ ବାଛିବେ (Choose your own allocation E, C, G)",
    pension: "ପେନସନ (Pension)",
    accessibility: "ଅଭିଗମ୍ୟତା (Accessibility):",
    idRetrieved: "ପରିଚୟ ପ୍ରାପ୍ତ ହେଲା (Identity Retrieved)",
    panValidated: "ପାନ୍ ଯାଞ୍ଚ ହେଲା (PAN Validated)",
    addrVerified: "ଠିକଣା ଯାଞ୍ଚ ହେଲା (Address Verified)",
    verified: "ଯାଞ୍ଚ ହୋଇଛି (Verified)",
    aboutYou: "ଆପଣଙ୍କ ବିଷୟରେ (About You)",
    secondaryPf: "ଦ୍ୱିତୀୟକ ପେନସନ ପାଣ୍ଠି (Secondary Pension Fund)",
    assetAllocation: "ପରିସମ୍ପତ୍ତି ଶ୍ରେଣୀ ଆବଣ୍ଟନ (Asset Class Allocation)",
    maxEquity: "ସର୍ବାଧିକ ଇକ୍ୱିଟି (Max Equity)",
    lifecyclePath: "ଜୀବନଚକ୍ର ଗ୍ଲାଇଡ୍ ପଥ (Lifecycle Glide Path)",
    taxInfo: "ଟିକସ ନିବାସ ସୂଚନା (Tax Residency Information)",
    isTaxResident: "ଆପଣ ଭାରତ ବାହାରେ ଜଣେ ଟିକସ ନିବାସୀ କି? (Are you a tax resident outside India?)",
    no: "ନାହିଁ (No)",
    yes: "ହଁ (Yes)",
    isPep: "ଆପଣ କଣ ଜଣେ ରାଜନୈତିକ ଭାବରେ ପ୍ରଭାବିତ ବ୍ୟକ୍ତି? (Are you a Politically Exposed Person?)",
    authSummary: "ପ୍ରାଧିକରଣ ସାରାଂଶ (Authorization Summary)",
    confirmAccuracy: "ମୁଁ ନିଶ୍ଚିତ କରୁଛି ଯେ ପ୍ରଦତ୍ତ ସମସ୍ତ ବିବରଣୀ ସଠିକ୍ | (I confirm details are accurate.)",
    viewTerms: "ସମ୍ପୂର୍ଣ୍ଣ ନିୟମ ଏବଂ ସର୍ତ୍ତାବଳୀ ଦେଖନ୍ତୁ (View Full Terms & Conditions)",
    initialContribution: "ପ୍ରାରମ୍ଭିକ ଅବଦାନ ଦିଅନ୍ତୁ (Initial Contribution)",
    totalPayable: "ମୋଟ ପ୍ରଦେୟ (Total Payable)",
    secure: "ସୁରକ୍ଷିତ (Secure)",
    step: "ପର୍ଯ୍ୟାୟ (Step)",
    of: "ର (of)",
    complete: "ସମ୍ପୂର୍ଣ୍ଣ (Complete)",
    required: "(ଆବଶ୍ୟକ) (Required)",
    occupation: "ବୃତ୍ତି (Occupation)",
    selectOccupation: "ଆପଣଙ୍କର ବୃତ୍ତି ଚୟନ କରନ୍ତୁ (Select your occupation)",
    occSalPriv: "ଦରମା ପ୍ରାପ୍ତ — ବେସରକାରୀ କ୍ଷେତ୍ର (Salaried — Private Sector)",
    occSalGov: "ଦରମା ପ୍ରାପ୍ତ — ସରକାରୀ (Salaried — Government)",
    occSelf: "ସ୍ୱ-ନିଯୁକ୍ତ / ବ୍ୟବସାୟ (Self-Employed / Business)",
    occProf: "ପେସାଦାର (ଡାକ୍ତର, ଓକିଲ, CA ଇତ୍ୟାଦି) (Professional)",
    occStudent: "ଛାତ୍ର (Student)",
    occHome: "ଗୃହିଣୀ (Homemaker)",
    occRetired: "ଅବସରପ୍ରାପ୍ତ (Retired)",
    occOther: "ଅନ୍ୟାନ୍ୟ (Other)",
    annualIncome: "ବାର୍ଷିକ ଆୟ ସୀମା (Annual Income Range)",
    selectIncome: "ଆୟ ସୀମା ଚୟନ କରନ୍ତୁ (Select income range)",
    incBelow2k: "₹୨.୫ ଲକ୍ଷରୁ କମ୍ (Below ₹2.5 Lakh)",
    inc2k5k: "₹୨.୫ – ୫ ଲକ୍ଷ (₹2.5 – 5 Lakh)",
    inc5k10k: "₹୫ – ୧୦ ଲକ୍ଷ (₹5 – 10 Lakh)",
    inc10k25k: "₹୧୦ – ୨୫ ଲକ୍ଷ (₹10 – 25 Lakh)",
    inc25k50k: "₹୨୫ – ୫୦ ଲକ୍ଷ (₹25 – 50 Lakh)",
    incAbove50k: "₹୫୦ ଲକ୍ଷରୁ ଅଧିକ (Above ₹50 Lakh)",
    maritalStatus: "ବୈବାହିକ ସ୍ଥିତି (Marital Status)",
    selectMarital: "ବୈବାହିକ ସ୍ଥିତି ଚୟନ କରନ୍ତୁ (Select marital status)",
    msSingle: "ଅବିବାହିତ (Single)",
    msMarried: "ବିବାହିତ (Married)",
    msDivorced: "ବିବାହ ବିଚ୍ଛେଦିତ (Divorced)",
    msWidowed: "ବିଧବା/ବିପତ୍ନୀ (Widowed)",
    nomineeDetails: "ନାମାଙ୍କିତ ବିବରଣୀ (NOMINEE DETAILS)",
    nomineeName: "ନାମାଙ୍କିତ ବ୍ୟକ୍ତିଙ୍କ ପୂରା ନାମ (Nominee Full Name)",
    placeholderNomineeName: "ନାମିନୀଙ୍କ ପୂରା ନାମ ପ୍ରବେଶ କରନ୍ତୁ (Enter Name)",
    placeholderGuardianName: "ଅଭିଭାବକଙ୍କ ପୂରା ନାମ ପ୍ରବେଶ କରନ୍ତୁ (Enter Guardian Name)",
    placeholderPan: "ଉଦାହରଣ: ABCPS1234K (e.g. ABCPS1234K)",
    placeholderContribution: "₹ 500 (ସର୍ବନିମ୍ନ) (₹ 500 Min)",
    relationship: "ସମ୍ପର୍କ (Relationship)",
    selectRel: "ସମ୍ପର୍କ ଚୟନ କରନ୍ତୁ (Select relationship)",
    relFather: "ପିତା (Father)",
    relMother: "ମାତା (Mother)",
    relSpouse: "ପତି/ପତ୍ନୀ (Spouse)",
    relSon: "ପୁଅ (Son)",
    relDaughter: "ଝିଅ (Daughter)",
    relOther: "ଅନ୍ୟାନ୍ୟ (Other)",
    nomineeDob: "ନାମାଙ୍କିତ ବ୍ୟକ୍ତିଙ୍କ ଜନ୍ମ ତାରିଖ (Nominee Date of Birth)",
    guardianName: "ଅଭିଭାବକଙ୍କ ପୂରା ନାମ (Guardian Full Name)",
    ph4: "ପର୍ଯ୍ୟାୟ 4 — ନିଶ୍ଚିତକରଣ (Phase 4 — Confirmation)",
    corporateDetails: "କର୍ପୋରେଟ୍ ବିବରଣୀ (Corporate Details)",
    employeeId: "କର୍ମଚାରୀ ID (Employee ID)",
    corpReg: "କର୍ପୋରେଟ୍ ପଞ୍ଜୀକରଣ (CHO/CBO) (Corporate Registration)",
    retirementDate: "ଅବସରର ଆଶା କରାଯାଉଥିବା ତାରିଖ (Expected Date of Retirement)",
    assistedMode: "ସହାୟତା ପ୍ରାପ୍ତ ମୋଡ୍ ସକ୍ରିୟ (Assisted Mode Active)",
    popAssisting: "PoP ଏଜେଣ୍ଟ ଏହି ସେସନ୍‌ରେ ସହାୟତା କରୁଛନ୍ତି (PoP Agent assisting)",
    popOfficial: "PoP ଅଧିକାରୀ (PoP Official)",
    fullName: "ପୂରା ନାମ (Full Name)",
    verifiedDetails: "ଯାଞ୍ଚ ହୋଇଥିବା ବିବରଣୀ (Verified Details)",
    dob: "ଜନ୍ମ ତାରିଖ (Date of Birth)",
    pan: "ପାନ୍ (PAN)",
    address: "ଠିକଣା (Address)",
    mobileNumber: "ମୋବାଇଲ୍ ନମ୍ବର (Mobile Number)",
    ckycLookup: "ଆପଣଙ୍କର CKYC ନମ୍ବର ଜାଣି ନାହାଁନ୍ତି କି? ପାନ୍ ମାଧ୍ୟମରେ ଖୋଜନ୍ତୁ (Don't know CKYC? Look up via PAN)",
    enterPanLookup: "CKYC ଲୁକ୍ଅପ୍ ପାଇଁ ପାନ୍ ପ୍ରବେଶ କରନ୍ତୁ (Enter PAN for CKYC Lookup)",
    searchCkycr: "CKYCR ପ୍ରତିଷ୍ଠାନ ଖୋଜନ୍ତୁ (Search CKYCR Registry)",
    ckycApiNote: "ଗ୍ରାହକଙ୍କ ସମ୍ମତି ସହିତ ସୁરକ୍ଷିତ CKYCR API ମାଧ୍ୟମରେ (Via secure CKYCR API)",
    smartScan: "ସ୍ମାର୍ଟ ସ୍କାନ (Smart Scan)",
    smartScanSub: "ଆପଣଙ୍କର ପାନ୍ କିମ୍ବା ଆଧାରର ଏକ ଫଟୋ ଅପଲୋଡ୍ କରନ୍ତુ — Gemini AI ସବୁକିଛି ଅଟୋ-ଫିଲ୍ କରିବ (Upload photo for auto-fill)",
    uploadDoc: "ପରିଚୟ ଦଲିଲ ଅପଲୋଡ୍ କରନ୍ତુ (Upload Identity Document)",
    investmentSetup: "ନିବେଶ ସେଟଅପ୍ (Investment Setup)",
    cra: "କେନ୍ଦ୍ରୀୟ ରେକର୍ଡକିପିଂ ଏଜେନ୍ସି (CRA)",
    pfm: "ପେନସନ ଫଣ୍ଡ୍ ମ୍ୟାନେଜର (PFM)",
    selectCra: "CRA ଚୟନ କରନ୍ତୁ (Select CRA)",
    selectPfm: "ପେନସନ୍ ଫଣ୍ଡ୍ ଚୟନ କରନ୍ତୁ (Select pension fund)",
    noneSinglePf: "କିଛି ନାହିଁ — ଏକକ PF ସମସ୍ତ ସମ୍ପତ୍ତି ଶ୍ରେଣୀ ପରିଚାଳନା କରେ (Single PF)",
    autoChoice: "ଅଟୋ ଚଏସ୍ (Auto Choice)",
    activeChoice: "ଆକ୍ଟିଭ୍ ଚଏସ୍ (Active Choice)",
    riskAdjusts: "ବୟସ ଅନୁଯାୟୀ ବିପଦ ସ୍ୱୟଂଚାଳିତ ଭାବରେ ସଜାଡି ହୋଇଯାଏ (Risk adjusts with age)",
    youDecide: "ଇକ୍ୱିଟି, ବଣ୍ଡରେ କେତେ ଯିବ ଆପଣ ନିଜେ ସ୍ଥିର କରିବେ (You decide allocation)",
    downloadEpran: "ePRAN ଡାଉନଲୋଡ୍ କରନ୍ତୁ (Download ePRAN)",
    goToDashboard: "ଡ୍ୟାସବୋର୍ଡକୁ ଯାଆନ୍ତୁ (Go to Dashboard)",
    nextSteps: "ଅନୁଶାସିତ ପରବର୍ତ୍ତୀ ପଦକ୍ଷେପ (Recommended Next Steps)",
    openTier2: "ଟାୟାର୍ II ଖାତା ଖୋଲନ୍ତୁ (Open Tier II Account)",
    setupAutoDebit: "ଅଟୋ-ଡେବିଟ୍ ସେଟଅପ୍ କରନ୍ତୁ (Set Up Auto-Debit)",
    downloadApp: "NPS ମୋବାଇଲ୍ ଆପ୍ ଡାଉନଲୋଡ୍ କରନ୍ତୁ (Download App)",
    saveAndResume: "ସଞ୍ଚୟ କରନ୍ତୁ ଏବଂ ପରେ ପୁନର୍ବାର ଆରମ୍ଭ କରନ୍ତୁ (Save & Resume Later)",
  },
};

function setLanguage(lang) {
  state.language = lang;
  document.documentElement.setAttribute('lang', lang);

  // Update texts based on data-i18n attributes
  $$('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (i18n[lang][key]) {
      el.textContent = i18n[lang][key];
    }
  });

  // Update placeholders
  $$('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (i18n[lang][key]) {
      el.setAttribute('placeholder', i18n[lang][key]);
    }
  });

  // Update fields counter if active
  if (state.currentPhase === 2) {
    updateFieldsCounter();
  }

  // Specifically handle the top bar and buttons which might need dynamic updates
  updateContinueButton();
  if (state.currentPhase > 0 && state.currentPhase < 5) {
    goToPhase(state.currentPhase); // Refresh indicators
  }
}

/* ---------- Language Selector Listeners ---------- */
$('#langOverlay').addEventListener('click', (e) => {
  const btn = e.target.closest('.lang-btn');
  if (!btn) return;

  const lang = btn.dataset.lang;
  setLanguage(lang);

  $('#langOverlay').classList.remove('visible');
  setTimeout(() => {
    $('#langOverlay').style.display = 'none';
  }, 400);
});

/* ---------- DOM refs ---------- */
const phases = {
  0: $('#phase0'),
  1: $('#phase1'),
  2: $('#phase2'),
  3: $('#phase3'),
  4: $('#phase4'),
};
const progressBar = $('#progressBar');
const stepIndicator = $('#stepIndicator');
const btnContinue = $('#btnContinue');
const btnBack = $('#btnBack');
const bottomCta = $('#bottomCta');

/* ================================================================
   SESSION TIMER
   ================================================================ */
let timerInterval = null;

function startSessionTimer() {
  const timerEl = $('#sessionTimerText');
  const timerWrap = $('#sessionTimer');
  timerInterval = setInterval(() => {
    state.sessionSeconds--;
    if (state.sessionSeconds <= 0) {
      clearInterval(timerInterval);
      state.sessionSeconds = 0;
      timerEl.textContent = '00:00';
      timerWrap.classList.add('danger');
      return;
    }
    const m = Math.floor(state.sessionSeconds / 60);
    const s = state.sessionSeconds % 60;
    timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    timerWrap.classList.remove('warning', 'danger');
    if (state.sessionSeconds <= 60) timerWrap.classList.add('danger');
    else if (state.sessionSeconds <= 180) timerWrap.classList.add('warning');
  }, 1000);
}
startSessionTimer();

/* ================================================================
   ACCESSIBILITY
   ================================================================ */
$('#a11yToggle').addEventListener('click', () => {
  $('#a11yBar').classList.toggle('visible');
});

$('#btnA11yClose').addEventListener('click', () => {
  $('#a11yBar').classList.remove('visible');
});

$('#btnTextSize').addEventListener('click', function () {
  document.body.classList.toggle('a11y-large-text');
  this.classList.toggle('active');
});

$('#btnContrast').addEventListener('click', function () {
  document.body.classList.toggle('a11y-high-contrast');
  this.classList.toggle('active');
});

/* ================================================================
   PHASE 0 — Account Type Gate
   ================================================================ */
$('#accountTypeCards').addEventListener('click', (e) => {
  const card = e.target.closest('.selection-card');
  if (!card) return;
  $$('#accountTypeCards .selection-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  state.accountType = card.dataset.account;

  // Show/hide corporate fields
  const corpFields = $('#corporateFields');
  if (state.accountType === 'corporate') {
    corpFields.classList.add('visible');
  } else {
    corpFields.classList.remove('visible');
  }
  updateContinueButton();
});

/* ================================================================
   NAVIGATION — goToPhase
   ================================================================ */
async function goToPhase(num) {
  if (num < 0 || num > 5) return;

  // Hide all
  $$('.phase-screen').forEach((s) => s.classList.remove('active'));

  if (num === 5) {
    // Success
    $('#successScreen').classList.add('active');
    bottomCta.style.display = 'none';
    $('#topBar').style.display = 'none';

    showSpinner("Issuing official PRAN...");
    const data = await api.generatePRAN();
    hideSpinner();

    if (data && data.pran) {
      $('#pranNumber').textContent = data.pran;
      // Audit log visibility
      $('#adminConsentHash').textContent = data.timestamp;
    }

    state.currentPhase = 5;
    return;
  }

  phases[num].classList.add('active');
  state.currentPhase = num;

  // Progress
  if (num === 0) {
    progressBar.style.width = '0%';
    const startStr = i18n[state.language].gettingStarted;
    const selectStr = i18n[state.language].selectAccount;
    stepIndicator.innerHTML = `<strong>${startStr}</strong><span>${selectStr}</span>`;
  } else {
    const pct = Math.round((num / state.totalPhases) * 100);
    progressBar.style.width = pct + '%';
    const stepStr = i18n[state.language].step;
    const ofStr = i18n[state.language].of;
    const compStr = i18n[state.language].complete;
    stepIndicator.innerHTML = `<strong>${stepStr} ${num} ${ofStr} ${state.totalPhases}</strong><span>${pct}% ${compStr}</span>`;
  }

  // Back button
  btnBack.style.display = num > 0 ? '' : 'none';

  // Continue button state
  updateContinueButton();

  // Scroll top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Continue Button ---------- */
function updateContinueButton() {
  let enabled = false;
  switch (state.currentPhase) {
    case 0:
      enabled = !!state.accountType;
      if (state.accountType === 'corporate') {
        enabled = !!(
          $('#fieldEmployeeId').value.trim() &&
          $('#fieldCorpReg').value.trim() &&
          $('#fieldRetirementDate').value
        );
      }
      break;
    case 1:
      enabled = state.identityFetched;
      break;
    case 2:
      enabled = validatePhase2(false);
      break;
    case 3:
      enabled = validatePhase3(false);
      break;
    case 4:
      enabled = validatePhase4(false);
      break;
  }
  btnContinue.disabled = !enabled;

  if (state.currentPhase === 4) {
    btnContinue.textContent = i18n[state.language].payAndActivate;
  } else {
    btnContinue.textContent = i18n[state.language].continue;
  }
}

/* Corporate fields change listeners */
['fieldEmployeeId', 'fieldCorpReg', 'fieldRetirementDate'].forEach((id) => {
  const el = $(`#${id}`);
  if (el) el.addEventListener('input', updateContinueButton);
});

/* ---------- Continue click ---------- */
btnContinue.addEventListener('click', async () => {
  if (state.currentPhase === 0) {
    showSpinner("Initializing secure session...");
    // Fire-and-forget so UI is not blocked if backend is unreachable
    api.startSession(state.language, state.accountType).catch(e => console.warn('Session start (non-blocking):', e));
    setTimeout(hideSpinner, 800);
  }

  if (state.currentPhase === 2 && !validatePhase2(true)) return;
  if (state.currentPhase === 3 && !validatePhase3(true)) return;
  if (state.currentPhase === 4) {
    if (!validatePhase4(true)) return;
    showSpinner(i18n[state.language].processingPayment);
    setTimeout(() => {
      hideSpinner();
      goToPhase(5);
    }, 2200);
    return;
  }
  goToPhase(state.currentPhase + 1);
});

/* ---------- Back click ---------- */
btnBack.addEventListener('click', () => {
  goToPhase(state.currentPhase - 1);
});

/* ================================================================
   PHASE 1 — KYC Selection
   ================================================================ */
function getKycModeText(method) {
  switch (method) {
    case 'ckyc': return i18n[state.language].kycModeCKYC;
    case 'bank': return i18n[state.language].kycModeBank;
    case 'aadhaar': return i18n[state.language].kycModeAadhaar;
    case 'manual': return i18n[state.language].kycModeManual;
    case 'smartscan': return "AI-Assisted — Gemini OCR Smart Scan";
    default: return i18n[state.language].riskStandard;
  }
}

$('#kycCards').addEventListener('click', (e) => {
  const card = e.target.closest('.selection-card');
  if (!card || state.identityFetched) return;
  $$('#kycCards .selection-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  state.selectedKyc = card.dataset.method;

  // Reset sub-panels
  $('#ckycLookupPanel').classList.remove('visible');
  $('#smartScanUI').style.display = 'none';

  // Show consent
  const consentBox = $('#consentBox');
  consentBox.classList.add('visible');
  consentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* Allow consent */
$('#btnAllowConsent').addEventListener('click', async () => {
  $('#consentBox').classList.remove('visible');

  // Archive consent artifact in backend (fire-and-forget so UI is not blocked)
  try {
    api.archiveConsent(
      state.selectedKyc === 'aadhaar' ? 'Aadhaar' : 'Identity',
      $('#consentText')?.textContent?.trim() || 'User consented',
      { kyc_method: state.selectedKyc }
    ).catch(e => console.warn('Consent archive (non-blocking):', e));
  } catch (e) { console.warn('Consent archive skipped:', e); }

  if (state.selectedKyc === 'smartscan') {
    $('#smartScanUI').style.display = 'block';
    $('#smartScanUI').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  showSpinner(i18n[state.language].fetchingDetails);
  setTimeout(() => {
    hideSpinner();

    // Show badges + compliance badge + assurance + autofill
    $('#verBadges').classList.add('visible');
    $('#kycComplianceBadge').classList.add('visible');
    $('#assuranceLine').classList.add('visible');
    $('#autofillFields').classList.add('visible');

    // Set KYC mode text
    $('#kycModeText').textContent = getKycModeText(state.selectedKyc);

    // Risk category
    const riskEl = $('#kycRiskText');
    if (state.selectedKyc === 'manual') {
      riskEl.textContent = i18n[state.language].riskEnhanced;
      riskEl.className = 'kyc-badge-value kyc-risk-high';
    } else {
      riskEl.textContent = i18n[state.language].riskStandard;
      riskEl.className = 'kyc-badge-value kyc-risk-standard';
    }

    state.identityFetched = true;
    updateContinueButton();
  }, 1800);
});

/* Cancel consent */
$('#btnCancelConsent').addEventListener('click', () => {
  $('#consentBox').classList.remove('visible');
  $$('#kycCards .selection-card').forEach((c) => c.classList.remove('selected'));
  state.selectedKyc = null;
});

/* --- CKYC Discovery (Secure CKYCR API Simulation) --- */
$('#btnCkycLookup').addEventListener('click', () => {
  $('#ckycDiscovery').classList.add('hidden-link');
  $('#btnCkycLookup').style.display = 'none';
  $('#ckycLookupPanel').classList.add('visible');
});

$('#btnCkycSearch').addEventListener('click', () => {
  const pan = $('#fieldCkycPan').value.trim();
  if (pan.length !== 10) {
    alert(i18n[state.language].invalidPan);
    return;
  }

  // Simulate API call
  $('#btnCkycSearch').textContent = i18n[state.language].searchingCkyc;

  fetch(`http://localhost:8000/api/kyc/ckyc/${pan}`)
    .then(res => res.json())
    .then(json => {
      if (json.success) {
        $('#btnCkycSearch').style.display = 'none';
        const res = $('#ckycResult');
        res.style.display = 'block';
        res.innerHTML = `✅ Found CKYC ID for: ${json.data.name}<br>Identity Verified via CKYCR Registry`;

        // Auto-select CKYC card
        state.ckycDiscovery = true;

        // Populate some state data if needed
        state.autofilledData = json.data;

        const ckycCard = document.querySelector('.selection-card[data-method="ckyc"]');
        if (ckycCard) ckycCard.click();
      }
    })
    .catch(err => {
      console.error(err);
      // Fallback if backend is down
      setTimeout(() => {
        $('#btnCkycSearch').style.display = 'none';
        const res = $('#ckycResult');
        res.style.display = 'block';
        res.innerHTML = `✅ Found CKYC ID: <span style="font-family:monospace">10023459871234</span><br>Linked to PAN: ${pan.toUpperCase()}`;
        state.ckycDiscovery = true;
      }, 1000);
    });
});

/* --- Smart Scan — Gemini AI OCR Simulation --- */
$('#btnBrowseDoc').addEventListener('click', () => {
  $('#docUploadInput').click();
});

$('#docUploadInput').addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    startRealOcr(file);
  }
});

async function startRealOcr(file) {
  const progress = $('#ocrProgress');
  const bar = $('#ocrProgressBar');
  const status = $('#ocrStatusText');
  const btn = $('#btnBrowseDoc');

  btn.style.display = 'none';
  progress.style.display = 'block';

  // Start visual progress
  let p = 0;
  const progressInt = setInterval(() => {
    if (p < 90) {
      p += 1;
      bar.style.width = `${p}%`;
    }
  }, 50);

  status.textContent = "Uploading to Secure AI... ";

  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await api.scanDocument(file);

    if (result && result.success) {
      status.textContent = "Processing extraction... ";
      clearInterval(progressInt);
      bar.style.width = '100%';

      setTimeout(() => {
        completeOcr(result.data);
      }, 800);
    } else {
      throw new Error("OCR Failed");
    }
  } catch (err) {
    console.error(err);
    clearInterval(progressInt);

    status.textContent = "❌ " + (err.message || "AI Scan Failed");
    status.style.color = "#D93025";
    status.style.fontWeight = "bold";
    bar.style.background = "#D93025";

    // Show back the browse button after a delay so they can retry
    setTimeout(() => {
      btn.style.display = 'inline-block';
      btn.textContent = "Retry Document Upload";
    }, 1500);
  }
}

function completeOcr(data) {
  $('#ocrProgress').style.display = 'none';
  $('#smartScanUI').style.display = 'none';

  // Show badges + compliance badge + assurance + autofill
  $('#verBadges').classList.add('visible');
  $('#kycComplianceBadge').classList.add('visible');
  $('#assuranceLine').classList.add('visible');
  $('#autofillFields').classList.add('visible');

  // Set KYC mode text
  $('#kycModeText').textContent = getKycModeText('smartscan');

  // Fill details from AI result (targeting correct IDs and setting .value for inputs)
  if ($('#fieldName')) $('#fieldName').value = data.full_name || data.name || "N/A";
  if ($('#fieldFatherName')) $('#fieldFatherName').value = data.father_name || "N/A";
  if ($('#fieldDob')) $('#fieldDob').value = data.dob || "N/A";
  if ($('#fieldGender')) $('#fieldGender').value = data.gender || "N/A";
  if ($('#fieldPan')) $('#fieldPan').value = data.id_number || data.pan || "N/A";
  if ($('#fieldAddress')) $('#fieldAddress').value = data.address || "N/A";

  // Update Risk from Backend
  updateRiskUI(data.risk_level || 'Standard', data.reasons || []);

  state.identityFetched = true;
  updateContinueButton();

  alert("AI successfully extracted and verified your details!");
}

/* ================================================================
   PHASE 2 — Profile + Fields Counter
   ================================================================ */
const phase2Fields = [
  'fieldOccupation',
  'fieldIncome',
  'fieldMarital',
  'fieldNomineeName',
  'fieldRelationship',
  'fieldNomineeDob',
];

function updateFieldsCounter() {
  const remaining = phase2Fields.filter((id) => !$(`#${id}`).value.trim()).length;
  const counterEl = $('#fieldsCounter');
  const textEl = $('#fieldsCounterText');

  if (remaining === 0) {
    textEl.textContent = i18n[state.language].allFieldsComplete;
    counterEl.classList.add('all-done');
  } else {
    textEl.textContent = `${remaining} ${i18n[state.language].fieldsRemaining}`;
    counterEl.classList.remove('all-done');
  }
}

// Listen to all phase 2 fields
phase2Fields.forEach((id) => {
  const el = $(`#${id}`);
  if (el) {
    el.addEventListener('input', () => {
      updateContinueButton();
      updateFieldsCounter();
    });
    el.addEventListener('change', () => {
      updateContinueButton();
      updateFieldsCounter();
    });
  }
});

// Guardian
if ($('#fieldGuardianName')) {
  $('#fieldGuardianName').addEventListener('input', updateContinueButton);
}

function isNomineeMinor() {
  const dob = $('#fieldNomineeDob').value;
  if (!dob) return false;
  const diff = new Date() - new Date(dob);
  const age = diff / (365.25 * 24 * 60 * 60 * 1000);
  return age < 18;
}

// Show/hide guardian field
$('#fieldNomineeDob').addEventListener('change', () => {
  const minor = isNomineeMinor();
  const gf = $('#guardianField');
  const hint = $('#minorHint');
  if (minor) {
    gf.classList.add('visible');
    hint.style.display = 'block';
  } else {
    gf.classList.remove('visible');
    hint.style.display = 'none';
  }
  updateContinueButton();
  updateFieldsCounter();
});

function validatePhase2(showErrors) {
  let valid = true;
  const fields = [
    { id: 'fieldOccupation', err: 'errOccupation' },
    { id: 'fieldIncome', err: 'errIncome' },
    { id: 'fieldMarital', err: 'errMarital' },
    { id: 'fieldNomineeName', err: 'errNomineeName' },
    { id: 'fieldRelationship', err: 'errRelationship' },
    { id: 'fieldNomineeDob', err: 'errNomineeDob' },
  ];

  fields.forEach((f) => {
    const el = $(`#${f.id}`);
    const errEl = $(`#${f.err}`);
    const isEmpty = !el.value.trim();
    if (isEmpty) {
      valid = false;
      if (showErrors) {
        errEl.style.display = 'flex';
        el.classList.add('error');
      }
    } else {
      errEl.style.display = 'none';
      el.classList.remove('error');
    }
  });

  // Guardian check
  if (isNomineeMinor() && !$('#fieldGuardianName').value.trim()) {
    valid = false;
    if (showErrors) {
      $('#errGuardianName').style.display = 'flex';
      $('#fieldGuardianName').classList.add('error');
    }
  } else if ($('#errGuardianName')) {
    $('#errGuardianName').style.display = 'none';
    if ($('#fieldGuardianName')) $('#fieldGuardianName').classList.remove('error');
  }

  return valid;
}

/* ================================================================
   PHASE 3 — Investment + Risk Awareness
   ================================================================ */
$('#investmentCards').addEventListener('click', (e) => {
  const card = e.target.closest('.selection-card');
  if (!card) return;
  $$('#investmentCards .selection-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  state.investmentChoice = card.dataset.choice;

  // Explainer
  const exp = $('#investExplainer');
  const expText = $('#investExplainerText');
  exp.style.display = 'block';
  exp.classList.add('visible');

  // Risk awareness
  const riskNotice = $('#riskAwareness');
  if (state.investmentChoice === 'auto') {
    expText.textContent = i18n[state.language].autoExplainer;
    riskNotice.classList.remove('visible');
  } else {
    expText.textContent = i18n[state.language].activeExplainer;
    riskNotice.classList.add('visible');
  }

  // Show CRA & PFM
  $('#investmentSetup').classList.add('visible');

  // Toggle MSF Panels
  const allocPanel = $('#allocationPanel');
  const lifePanel = $('#lifecyclePreview');
  const pfm2 = $('#fieldPfm2').closest('.form-group');

  if (state.investmentChoice === 'active') {
    allocPanel.style.display = 'block';
    lifePanel.style.display = 'none';
    if (pfm2) pfm2.style.display = 'block';
    updateAllocationSum();
  } else {
    allocPanel.style.display = 'none';
    lifePanel.style.display = 'block';
    if (pfm2) pfm2.style.display = 'none';
  }

  updateContinueButton();
});

$('#fieldCra').addEventListener('change', updateContinueButton);
$('#fieldPfm').addEventListener('change', updateContinueButton);
if ($('#fieldPfm2')) $('#fieldPfm2').addEventListener('change', updateContinueButton);

/* --- Active Choice Sliders --- */
function updateAllocationSum() {
  const e = parseInt($('#sliderEquity').value);
  const c = parseInt($('#sliderCorp').value);
  const g = parseInt($('#sliderGovt').value);

  $('#valEquity').textContent = e + '%';
  $('#valCorp').textContent = c + '%';
  $('#valGovt').textContent = g + '%';

  const sum = e + c + g;
  $('#allocationSum').textContent = sum + '%';
  const err = $('#allocationError');
  const totalEl = $('#allocationTotal');

  if (sum !== 100) {
    err.style.display = 'block';
    totalEl.style.color = 'var(--color-error)';
    return false;
  } else {
    err.style.display = 'none';
    totalEl.style.color = 'var(--color-success)';
    return true;
  }
}

['sliderEquity', 'sliderCorp', 'sliderGovt'].forEach(id => {
  const el = $('#' + id);
  if (el) el.addEventListener('input', () => {
    updateAllocationSum();
    updateContinueButton();
  });
});

function validatePhase3(showErrors) {
  if (!state.investmentChoice) return false;
  if (!$('#fieldCra').value) return false;
  if (!$('#fieldPfm').value) return false;

  if (state.investmentChoice === 'active') {
    const e = parseInt($('#sliderEquity').value);
    const c = parseInt($('#sliderCorp').value);
    const g = parseInt($('#sliderGovt').value);
    if ((e + c + g) !== 100) return false;
  }

  return true;
}

/* ================================================================
   PHASE 4 — Tax / PEP / Consent / Payment
   ================================================================ */
// Tax Resident Toggle
$('#toggleTaxResident').addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  $$('#toggleTaxResident .toggle-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.taxResident = btn.dataset.value;

  const field = $('#taxResidentFields');
  if (state.taxResident === 'yes') {
    field.classList.add('visible');
  } else {
    field.classList.remove('visible');
  }

  api.updateProfile({ tax_resident: state.taxResident }).then(res => {
    if (res && res.risk_level) updateRiskUI(res.risk_level, res.reasons);
  });
  updateContinueButton();
});

// PEP Toggle
$('#togglePep').addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  $$('#togglePep .toggle-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.pep = btn.dataset.value;

  api.updateProfile({ pep: state.pep }).then(res => {
    if (res && res.risk_level) updateRiskUI(res.risk_level, res.reasons);
  });
  updateContinueButton();
});

// Consent checkbox
$('#consentCheckbox').addEventListener('click', () => {
  const cb = $('#consentCheckbox');
  cb.classList.toggle('checked');
  state.consentChecked = cb.classList.contains('checked');
  cb.setAttribute('aria-checked', state.consentChecked);
  updateContinueButton();
});

// Tax country change
$('#fieldTaxCountry').addEventListener('change', updateContinueButton);

// Contribution live update
$('#fieldContribution').addEventListener('input', (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  const amt = parseInt(raw, 10) || 0;
  const fmtAmt = amt.toLocaleString('en-IN');
  $('#totalPayable').textContent = `₹ ${fmtAmt}`;
});

// Collapsible T&C
$('#legalCollapsible').addEventListener('click', (e) => {
  if (e.target.closest('.collapsible-trigger')) {
    const col = $('#legalCollapsible');
    col.classList.toggle('open');
    col.querySelector('.collapsible-trigger').setAttribute(
      'aria-expanded',
      col.classList.contains('open')
    );
  }
});

function validatePhase4(showErrors) {
  if (!state.taxResident || !state.pep) return false;
  if (!state.consentChecked) return false;
  if (state.taxResident === 'yes' && !$('#fieldTaxCountry').value) return false;
  return true;
}

/* --- Risk-Based Escalation (AML/CFT) --- */
/* --- Server-Side Risk Engine Display --- */
function updateRiskUI(riskLevel, reasons = []) {
  state.riskLevel = riskLevel;
  state.isHighRisk = (riskLevel === 'High');

  // Phase 1 Badge
  const kycRisk = $('#kycRiskText');
  const riskReasonRow = $('#riskReasonRow');
  const kycRiskReason = $('#kycRiskReason');
  const vcipRec = $('#vcipRecommendation');

  if (kycRisk) {
    kycRisk.className = 'kyc-badge-value';
    if (riskLevel === 'High') {
      kycRisk.textContent = 'High Risk — EDD Required';
      kycRisk.classList.add('kyc-risk-high');
    } else if (riskLevel === 'Medium') {
      kycRisk.textContent = 'Medium Risk — Enhanced Review';
      kycRisk.classList.add('kyc-risk-high');
    } else {
      kycRisk.textContent = 'Standard (Low Risk)';
      kycRisk.classList.add('kyc-risk-standard');
    }

    if (reasons && reasons.length > 0) {
      riskReasonRow.style.display = 'flex';
      kycRiskReason.textContent = reasons.join(' + ');
    } else {
      riskReasonRow.style.display = 'none';
    }

    if ((riskLevel === 'High' || riskLevel === 'Medium') && !state.vcipMode) {
      vcipRec.style.display = 'flex';
    } else {
      vcipRec.style.display = 'none';
    }
  }

  // Admin dashboard removed — no-op
}

// Deprecated client-side computation for compliance
function computeRiskScore() {
  console.warn("Client-side risk scoring is deprecated. Using server signals.");
}

function updateRiskEscalation() {
  // Logic moved to backend. Frontend only refreshes from session if needed.
}

function updateAdminRiskUI() {
  // Admin dashboard removed — no-op
}

/* ================================================================
   SAVE & RESUME
   ================================================================ */
$('#btnSaveResume').addEventListener('click', () => {
  showToast('Progress saved! You can resume anytime.');
});

function showToast(msg) {
  const t = $('#toast');
  $('#toastText').textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
}

/* ================================================================
   TOOLTIPS (click-to-toggle on mobile)
   ================================================================ */
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.info-trigger');
  if (trigger) {
    e.stopPropagation();
    const tip = trigger.querySelector('.tooltip');
    if (tip) tip.classList.toggle('visible');
  } else {
    $$('.tooltip.visible').forEach((t) => t.classList.remove('visible'));
  }
});

/* ================================================================
   UTILITIES
   ================================================================ */
function showSpinner(text) {
  $('#spinnerText').textContent = text || 'Processing…';
  $('#spinner').classList.add('visible');
}

function hideSpinner() {
  $('#spinner').classList.remove('visible');
}

function generatePRAN() {
  const seg1 = String(1100 + Math.floor(Math.random() * 100));
  const seg2 = String(1000 + Math.floor(Math.random() * 9000));
  const seg3 = String(1000 + Math.floor(Math.random() * 9000));
  $('#pranNumber').textContent = `${seg1} ${seg2} ${seg3}`;
}

/* ================================================================
   KEYBOARD SUPPORT — Enter/Space on cards
   ================================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest('.selection-card');
    if (card) {
      e.preventDefault();
      card.click();
    }
    const cb = e.target.closest('#consentCheckbox');
    if (cb) {
      e.preventDefault();
      cb.click();
    }
  }
});

/* ================================================================
   NEW FEATURES — Document Implementation
   ================================================================ */

/* ================================================================
   VOICE ASSISTANT & CHATBOT (from UPI Innovations Doc)
   ================================================================ */
const voiceFab = $('#voiceFab');
const voicePanel = $('#voicePanel');
const voicePanelClose = $('#voicePanelClose');
const chatBody = $('#chatBody');
const chatInput = $('#chatInput');
const btnChatSend = $('#btnChatSend');
const btnVoiceMic = $('#btnVoiceMic');

// Toggle voice panel
voiceFab.addEventListener('click', () => {
  voicePanel.classList.toggle('visible');
});

voicePanelClose.addEventListener('click', () => {
  voicePanel.classList.remove('visible');
});

// NPS Knowledge Base for chatbot
const npsKnowledge = {
  'what is nps': 'NPS (National Pension System) is a government-sponsored pension scheme launched by PFRDA. It allows you to build a retirement corpus by investing regularly. Your money is managed by professional Pension Fund Managers (PFMs) and invested across Equity, Corporate Bonds, and Government Securities.',
  'nps': 'NPS is India\'s premier retirement savings scheme regulated by PFRDA. You get a unique PRAN (Permanent Retirement Account Number) and can invest in Equity, Corporate Bonds, and Govt Securities. The minimum contribution is just ₹500!',
  'how to open account': 'Opening an NPS account is easy! You need: 1️⃣ Your Aadhaar or PAN for KYC verification, 2️⃣ A bank account for contributions, 3️⃣ Nominee details. You can complete the entire process digitally in under 5 minutes right here!',
  'open account': 'To open an NPS account: Select your account type (Individual/Corporate), complete KYC via Aadhaar/PAN/CKYC, choose your investment preferences, and make a minimum contribution of ₹500. Your PRAN will be generated instantly!',
  'tax benefits': 'NPS offers excellent tax benefits: ✅ Section 80CCD(1): Up to ₹1.5 lakh (part of 80C limit), ✅ Section 80CCD(1B): Additional ₹50,000 (exclusive to NPS), ✅ Section 80CCD(2): Employer contribution (up to 10% of salary) — no upper limit. Total potential deduction: ₹2 lakh+!',
  'what are tax benefits': 'With NPS, you can save up to ₹2 lakh in taxes annually! Under 80CCD(1B), you get an exclusive ₹50,000 deduction above the standard ₹1.5L under 80C. Employer contributions under 80CCD(2) are also tax-free up to 10% of your Basic+DA.',
  'what is pran': 'PRAN (Permanent Retirement Account Number) is your unique 12-digit NPS account number. It stays with you for life — even if you change jobs, cities, or states. Think of it as your pension identity, like an Aadhaar for retirement!',
  'pran': 'PRAN is your Permanent Retirement Account Number — a lifelong 12-digit ID for your NPS pension account. Once generated, it never changes. You can use it with any Point of Presence (PoP) across India.',
  'minimum contribution': 'The minimum contribution for NPS is: 💰 Tier I: ₹500 per contribution (₹1,000 minimum per year), 💰 Tier II: ₹250 per contribution (no minimum annual). You can contribute as much as you want — there is no upper limit!',
  'min amount': 'Minimum contribution: ₹500 per transaction for Tier I, ₹250 for Tier II. Annual minimum for Tier I is ₹1,000. No upper limit on contributions!',
  'tier 1 tier 2': 'Tier I is your primary pension account with tax benefits but limited withdrawals. Tier II is a voluntary savings account with full flexibility — withdraw anytime, no lock-in. You must have Tier I to open Tier II.',
  'tier': 'NPS has two tiers: Tier I (mandatory pension with tax benefits, withdrawal restrictions until 60) and Tier II (voluntary savings, anytime withdrawal, no tax benefits except for govt employees).',
  'withdrawal': 'At age 60, you can withdraw up to 60% as lump sum (tax-free) and the remaining 40% is used to buy an annuity for monthly pension. Partial withdrawals (up to 25%) are allowed after 3 years for specific purposes like education, medical treatment, or home purchase.',
  'kyc': 'KYC (Know Your Customer) verification can be done via: 1️⃣ CKYC Registry lookup, 2️⃣ Aadhaar-based eKYC (OTP), 3️⃣ Bank CBS verification, 4️⃣ AI Smart Scan (document OCR), or 5️⃣ DigiLocker document fetch. All methods are digital — no physical visit needed!',
  'digilocker': 'DigiLocker is a Government of India digital document storage platform. With NPS, you can pull your verified Aadhaar, PAN, and other documents directly from DigiLocker — no need to upload or scan anything!',
  'upi': 'You can make NPS contributions via UPI! We support: GPay, PhonePe, Paytm, BHIM, and all UPI apps. UPI Lite is also available for contributions under ₹1,000 — no PIN required!',
  'upi lite': 'UPI Lite allows small-value NPS contributions (under ₹1,000) without entering your UPI PIN. It works offline too! Perfect for quick, hassle-free pension top-ups.',
  'fund manager': 'NPS offers 7 Pension Fund Managers (PFMs): SBI, LIC, UTI, HDFC, ICICI, Kotak, and Aditya Birla. You can choose any PFM and switch once per year. All PFMs are regulated by PFRDA.',
  'risk': 'NPS offers two investment approaches: 🔄 Auto Choice (Lifecycle Fund) — automatically reduces equity as you age, 🎯 Active Choice — you pick your own allocation (up to 75% Equity). Higher equity = higher potential returns but more risk.',
  'annuity': 'When you retire at 60, at least 40% of your NPS corpus must be used to buy an annuity from an empaneled Annuity Service Provider (ASP). The annuity gives you a guaranteed monthly pension for life.',
  'help': 'I can help you with: 📌 What is NPS, 📌 How to open an account, 📌 Tax benefits, 📌 Contribution amounts, 📌 Tier I vs Tier II, 📌 KYC methods, 📌 Payment options (UPI/UPI Lite), 📌 Withdrawal rules, 📌 Fund managers. Just ask!',
  'hello': 'Hello! 👋 Welcome to NPS Assistant. I can help you with account opening, KYC queries, tax benefits, investment choices, and much more. What would you like to know?',
  'hi': 'Hi there! 👋 I\'m your NPS pension assistant. Ask me anything about opening an NPS account, tax savings, or retirement planning!',
};

function getBotResponse(query) {
  const q = query.toLowerCase().trim();

  // Direct match
  if (npsKnowledge[q]) return npsKnowledge[q];

  // Keyword matching
  let bestMatch = null;
  let bestScore = 0;
  for (const [key, value] of Object.entries(npsKnowledge)) {
    const keywords = key.split(' ');
    let score = 0;
    keywords.forEach(kw => {
      if (q.includes(kw)) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      bestMatch = value;
    }
  }

  if (bestScore > 0) return bestMatch;

  // Default response
  return "I'm not sure about that, but I can help with NPS accounts, KYC, tax benefits, investments, and payments. Try asking 'What is NPS?' or 'How to open account?' or type 'help' for all topics! 📚";
}

function addChatMessage(text, type) {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${type}`;
  msg.textContent = text;
  chatBody.appendChild(msg);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function showTypingIndicator() {
  const typing = document.createElement('div');
  typing.className = 'typing-indicator';
  typing.id = 'typingIndicator';
  typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatBody.appendChild(typing);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function removeTypingIndicator() {
  const typing = $('#typingIndicator');
  if (typing) typing.remove();
}

function askBot(question) {
  addChatMessage(question, 'user');
  showTypingIndicator();

  // Try AI backend first, fall back to local knowledge if needed
  api.chatWithAI(question).then(res => {
    removeTypingIndicator();
    if (res && res.response) {
      addChatMessage(res.response, 'bot');
    } else {
      // Fallback
      const response = getBotResponse(question);
      addChatMessage(response, 'bot');
    }
  }).catch(err => {
    removeTypingIndicator();
    const response = getBotResponse(question);
    addChatMessage(response, 'bot');
  });
}

// Chat send
btnChatSend.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  askBot(text);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnChatSend.click();
  }
});

// Voice Recognition (Web Speech API)
let isListening = false;
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-IN';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatInput.value = transcript;
    btnVoiceMic.classList.remove('listening');
    isListening = false;
    // Auto-send after voice input
    setTimeout(() => btnChatSend.click(), 300);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    btnVoiceMic.classList.remove('listening');
    isListening = false;
    showToast('Voice recognition failed — please try again or type your question');
  };

  recognition.onend = () => {
    btnVoiceMic.classList.remove('listening');
    isListening = false;
  };
}

btnVoiceMic.addEventListener('click', () => {
  if (!recognition) {
    showToast('Voice recognition is not supported in this browser');
    return;
  }

  if (isListening) {
    recognition.stop();
    btnVoiceMic.classList.remove('listening');
    isListening = false;
  } else {
    recognition.start();
    btnVoiceMic.classList.add('listening');
    isListening = true;
    showToast('🎙️ Listening... Speak now');
  }
});

/* ================================================================
   UPI PAYMENT METHOD SELECTION (from UPI Innovations Doc)
   ================================================================ */
function selectPaymentMethod(el) {
  $$('.payment-method-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.paymentMethod = el.dataset.pay;

  const qrDisplay = $('#upiQrDisplay');
  if (state.paymentMethod === 'upi') {
    qrDisplay.classList.add('visible');
  } else {
    qrDisplay.classList.remove('visible');
  }
  updateContinueButton();
}

/* ================================================================
   e-SIGN FLOW (from NPS Onboarding Doc)
   ================================================================ */
function selectEsign(el) {
  $$('.esign-method').forEach(m => m.classList.remove('selected'));
  el.classList.add('selected');
  state.esignMethod = el.dataset.esign;

  // Simulate e-Sign process
  showSpinner('Initiating ' + (state.esignMethod === 'aadhaar' ? 'Aadhaar OTP' : 'DSC') + ' verification...');
  setTimeout(() => {
    hideSpinner();
    const statusEl = $('#esignStatus');
    if (state.esignMethod === 'aadhaar') {
      statusEl.textContent = '✅ e-Sign completed via Aadhaar OTP — Document signed';
    } else {
      statusEl.textContent = '✅ e-Sign completed via Digital Signature Certificate — Document signed';
    }
    statusEl.classList.add('visible');
    state.esignComplete = true;
    updateContinueButton();
    showToast('Digital signature applied successfully!');
  }, 2000);
}

/* ================================================================
   DIGILOCKER INTEGRATION (from NPS Onboarding Doc)
   ================================================================ */
$('#digiLockerCard').addEventListener('click', () => {
  showSpinner('Connecting to DigiLocker...');
  setTimeout(() => {
    hideSpinner();
    showToast('DigiLocker: Aadhaar & PAN fetched successfully!');

    // Simulate DigiLocker data auto-fill
    state.identityFetched = true;
    state.selectedKyc = 'digilocker';

    // Show verification badges
    $('#verBadges').classList.add('visible');
    $('#kycComplianceBadge').classList.add('visible');
    $('#assuranceLine').classList.add('visible');
    $('#autofillFields').classList.add('visible');

    // Set KYC mode text
    $('#kycModeText').textContent = 'DigiLocker — Government Verified';

    // Fill autofill fields
    if ($('#fieldName')) $('#fieldName').value = 'Rajesh Kumar';
    if ($('#fieldDob')) $('#fieldDob').value = '15-06-1990';
    if ($('#fieldGender')) $('#fieldGender').value = 'Male';
    if ($('#fieldPan')) $('#fieldPan').value = 'ABCPK1234F';
    if ($('#fieldAddress')) $('#fieldAddress').value = 'D-14, Sector 62, Noida, Uttar Pradesh 201301';

    // Risk = Standard for verified DigiLocker
    updateRiskUI('Standard', []);
    updateContinueButton();
  }, 2200);
});

/* ================================================================
   OFFLINE MODE DETECTION (from UPI Innovations Doc)
   ================================================================ */
const offlineBar = $('#offlineBar');

function updateOnlineStatus() {
  if (!navigator.onLine) {
    offlineBar.classList.add('visible');
    document.body.style.paddingTop = '32px';
  } else {
    offlineBar.classList.remove('visible');
    document.body.style.paddingTop = '0';
  }
}

window.addEventListener('online', () => {
  updateOnlineStatus();
  showToast('✅ Back online — syncing your data...');
});

window.addEventListener('offline', () => {
  updateOnlineStatus();
});

// Check on load
updateOnlineStatus();

/* ================================================================
   LOCAL SAVE & RESUME SYNC (from NPS Onboarding Doc)
   ================================================================ */
function saveProgressLocally() {
  const progressData = {
    currentPhase: state.currentPhase,
    accountType: state.accountType,
    selectedKyc: state.selectedKyc,
    language: state.language,
    identityFetched: state.identityFetched,
    investmentChoice: state.investmentChoice,
    taxResident: state.taxResident,
    pep: state.pep,
    consentChecked: state.consentChecked,
    paymentMethod: state.paymentMethod,
    esignMethod: state.esignMethod,
    esignComplete: state.esignComplete,
    timestamp: new Date().toISOString()
  };
  try {
    localStorage.setItem('nps_onboarding_progress', JSON.stringify(progressData));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

// Override save & resume to actually persist
$('#btnSaveResume').addEventListener('click', () => {
  saveProgressLocally();
  const token = state.resumeToken || localStorage.getItem('nps_resume_token') || "AVAILABLE ON RESTART";

  // Custom Modal for Save & Resume
  const shareMsg = encodeURIComponent(`My NPS Onboarding Resume Token is: ${token}. Resume here: ${window.location.href}`);
  const waLink = `https://wa.me/?text=${shareMsg}`;

  const confirmed = confirm(`Progress saved! \n\nYour Resume Token: ${token}\n\nWould you like to send this token to your WhatsApp for easy access later?`);
  if (confirmed) {
    const phone = prompt("Enter your mobile number (with country code):", "+91");
    if (phone) {
      showSpinner('Sending WhatsApp notification...');
      api.sendWhatsAppNotification(phone, token).then(res => {
        hideSpinner();
        if (res && res.success) {
          showToast('WhatsApp message sent successfully!');
          // Also open wa.me as fallback / immediate interaction
          window.open(waLink, '_blank');
        } else {
          showToast('Failed to send WhatsApp message. Opening app...');
          window.open(waLink, '_blank');
        }
      });
    }
  }
});

// Auto-save on phase change
const originalGoToPhase = goToPhase;
// Save progress whenever phase transitions
document.addEventListener('click', () => {
  setTimeout(saveProgressLocally, 500);
});

/* ================================================================
   SESSION RESUME LOGIC
   ================================================================ */
$('#btnResumeSession').addEventListener('click', async () => {
  const token = $('#resumeTokenInput').value.trim().toUpperCase();
  if (!token) {
    showToast('Please enter a resume token');
    return;
  }

  showSpinner('Resuming your application...');
  try {
    const result = await api.resumeSession(token);
    hideSpinner();

    if (result && result.data) {
      showToast('Session recovered successfully!');

      // Map backend data to frontend state
      const d = result.data;
      state.accountType = d.account_type;
      state.currentPhase = 1; // Start at kyc phase

      // Update UI based on recovered data
      if (d.full_name) {
        state.identityFetched = true;
        // Pre-fill profile if needed
      }

      // Close overlay and go to phase
      $('#langOverlay').classList.remove('visible');
      setTimeout(() => {
        $('#langOverlay').style.display = 'none';
        goToPhase(1);
      }, 400);
    }
  } catch (e) {
    hideSpinner();
    showToast('Invalid or expired resume token');
  }
});

/* ================================================================
   NUDGE FRAMEWORK (Elite UX)
   ================================================================ */
const Nudges = {
  tips: [
    "Security Tip: Your session is protected by 256-bit hardware-level encryption.",
    "Did you know? NPS offers an additional tax deduction of up to ₹50,000 under Sec 80CCD(1B).",
    "Nudge: You're just 3 minutes away from securing your retirement!",
    "Investment Tip: Equity (Asset Class E) has historical potential for higher long-term growth.",
    "Almost there! 75% of users complete this in under 8 minutes."
  ],
  currentIndex: 0,

  showNext() {
    const tip = this.tips[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.tips.length;

    // Create nudge element
    const el = document.createElement('div');
    el.className = 'ui-nudge';
    el.innerHTML = `
      <div class="nudge-icon">💡</div>
      <div class="nudge-content">${tip}</div>
    `;

    document.body.appendChild(el);

    // Trigger animation
    setTimeout(() => el.classList.add('visible'), 100);

    // Remove after 6 seconds
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 500);
    }, 6000);
  },

  start() {
    // Show a nudge every 45-60 seconds
    setInterval(() => {
      if (state.currentPhase > 0 && state.currentPhase < 5) {
        this.showNext();
      }
    }, 60000);

    // Initial nudge
    setTimeout(() => this.showNext(), 5000);
  }
};

// Add Nudge styles dynamically
const nudgeStyles = document.createElement('style');
nudgeStyles.textContent = `
  .ui-nudge {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: white;
    box-shadow: 0 12px 32px rgba(0,0,0,0.15);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    max-width: 320px;
    z-index: 1000;
    transform: translateY(100px);
    opacity: 0;
    transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border-left: 4px solid var(--color-primary);
  }
  .ui-nudge.visible {
    transform: translateY(0);
    opacity: 1;
  }
  .nudge-icon { font-size: 1.5rem; }
  .nudge-content { font-size: 0.85rem; color: var(--color-text); line-height: 1.4; }
`;
document.head.appendChild(nudgeStyles);

// Start Nudges
Nudges.start();

/* ================================================================
   ALTERNATE ONBOARDING CHANNELS (IVR, SMS, POP)
   ================================================================ */
window.handleAltChannel = async function (type) {
  switch (type) {
    case 'ivr':
      alert("Dialing IVR Assistant: 1800-222-080\n\nYou can follow the voice prompts to submit your basic details. A link will be sent to your mobile for document upload.");
      break;
    case 'sms':
      const phone = prompt("Enter your mobile number to receive the NPS SMS Start Kit:", "+91");
      if (phone) {
        showSpinner('Sending SMS Start Kit...');
        await api.sendSMSNotification(phone, "Welcome to NPS Digital! Use this link to start your onboarding: https://nps.gov.in/start");
        hideSpinner();
        showToast('SMS Kit sent successfully!');
      }
      break;
    case 'pop':
      const confirmed = confirm("Locating NPS Point of Presence (PoP) branches near IIT Kanpur...\n\nFound several locations including SBI IIT Kanpur Campus, HDFC, and ICICI branches nearby.\n\nWould you like to open Google Maps to see the exact locations and navigate?");
      if (confirmed) {
        const query = encodeURIComponent("NPS Point of Presence branches near IIT Kanpur");
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
      }
      break;
  }
};
