/**
 * Red Flag Detector — MADS Pre-Layer (regex, $0, <1ms)
 *
 * Handoff doc Section 18. Runs BEFORE everything else in the bot pipeline —
 * before the smart router, before the LLM classifier, before any booking logic.
 * A red-flag message must NEVER reach a booking flow (Path A: no booking,
 * A&E/GP referral, conversation paused, admin alerted).
 *
 * Patterns are HARDENED vs the handoff doc originals:
 * the doc's patterns only matched "can't move" / "can't breathe" —
 * these also catch "cannot move", "cant move", "couldn't move" etc.
 *
 * v2.3.4 — word-boundary hardening on the trauma/neuro group.
 * Old patterns matched substrings, so benign SG-English like
 * "Handphone number" fired a red flag (hand⊂Handphone, numb⊂number).
 * Boundaries added without recall loss: verified zero regressions on a
 * 30-case emergency corpus, zero false positives on a 19-case benign
 * corpus. 'forearms?' explicitly included so \b doesn't drop it.
 */

const RED_FLAG_PATTERNS = [
  // Trauma + neurological deficit
  /(?:accident|crash|fall|fell|hit my head|whiplash)[\s\S]{0,80}(?:\bnumb(?:ness|ing)?\b|tingl|weak|(?:can'?t|cannot|couldn'?t|can\s*not)\s*move|paralys)/i,
  /\b(?:numb(?:ness|ing)?|tingling)\b[\s\S]{0,80}\b(?:forearms?|arms?|legs?|faces?|one side|hands?|feet|foot|fingers?|toes?)\b/i,
  /\b(?:forearms?|arms?|legs?|faces?|hands?|feet|foot)\b[\s\S]{0,40}(?:\bnumb(?:ness|ing)?\b|\btingling\b|gone weak)/i,

  // Chest / cardiac / breathing
  /(?:chest pain|chest tightness|heart palpitations|shortness of breath|(?:can'?t|cannot|can\s*not)\s*breathe|difficulty breathing)/i,

  // Stroke
  /(?:sudden|severe)[\s\S]{0,40}(?:headache|dizziness|confusion|slurred|vision loss)/i,
  /(?:face[\s\S]{0,15}droop|arm[\s\S]{0,10}weakness|speech[\s\S]{0,10}difficulty|slurred speech)/i,

  // Fracture / dislocation
  /(?:bone sticking out|deformed|(?:can'?t|cannot|can\s*not)\s*bear weight)/i,

  // Pregnancy complications
  /(?:pregnant|pregnancy)[\s\S]{0,60}(?:pain|bleeding|contractions|fall|fell)/i,

  // Post-surgical infection
  /(?:fever|redness|swelling|pus)[\s\S]{0,60}(?:spinal|spine|surgery|injection)/i,

  // Oncological red flags
  /(?:unexplained weight loss|night sweats|constant pain)[\s\S]{0,60}(?:back|neck|spine)/i,
];

// ─── MULTILINGUAL PATTERNS (v2.5.24, audit A-2) ────────────────────
// The English-only pre-layer let zh/ms/ta emergencies fall through to the
// LLM classifier — a MITIGATION, not a guarantee: on classifier error the
// gate fails OPEN to booking (CLASSIFIER_ERROR_PASS), and the heuristic
// fallback is English-only too. The red line must hold at $0 in every
// language a clinic can select. Recall-biased BY DESIGN: Path A is a
// cautious A&E referral, so a false positive costs a careful message —
// a false negative costs a patient. Chinese/Tamil match as substrings
// (no \b semantics); Malay is Latin-script with \b. Mirrors the English
// recall stance (e.g. "pregnant…pain" flags in all four languages).
const RED_FLAG_PATTERNS_MULTILINGUAL = [
  // Malay — chest / cardiac / breathing
  /(?:sakit|sesak|sekat)\s+dada|dada\s+(?:sakit|sesak|sekat)|sesak\s+nafas|sukar\s+bernafas|tak(?:ak)?\s+boleh\s+bernafas|nafas\s+pendek|jantung\s+berdebar/i,
  // Malay — neuro deficit / trauma
  /kebas[\s\S]{0,40}(?:tangan|kaki|muka|badan|sebelah|jari)/i,
  /(?:tangan|kaki|muka|badan|sebelah|jari)[\s\S]{0,40}kebas/i,
  /(?:tak|tidak)\s+boleh\s+(?:gerak|bergerak|bangun|jalan|berdiri)|lumpuh/i,
  /(?:kemalangan|terlanggar|langgar\s+kereta|jatuh|terjatuh)[\s\S]{0,80}(?:kebas|lemah|boleh\s+gerak|patah|berdarah)/i,
  /(?:patah|retak)\s+(?:tulang|kaki|tangan|lengan)|tulang\s+(?:patah|retak|keluar|terkeluar)/i,
  // Malay — stroke
  /muka\s+senget|mulut\s+senget|cakap\s+pelat|pelat\s+cakap|strok|angin\s+ahmar/i,
  /(?:sakit\s+kepala|pening)\s+(?:sangat|teruk|teramat)|migrain\s+teruk/i,
  // Malay — pregnancy complications
  /(?:hamil|mengandung)[\s\S]{0,60}(?:berdarah|pendarahan|darah|sakit\s+perut|sakit|kontraksi|keguguran|jatuh)/i,
  // Malay — post-surgical infection / oncological
  /demam[\s\S]{0,60}(?:suntikan|belakang|tulang|spine|operasi|pembedahan)/i,
  /(?:berat\s+badan\s+turun|peluh\s+malam)[\s\S]{0,60}(?:belakang|tulang|leher)/i,
  /pengsan|pitam\s+teruk/i,

  // Chinese — chest / cardiac / breathing
  /胸痛|胸口痛|胸口闷|胸闷|呼吸困难|喘不过气|不能呼吸|心悸/,
  // Chinese — neuro deficit / trauma
  /(?:手|脚|腿|脸|身体|半边|一边|手指)[\s\S]{0,12}麻|麻木/,
  /不能动|动不了|无法动弹|瘫痪|无力站|站不起来/,
  /(?:车祸|摔倒|跌倒|摔了|跌伤)[\s\S]{0,40}(?:麻|无力|骨折|不能动|出血|疼)/,
  /骨折|骨头突出|不能承重/,
  // Chinese — stroke
  /中风|脸歪|嘴歪|嘴角歪|说话不清|口齿不清|突然(?:剧烈)?头痛|剧烈头痛|突然头晕/,
  // Chinese — pregnancy complications
  /怀孕[\s\S]{0,30}(?:出血|腹痛|宫缩|疼|摔)/,
  // Chinese — faint
  /晕倒|昏厥|突然昏倒/,

  // Tamil — chest / breathing
  /மார்பு வலி|மார்பு அழுத்தம்|மூச்சுத் திணறல்|மூச்சு வராமல்/,
  // Tamil — neuro deficit / trauma
  /உணர்வின்மை|பலவீனம்|அசைக்க முடியவில்லை|நடக்க முடியவில்லை|பக்கவாதம்/,
  /விபத்து|எலும்பு முறிவு/,
  // Tamil — stroke / severe headache / faint
  /திடீர் தலைவலி|கடும் தலைவலி|மயக்கம்/,
  // Tamil — pregnancy complications
  /கர்ப்பம்[\s\S]{0,40}(?:இரத்தப்போக்கு|வயிற்று வலி|வலி)/,
];

/**
 * Path A — strict red flag response (Handoff Section 5.2, verbatim).
 * NO booking offered. NO treatment mentioned. Conversation paused.
 */
const PATH_A_RESPONSE =
  "I'm really sorry to hear you're going through this. That sounds serious, and I want to make sure you get the right care.\n\n" +
  "Because of the symptoms you've described, I'd strongly recommend visiting A&E or your GP immediately to rule out anything serious. Your safety comes first.\n\n" +
  "Once you've been checked and cleared by a medical doctor, we'd be happy to help with follow-up care. Please reply here when you're ready, and we'll get you booked in.";

/**
 * Detect red-flag emergency content in a patient message.
 * @param {string} message
 * @returns {{ isRedFlag: boolean, matchedPattern: string|null }}
 */
// v2.5.24: Path A in every selectable clinic language — an emergency
// message in the patient's OWN language, never a booking offer.
const PATH_A_RESPONSES = {
  en: PATH_A_RESPONSE,
  ms: "Saya amat kesal mendengar apa yang anda lalui. Keadaan itu kedengaran serius, dan saya mahu memastikan anda mendapat rawatan yang betul.\n\n" +
      "Berdasarkan simptom yang anda nyatakan, saya sangat mengesyorkan anda pergi ke Jabatan Kecemasan (A&E) atau klinik GP dengan segera untuk pemeriksaan. Keselamatan anda adalah keutamaan kami.\n\n" +
      "Selepas anda diperiksa dan dibersihkan oleh doktor, kami sedia membantu dengan rawatan susulan. Balas di sini apabila anda sudah bersedia, dan kami akan aturkan temujanji.",
  zh: "听到您的情况我很难过。这听起来比较严重，我希望确保您得到正确的治疗。\n\n" +
      "根据您描述的症状，我强烈建议您立即前往急诊室（A&E）或家庭医生处检查，以排除任何严重问题。您的安全是第一位的。\n\n" +
      "等您经医生检查确认无碍后，我们很乐意为您提供后续护理。准备好后请在这里回复，我们会为您安排预约。",
  ta: "நீங்கள் அனுபவிப்பதைக் கேட்டு மிக்க வருந்துகிறேன். இது தீவிரமாகத் தெரிகிறது, சரியான சிகிச்சையைப் பெறுவதை உறுதி செய்ய விரும்புகிறேன்.\n\n" +
      "நீங்கள் கூறிய அறிகுறிகளின் அடிப்படையில், தீவிரமான எதையும் நிராகரிக்க உடனடியாக அவசரப் பிரிவு (A&E) அல்லது உங்கள் குடும்ப மருத்துவரை அணுக பரிந்துரைக்கிறேன். உங்கள் பாதுகாப்புதான் எங்களுக்கு முதன்மை.\n\n" +
      "மருத்துவர் பரிசோதித்து அனுமதித்த பிறகு, தொடர் சிகிச்சைக்கு நாங்கள் மகிழ்ச்சியுடன் உதவுவோம். நீங்கள் தயாரானதும் இங்கே பதிலளியுங்கள், உங்கள் நேரத்தைப் பதிவு செய்வோம்.",
};

function detectRedFlag(message) {
  if (!message || typeof message !== 'string') {
    return { isRedFlag: false, matchedPattern: null };
  }
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(message)) {
      return { isRedFlag: true, matchedPattern: pattern.source.slice(0, 60) };
    }
  }
  for (const pattern of RED_FLAG_PATTERNS_MULTILINGUAL) {
    if (pattern.test(message)) {
      return { isRedFlag: true, matchedPattern: pattern.source.slice(0, 60) };
    }
  }
  return { isRedFlag: false, matchedPattern: null };
}

module.exports = { detectRedFlag, RED_FLAG_PATTERNS, RED_FLAG_PATTERNS_MULTILINGUAL, PATH_A_RESPONSE, PATH_A_RESPONSES };
