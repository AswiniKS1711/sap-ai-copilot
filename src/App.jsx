import { useState, useRef, useCallback } from "react";

const OPENROUTER_API_KEY = "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";
const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const SAP_GLOSSARY = {
  "ST22": "A screen in SAP where you can see crash reports — like an error log that shows exactly what went wrong and where.",
  "IDOC": "A digital message envelope SAP uses to send data between systems — like an email that carries business data.",
  "WE20": "A settings screen in SAP where you configure who sends/receives IDOCs.",
  "BD87": "A screen where you can see failed IDOCs and try to process them again.",
  "SU53": "A screen that shows exactly which permission a user is missing.",
  "VA01": "The screen used to create a Sales Order in SAP.",
  "VL02N": "The screen used to edit a delivery document in SAP.",
  "VL03N": "The screen used to view a delivery document without editing it.",
  "SM37": "A screen where you can see background jobs and check if they ran successfully.",
  "SM58": "A screen that shows failed RFC calls.",
  "SPRO": "The main configuration screen in SAP — like the settings menu of the entire system.",
  "SLG1": "An application log viewer in SAP.",
  "VT21": "Used to create shipments in SAP Transportation Management.",
  "VT22": "Used to view shipment logs and errors.",
  "ABAP": "SAP's own programming language.",
  "BASIS": "The team/role that manages the SAP system itself.",
  "RFC": "A way for SAP to call functions in another system.",
  "BAPI": "A pre-built function in SAP that lets external systems talk to SAP.",
  "Fiori": "The modern web-based interface of SAP.",
  "S/4HANA": "The latest and most modern version of SAP.",
  "MM": "Materials Management — the SAP module for purchasing and inventory.",
  "SD": "Sales & Distribution — the SAP module for sales orders and deliveries.",
  "FICO": "Finance and Controlling — the SAP module for accounting.",
  "HCM": "Human Capital Management — the SAP module for HR and payroll.",
};

const SYSTEM_PROMPT = `You are SAP AI Co-Pilot, an enterprise-grade AI assistant built ONLY for SAP consulting, SAP support, and SAP system troubleshooting.

Your role is STRICTLY LIMITED to SAP-related domains: SAP ABAP, Basis, Functional Modules (SD, MM, FICO, PP, WM, HCM), S/4HANA, IDOCs, RFCs, BAPIs, Fiori, BW/BI, interfaces, authorization, configuration, transport management, dumps, logs, transaction codes, and enterprise workflows.

If the user asks anything outside SAP scope, respond ONLY with:
"This assistant is specialized exclusively for SAP-related enterprise support and troubleshooting."

When images are provided, carefully scan and extract ALL visible text, error codes, transaction codes, field values, and status indicators.

Always generate responses in EXACTLY FIVE SECTIONS:

==================================================
1. ISSUE EXPLANATION
==================================================
[Technical explanation - what the issue is, what component is involved, why it occurs]

==================================================
2. ROOT CAUSE ANALYSIS
==================================================
[Most likely root cause, alternative causes, SAP objects involved, validation checks]

==================================================
3. RECOMMENDED RESOLUTION STEPS
==================================================
[Numbered step-by-step process with transaction codes, tables, configuration paths]

==================================================
4. CLIENT-READY DOCUMENTATION
==================================================
Issue Summary:
[Short business-friendly summary]

System Impact:
[Business impact description]

Root Cause:
[Professional explanation]

Resolution Steps Taken:
- Step 1
- Step 2
- Step 3

Final Status:
[Closure statement]

Recommendations:
[Preventive recommendation]

==================================================
5. BEGINNER SIMPLE EXPLANATION
==================================================
What happened (in simple words):
[Explain like talking to someone who has never used SAP]

Why it happened:
[Simple reason in plain English]

What needs to be done (step by step for beginners):
[Number each step in simple words]

What this means for the business:
[Plain English business impact]

A simple analogy:
[Compare the issue to something from everyday life]

STRICT RULES:
- NEVER answer outside SAP domain
- NEVER invent SAP transaction codes
- NEVER hallucinate SAP configuration paths
- ALWAYS maintain enterprise consulting tone in sections 1-4
- ALWAYS use plain simple English in section 5`;

const EXAMPLE_PROMPTS = [
  "IDOC failed with status 51 due to partner profile issue",
  "ST22 dump: ASSIGN_TYPE_CONFLICT in custom ABAP program",
  "User getting SU53 authorization error in VA01 transaction",
  "Freight order is not getting created",
  "Background job in SM37 showing cancelled with short dump",
];

function parseResponse(text) {
  const sections = [];
  const sectionRegex = /={40,}\n(\d+\.\s*[^\n]+)\n={40,}([\s\S]*?)(?=={40,}|\s*$)/g;
  let match;
  while ((match = sectionRegex.exec(text)) !== null) {
    sections.push({ title: match[1].trim(), content: match[2].trim() });
  }
  return sections.length === 0 ? null : sections;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function TooltipWord({ word, definition }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline" }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ borderBottom: "2px dashed #0057A8", color: "#0057A8", cursor: "help", fontWeight: "600" }}
      >{word}</span>
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "0",
          background: "#1E2433", color: "#E2E8F0", padding: "8px 12px",
          borderRadius: "6px", fontSize: "12px", lineHeight: "1.5",
          width: "240px", zIndex: 999, fontFamily: "sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", fontWeight: "400", whiteSpace: "normal",
        }}>
          <span style={{ color: "#7EB4EF", fontWeight: "700" }}>{word}:</span> {definition}
        </span>
      )}
    </span>
  );
}

function renderWithTooltips(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  const sortedTerms = Object.keys(SAP_GLOSSARY).sort((a, b) => b.length - a.length);
  while (remaining.length > 0) {
    let earliestIndex = -1;
    let earliestTerm = null;
    for (const term of sortedTerms) {
      const idx = remaining.indexOf(term);
      if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
        earliestIndex = idx;
        earliestTerm = term;
      }
    }
    if (earliestIndex === -1) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (earliestIndex > 0) parts.push(<span key={key++}>{remaining.slice(0, earliestIndex)}</span>);
    parts.push(<TooltipWord key={key++} word={earliestTerm} definition={SAP_GLOSSARY[earliestTerm]} />);
    remaining = remaining.slice(earliestIndex + earliestTerm.length);
  }
  return parts;
}

function SectionCard({ section, index, isVisible, beginnerMode }) {
  const expertColors = ["#0057A8", "#006F5C", "#C8401A", "#5B2D8E"];
  const expertIcons = ["🔍", "🧩", "🛠", "📄"];
  const isBeginnerSection = section.title.includes("5") || section.title.toUpperCase().includes("BEGINNER");
  const color = isBeginnerSection ? "#B45309" : expertColors[index % expertColors.length];
  const icon = isBeginnerSection ? "🎓" : expertIcons[index % expertIcons.length];

  return (
    <div style={{
      background: "#fff", border: `1px solid ${isBeginnerSection ? "#FDE68A" : "#E2E8F0"}`,
      borderRadius: "8px", marginBottom: "16px", overflow: "hidden",
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? "translateY(0)" : "translateY(12px)",
      transition: `opacity 0.4s ease ${index * 0.08}s, transform 0.4s ease ${index * 0.08}s`,
    }}>
      <div style={{ background: color, padding: "12px 20px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "18px" }}>{icon}</span>
        <span style={{ color: "#fff", fontWeight: "700", fontSize: "13px", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "monospace" }}>
          {section.title}
        </span>
        {isBeginnerSection && (
          <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "10px", padding: "2px 8px", borderRadius: "4px", fontFamily: "monospace" }}>
            BEGINNER FRIENDLY
          </span>
        )}
      </div>
      <div style={{ padding: "20px", background: isBeginnerSection ? "#FFFBEB" : "#FAFBFC" }}>
        <pre style={{
          margin: 0, whiteSpace: "pre-wrap",
          fontFamily: isBeginnerSection ? "'Segoe UI', sans-serif" : "'IBM Plex Mono','Courier New',monospace",
          fontSize: isBeginnerSection ? "14px" : "13px",
          lineHeight: isBeginnerSection ? "1.9" : "1.75",
          color: "#1A202C",
        }}>
          {renderWithTooltips(section.content)}
        </pre>
      </div>
    </div>
  );
}

function ImagePreview({ images, onRemove }) {
  if (images.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "12px" }}>
      {images.map((img, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img src={img.preview} alt={img.name} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1.5px solid #CBD5E0", display: "block" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.55)", borderRadius: "0 0 5px 5px", padding: "2px 4px" }}>
            <div style={{ color: "#fff", fontSize: "9px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {img.name.length > 12 ? img.name.slice(0, 10) + "…" : img.name}
            </div>
          </div>
          <button onClick={() => onRemove(i)} style={{ position: "absolute", top: "-7px", right: "-7px", width: "20px", height: "20px", borderRadius: "50%", background: "#E53E3E", border: "2px solid #fff", color: "#fff", fontSize: "11px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function DropZone({ onFiles, isDragging, setIsDragging }) {
  const inputRef = useRef(null);
  return (
    <div
      onClick={() => inputRef.current.click()}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (files.length) onFiles(files); }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      style={{ border: `2px dashed ${isDragging ? "#0057A8" : "#CBD5E0"}`, borderRadius: "8px", padding: "14px 18px", cursor: "pointer", background: isDragging ? "#EBF4FF" : "#F8FAFC", transition: "all 0.2s", display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}
    >
      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: isDragging ? "#0057A8" : "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>📎</div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: "600", color: isDragging ? "#0057A8" : "#374151", fontFamily: "monospace" }}>{isDragging ? "Drop images here" : "Attach SAP screenshots / error logs"}</div>
        <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px", fontFamily: "monospace" }}>Drag & drop · Click to browse · Ctrl+V to paste · PNG, JPG, WEBP (max 5)</div>
      </div>
      <div style={{ marginLeft: "auto", fontSize: "11px", color: "#0057A8", fontFamily: "monospace", fontWeight: "700", whiteSpace: "nowrap" }}>+ ADD IMAGE</div>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => { const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/")); if (files.length) onFiles(files); e.target.value = ""; }} style={{ display: "none" }} />
    </div>
  );
}

function GlossaryPanel({ show, onClose }) {
  if (!show) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "24px", marginBottom: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: "700", color: "#1A202C", fontFamily: "monospace" }}>📖 SAP Glossary</div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "18px", color: "#94A3B8" }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
        {Object.entries(SAP_GLOSSARY).map(([term, def]) => (
          <div key={term} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "10px 14px" }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#0057A8", fontFamily: "monospace", marginBottom: "4px" }}>{term}</div>
            <div style={{ fontSize: "12px", color: "#4A5568", lineHeight: "1.5" }}>{def}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [sections, setSections] = useState(null);
  const [rawResponse, setRawResponse] = useState(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [showGlossary, setShowGlossary] = useState(false);
  const outputRef = useRef(null);

  const handleAddFiles = async (files) => {
    const newImgs = await Promise.all(files.map(async (file) => ({
      file, name: file.name, preview: URL.createObjectURL(file),
      base64: await fileToBase64(file), mediaType: file.type,
    })));
    setImages(prev => [...prev, ...newImgs].slice(0, 5));
  };

  const handleRemoveImage = (idx) => {
    setImages(prev => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  };

  const handlePaste = useCallback((e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith("image/"));
    if (imageItems.length) handleAddFiles(imageItems.map(item => item.getAsFile()).filter(Boolean));
  }, []);

  const canSubmit = (input.trim() || images.length > 0) && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true); setError(null); setRawResponse(null);
    setSections(null); setStreamText(""); setVisible(false);

    const userText = input.trim() || "Please analyze the attached SAP screenshot(s) and identify the issue, root cause, and resolution steps.";

    let userContent;
    if (images.length > 0) {
      userContent = [
        { type: "text", text: userText },
        ...images.map(img => ({
          type: "image_url",
          image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
        })),
      ];
    } else {
      userContent = userText;
    }

    const newHistory = [...history, { role: "user", content: userContent }];

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...newHistory,
          ],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error: ${res.status}`);
      }

      const data = await res.json();
      const fullText = data.choices?.[0]?.message?.content || data.error?.message || "No response received.";
      setHistory([...newHistory, { role: "assistant", content: fullText }]);
      setInput(""); setImages([]);

      let i = 0;
      const tick = setInterval(() => {
        i += 10;
        setStreamText(fullText.slice(0, i));
        if (i >= fullText.length) {
          clearInterval(tick);
          setStreamText(fullText);
          const parsed = parseResponse(fullText);
          setSections(parsed); setRawResponse(parsed ? null : fullText);
          setTimeout(() => setVisible(true), 80);
          setLoading(false);
        }
      }, 12);
    } catch (e) {
      setError(e.message); setLoading(false);
    }
    setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  };

  const handleClear = () => {
    setInput(""); setImages([]); setRawResponse(null);
    setSections(null); setStreamText(""); setHistory([]);
    setError(null); setVisible(false);
  };

  const handleCopy = () => {
    const text = sections ? sections.map(s => `== ${s.title} ==\n${s.content}`).join("\n\n") : streamText;
    navigator.clipboard.writeText(text);
  };

  const sessionCount = Math.floor(history.length / 2);

  return (
    <div onPaste={handlePaste} style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "'Segoe UI', sans-serif" }}>

      <div style={{ background: "#0F1621", borderBottom: "2px solid #0057A8" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "18px 0", flexWrap: "wrap" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "#0057A8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "800", color: "#fff", fontFamily: "monospace", flexShrink: 0 }}>S</div>
            <div>
              <div style={{ color: "#fff", fontWeight: "700", fontSize: "18px" }}>SAP AI Co-Pilot</div>
              <div style={{ color: "#64748B", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace" }}>Enterprise Support & Troubleshooting</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["S/4HANA", "ABAP", "BASIS", "IDOCs"].map(tag => (
                <span key={tag} style={{ background: "rgba(0,87,168,0.25)", color: "#7EB4EF", border: "1px solid rgba(0,87,168,0.5)", borderRadius: "4px", padding: "3px 8px", fontSize: "11px", fontFamily: "monospace", fontWeight: "600" }}>{tag}</span>
              ))}
              <span style={{ background: "rgba(16,185,129,0.2)", color: "#6EE7B7", border: "1px solid rgba(16,185,129,0.5)", borderRadius: "4px", padding: "3px 8px", fontSize: "11px", fontFamily: "monospace", fontWeight: "600" }}>🖼 Vision</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: beginnerMode ? "#FFFBEB" : "#EFF6FF", borderBottom: `2px solid ${beginnerMode ? "#F59E0B" : "#3B82F6"}` }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: beginnerMode ? "#92400E" : "#1E40AF" }}>
            {beginnerMode ? "🎓 Beginner Mode" : "💼 Expert Mode"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button onClick={() => setBeginnerMode(true)} style={{ background: beginnerMode ? "#F59E0B" : "transparent", color: beginnerMode ? "#fff" : "#92400E", border: "1.5px solid #F59E0B", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>🎓 Beginner</button>
            <button onClick={() => setBeginnerMode(false)} style={{ background: !beginnerMode ? "#3B82F6" : "transparent", color: !beginnerMode ? "#fff" : "#1E40AF", border: "1.5px solid #3B82F6", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>💼 Expert</button>
            <button onClick={() => setShowGlossary(v => !v)} style={{ background: "transparent", color: "#0057A8", border: "1.5px solid #0057A8", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>📖 Glossary</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "28px 24px" }}>

        <GlossaryPanel show={showGlossary} onClose={() => setShowGlossary(false)} />

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "24px", marginBottom: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#0057A8", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: "10px" }}>
            📋 Describe Your SAP Issue
          </label>
          {beginnerMode && (
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: "#1E40AF" }}>
              💡 Just describe your problem in plain English — no SAP terminology needed!
            </div>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
            placeholder="Describe the problem in your own words, or paste an error log..."
            style={{ width: "100%", minHeight: "110px", padding: "14px", border: "1.5px solid #CBD5E0", borderRadius: "6px", fontFamily: "'Segoe UI', sans-serif", fontSize: "13px", lineHeight: "1.7", color: "#1A202C", background: "#FAFBFC", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "#0057A8"}
            onBlur={e => e.target.style.borderColor = "#CBD5E0"}
          />

          <ImagePreview images={images} onRemove={handleRemoveImage} />
          <DropZone onFiles={handleAddFiles} isDragging={isDragging} setIsDragging={setIsDragging} />

          {images.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "6px", padding: "8px 12px" }}>
              <span>🖼</span>
              <span style={{ fontSize: "12px", color: "#166534", fontFamily: "monospace", fontWeight: "600" }}>
                {images.length} image{images.length > 1 ? "s" : ""} attached
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={handleSubmit} disabled={!canSubmit} style={{ background: !canSubmit ? "#94A3B8" : images.length > 0 ? "#006F5C" : "#0057A8", color: "#fff", border: "none", borderRadius: "6px", padding: "10px 24px", fontWeight: "700", fontSize: "13px", fontFamily: "monospace", cursor: !canSubmit ? "not-allowed" : "pointer" }}>
              {loading ? "⚙ Analyzing..." : images.length > 0 ? "🖼 Scan & Analyze" : "⚡ Analyze SAP Issue"}
            </button>
            {(sections || rawResponse || streamText) && (
              <>
                <button onClick={handleCopy} style={{ background: "transparent", color: "#0057A8", border: "1.5px solid #0057A8", borderRadius: "6px", padding: "9px 18px", fontWeight: "600", fontSize: "12px", fontFamily: "monospace", cursor: "pointer" }}>📋 Copy</button>
                <button onClick={handleClear} style={{ background: "transparent", color: "#64748B", border: "1.5px solid #CBD5E0", borderRadius: "6px", padding: "9px 18px", fontWeight: "600", fontSize: "12px", fontFamily: "monospace", cursor: "pointer" }}>✕ Clear</button>
              </>
            )}
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>Ctrl+Enter to submit</span>
          </div>
        </div>

        {!sections && !rawResponse && !streamText && !loading && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: "10px" }}>Try an example</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => setInput(p)} style={{ background: "#EEF2FF", color: "#3730A3", border: "1px solid #C7D2FE", borderRadius: "6px", padding: "7px 14px", fontSize: "12px", fontFamily: "monospace", cursor: "pointer" }}>
                  {p.length > 52 ? p.slice(0, 52) + "…" : p}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && !streamText && (
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "36px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "12px" }}>⚙</div>
            <div style={{ color: "#0057A8", fontWeight: "700", fontSize: "14px", fontFamily: "monospace" }}>Analyzing your SAP issue...</div>
          </div>
        )}

        {loading && streamText && (
          <div ref={outputRef} style={{ background: "#1E2433", border: "1px solid #2D3748", borderRadius: "10px", padding: "24px" }}>
            <div style={{ color: "#4ADE80", fontSize: "11px", fontFamily: "monospace", fontWeight: "700", letterSpacing: "0.1em", marginBottom: "12px" }}>▶ STREAMING RESPONSE...</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Mono',monospace", fontSize: "13px", lineHeight: "1.75", color: "#CBD5E0" }}>{streamText}</pre>
          </div>
        )}

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "16px 20px", color: "#991B1B", fontFamily: "monospace", fontSize: "13px" }}>⚠ {error}</div>
        )}

        {!loading && sections && (
          <div ref={outputRef}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{ height: "1px", flex: 1, background: "#E2E8F0" }} />
              <span style={{ fontSize: "11px", color: "#64748B", fontFamily: "monospace", fontWeight: "700", letterSpacing: "0.1em" }}>ANALYSIS COMPLETE</span>
              <div style={{ height: "1px", flex: 1, background: "#E2E8F0" }} />
            </div>
            {beginnerMode ? (
              sections.filter(s => s.title.includes("5") || s.title.toUpperCase().includes("BEGINNER")).map((s, i) => (
                <SectionCard key={i} section={s} index={4} isVisible={visible} beginnerMode={beginnerMode} />
              ))
            ) : (
              sections.filter(s => !s.title.includes("5") && !s.title.toUpperCase().includes("BEGINNER")).map((s, i) => (
                <SectionCard key={i} section={s} index={i} isVisible={visible} beginnerMode={beginnerMode} />
              ))
            )}
          </div>
        )}

        {!loading && rawResponse && (
          <div ref={outputRef} style={{ background: "#1E2433", border: "1px solid #2D3748", borderRadius: "8px", padding: "20px" }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Mono',monospace", fontSize: "13px", lineHeight: "1.75", color: "#A0AEC0" }}>{rawResponse}</pre>
          </div>
        )}

        {sessionCount > 0 && (
          <div style={{ textAlign: "center", marginTop: "16px" }}>
            <span style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>🗂 {sessionCount} issue{sessionCount > 1 ? "s" : ""} analyzed this session</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid #E2E8F0", background: "#fff", padding: "16px 24px", textAlign: "center" }}>
        <span style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>SAP AI Co-Pilot · DPM Final Project</span>
      </div>
    </div>
  );
}
